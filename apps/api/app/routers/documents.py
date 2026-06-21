from datetime import timezone
from pathlib import Path
import os
import platform
import subprocess
from typing import List, Optional
from urllib.error import HTTPError, URLError
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.datetime_utils import to_utc_iso
from app.core.paths import get_project_root
from app.core.db import get_db_session
from app.models.documents import Document
from app.repositories.documents import (
    create_document,
    delete_document_record,
    get_document,
    list_document_chunks,
    list_documents,
    update_document_knowledge_base,
)
from app.repositories.knowledge_bases import get_knowledge_base, utc_now
from app.schemas.documents import (
    DocumentBatchMoveRequest,
    DocumentBatchMoveResponse,
    DocumentLinkImportRequest,
    DocumentResponse,
    DocumentSingleUrlImportRequest,
    DocumentUploadFailure,
    DocumentUploadResponse,
    DocumentUploadSuccess,
)
from app.schemas.knowledge_bases import DeleteResponse
from app.services.document_uploads import build_storage_path, detect_file_type, guess_mime_type
from app.services.document_indexing import parse_and_index_document
from app.services.vector_store import delete_document_vectors
from app.services.web_imports import build_fetch_candidates, fetch_webpage, normalize_url

router = APIRouter(prefix="/documents", tags=["documents"])


def import_urls_to_documents(
    knowledge_base_id: str,
    urls: List[str],
    session: Session,
) -> DocumentUploadResponse:
    knowledge_base = get_knowledge_base(session, knowledge_base_id)
    if knowledge_base is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge base not found.")

    success_items: List[DocumentUploadSuccess] = []
    failed_items: List[DocumentUploadFailure] = []

    for raw_url in urls:
        try:
            normalized_url = normalize_url(raw_url)
            fetch_error: Optional[Exception] = None
            final_url = normalized_url
            title = normalized_url
            mime_type = "text/html"
            preview_text = ""
            for candidate_url in build_fetch_candidates(raw_url):
                try:
                    title, mime_type, preview_text = fetch_webpage(candidate_url)
                    final_url = candidate_url
                    fetch_error = None
                    break
                except Exception as candidate_exc:
                    fetch_error = candidate_exc
            if fetch_error is not None:
                raise fetch_error
            now = utc_now()
            document = Document(
                id=str(uuid4()),
                knowledge_base_id=knowledge_base_id,
                name=title,
                source_type="url",
                file_type="html",
                mime_type=mime_type,
                source_url=final_url,
                original_path=None,
                storage_path=final_url,
                file_size=len(preview_text.encode("utf-8")),
                checksum=None,
                parse_status="pending",
                parse_error=None,
                preview_text=preview_text,
                summary_text=None,
                page_count=None,
                retry_count=0,
                last_parsed_at=None,
                metadata_json=None,
                created_at=now,
                updated_at=now,
            )
            create_document(session, document)
            try:
                document = parse_and_index_document(document, session)
            except Exception:
                document = get_document(session, document.id) or document
            success_items.append(
                DocumentUploadSuccess(
                    file_name=final_url,
                    document_id=document.id,
                    parse_status=document.parse_status,
                )
            )
        except Exception as exc:
            if isinstance(exc, HTTPError):
                if exc.code == 403:
                    reason = "Target site denied automated access (HTTP 403)."
                else:
                    reason = f"HTTP Error {exc.code}: {exc.reason}"
            elif isinstance(exc, URLError):
                reason = str(exc.reason)
            else:
                reason = str(exc)
            failed_items.append(DocumentUploadFailure(file_name=raw_url, reason=reason))

    knowledge_base.updated_at = utc_now()
    session.add(knowledge_base)
    session.commit()

    return DocumentUploadResponse(
        knowledge_base_id=knowledge_base_id,
        success=success_items,
        failed=failed_items,
    )


def serialize_document(document: Document) -> DocumentResponse:
    return DocumentResponse(
        id=document.id,
        knowledge_base_id=document.knowledge_base_id,
        name=document.name,
        source_type=document.source_type,
        file_type=document.file_type,
        mime_type=document.mime_type,
        source_url=document.source_url,
        storage_path=document.storage_path,
        file_size=document.file_size,
        parse_status=document.parse_status,
        parse_error=document.parse_error,
        preview_text=document.preview_text,
        summary_text=document.summary_text,
        page_count=document.page_count,
        retry_count=document.retry_count,
        created_at=to_utc_iso(document.created_at),
        updated_at=to_utc_iso(document.updated_at),
    )


@router.get("", response_model=List[DocumentResponse])
def get_documents(
    knowledge_base_id: Optional[str] = Query(default=None),
    parse_status: Optional[str] = Query(default=None),
    session: Session = Depends(get_db_session),
) -> List[DocumentResponse]:
    if knowledge_base_id is not None:
        knowledge_base = get_knowledge_base(session, knowledge_base_id)
        if knowledge_base is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge base not found.")
        knowledge_base.last_opened_at = utc_now()
        session.add(knowledge_base)
        session.commit()
    return [serialize_document(document) for document in list_documents(session, knowledge_base_id, parse_status)]


@router.get("/{document_id}", response_model=DocumentResponse)
def get_document_detail(document_id: str, session: Session = Depends(get_db_session)) -> DocumentResponse:
    document = get_document(session, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    return serialize_document(document)


def resolve_document_path(document: Document) -> Path:
    path = get_project_root() / document.storage_path
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stored file not found.")
    return path


def resolve_document_path_if_exists(document: Document) -> Optional[Path]:
    path = get_project_root() / document.storage_path
    if not path.exists() or not path.is_file():
        return None
    return path


def open_file_with_system_default(file_path: Path) -> None:
    current_platform = platform.system()
    if current_platform == "Darwin":
        subprocess.Popen(["open", str(file_path)])
        return
    if current_platform == "Windows":
        os.startfile(str(file_path))  # type: ignore[attr-defined]
        return
    if current_platform == "Linux":
        subprocess.Popen(["xdg-open", str(file_path)])
        return
    raise RuntimeError(f"Unsupported platform: {current_platform}")


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_documents(
    knowledge_base_id: str = Form(...),
    files: List[UploadFile] = File(...),
    session: Session = Depends(get_db_session),
) -> DocumentUploadResponse:
    knowledge_base = get_knowledge_base(session, knowledge_base_id)
    if knowledge_base is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge base not found.")

    success_items: List[DocumentUploadSuccess] = []
    failed_items: List[DocumentUploadFailure] = []

    for upload_file in files:
        raw_name = upload_file.filename or "unnamed"
        file_type = detect_file_type(raw_name)
        if file_type is None:
            failed_items.append(DocumentUploadFailure(file_name=raw_name, reason="Unsupported file type."))
            continue

        content = await upload_file.read()
        if not content:
            failed_items.append(DocumentUploadFailure(file_name=raw_name, reason="Empty file is not allowed."))
            continue

        absolute_path, relative_path = build_storage_path(knowledge_base.name, raw_name)
        absolute_path.write_bytes(content)

        now = utc_now()
        document = Document(
            id=str(uuid4()),
            knowledge_base_id=knowledge_base_id,
            name=Path(raw_name).name,
            source_type="file",
            file_type=file_type,
            mime_type=guess_mime_type(raw_name, upload_file),
            source_url=None,
            original_path=None,
            storage_path=relative_path,
            file_size=len(content),
            checksum=None,
            parse_status="pending",
            parse_error=None,
            preview_text=None,
            summary_text=None,
            page_count=None,
            retry_count=0,
            last_parsed_at=None,
            metadata_json=None,
            created_at=now,
            updated_at=now,
        )
        create_document(session, document)
        try:
            document = parse_and_index_document(document, session)
        except Exception:
            document = get_document(session, document.id) or document
        success_items.append(
            DocumentUploadSuccess(
                file_name=raw_name,
                document_id=document.id,
                parse_status=document.parse_status,
            )
        )

    knowledge_base.updated_at = utc_now()
    session.add(knowledge_base)
    session.commit()

    return DocumentUploadResponse(
        knowledge_base_id=knowledge_base_id,
        success=success_items,
        failed=failed_items,
    )


@router.post("/import-url", response_model=DocumentUploadResponse)
def import_document_url(
    payload: DocumentSingleUrlImportRequest,
    session: Session = Depends(get_db_session),
) -> DocumentUploadResponse:
    return import_urls_to_documents(payload.knowledge_base_id, [payload.url], session)


@router.post("/import-urls", response_model=DocumentUploadResponse)
def import_document_urls(
    payload: DocumentLinkImportRequest,
    session: Session = Depends(get_db_session),
) -> DocumentUploadResponse:
    return import_urls_to_documents(payload.knowledge_base_id, payload.urls, session)


@router.post("/import-links", response_model=DocumentUploadResponse)
def import_document_links_legacy(
    payload: DocumentLinkImportRequest,
    session: Session = Depends(get_db_session),
) -> DocumentUploadResponse:
    return import_urls_to_documents(payload.knowledge_base_id, payload.urls, session)


@router.post("/move", response_model=DocumentBatchMoveResponse)
def move_documents_between_knowledge_bases(
    payload: DocumentBatchMoveRequest,
    session: Session = Depends(get_db_session),
) -> DocumentBatchMoveResponse:
    target_knowledge_base = get_knowledge_base(session, payload.target_knowledge_base_id)
    if target_knowledge_base is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target knowledge base not found.")

    moved_ids: List[str] = []

    for document_id in payload.document_ids:
        document = get_document(session, document_id)
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Document not found: {document_id}")
        if document.knowledge_base_id == payload.target_knowledge_base_id:
            moved_ids.append(document_id)
            continue

        updated_document = update_document_knowledge_base(session, document_id, payload.target_knowledge_base_id)
        if updated_document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Document not found: {document_id}")

        delete_document_vectors(document_id)
        chunks = list_document_chunks(session, document_id)
        sync_document_vectors(
            knowledge_base_name=target_knowledge_base.name,
            document_name=updated_document.name,
            document_id=updated_document.id,
            knowledge_base_id=payload.target_knowledge_base_id,
            chunks=chunks,
        )
        moved_ids.append(document_id)

    target_knowledge_base.updated_at = utc_now()
    session.add(target_knowledge_base)
    session.commit()

    return DocumentBatchMoveResponse(
        success=True,
        moved_ids=moved_ids,
        target_knowledge_base_id=payload.target_knowledge_base_id,
    )


@router.get("/{document_id}/open")
def open_document_file(document_id: str, session: Session = Depends(get_db_session)) -> FileResponse:
    document = get_document(session, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    if document.source_type == "url":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="URL documents should be opened by source URL.")
    file_path = resolve_document_path(document)
    return FileResponse(
        path=file_path,
        media_type=document.mime_type,
        filename=document.name,
        content_disposition_type="inline",
    )


@router.post("/{document_id}/open-local")
def open_document_file_locally(document_id: str, session: Session = Depends(get_db_session)) -> dict:
    document = get_document(session, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    if document.source_type == "url":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="URL documents should be opened by source URL.")

    file_path = resolve_document_path(document)
    try:
        open_file_with_system_default(file_path)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    return {
        "success": True,
        "document_id": document.id,
        "path": str(file_path),
    }


@router.get("/{document_id}/download")
def download_document_file(document_id: str, session: Session = Depends(get_db_session)) -> FileResponse:
    document = get_document(session, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    if document.source_type == "url":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="URL documents cannot be downloaded as local files.")
    file_path = resolve_document_path(document)
    return FileResponse(
        path=file_path,
        media_type=document.mime_type,
        filename=document.name,
        content_disposition_type="attachment",
    )


@router.delete("/{document_id}", response_model=DeleteResponse)
def delete_document(document_id: str, session: Session = Depends(get_db_session)) -> DeleteResponse:
    document = get_document(session, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    file_path: Optional[Path] = None
    if document.source_type != "url":
        file_path = resolve_document_path_if_exists(document)

    deleted = delete_document_record(session, document_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    delete_document_vectors(document_id)

    if file_path is not None and file_path.exists():
        try:
            file_path.unlink()
        except OSError:
            pass

    return DeleteResponse(success=True, deleted_id=document_id)


@router.post("/{document_id}/index", response_model=DocumentResponse)
def index_document(document_id: str, session: Session = Depends(get_db_session)) -> DocumentResponse:
    document = get_document(session, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    try:
        parsed_document = parse_and_index_document(document, session)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    return serialize_document(parsed_document)


@router.post("/{document_id}/retry-parse", response_model=DocumentResponse)
def retry_parse_document(document_id: str, session: Session = Depends(get_db_session)) -> DocumentResponse:
    document = get_document(session, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    document.retry_count = (document.retry_count or 0) + 1
    document.updated_at = utc_now()
    session.add(document)
    session.commit()
    try:
        parsed_document = parse_and_index_document(document, session)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    return serialize_document(parsed_document)
