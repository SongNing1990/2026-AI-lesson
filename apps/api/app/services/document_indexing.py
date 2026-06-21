from pathlib import Path
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.core.paths import get_project_root
from app.models.documents import Document
from app.repositories.documents import list_document_chunks, list_documents, replace_document_chunks
from app.repositories.knowledge_bases import get_knowledge_base, utc_now
from app.services.document_parsers import (
    build_preview_text,
    build_summary_placeholder,
    chunk_segments,
    load_text_from_document,
)
from app.services.vector_store import delete_knowledge_base_vectors, sync_document_vectors


def parse_and_index_document(document: Document, session: Session) -> Document:
    document.parse_status = "processing"
    document.parse_error = None
    session.add(document)
    session.commit()

    try:
        segments = load_text_from_document(document, get_project_root())
        document.preview_text = build_preview_text(segments)
        document.summary_text = build_summary_placeholder(segments) or None
        document.page_count = len({segment.page_number for segment in segments if segment.page_number is not None}) or None
        chunks = chunk_segments(document, segments)
        replace_document_chunks(session, document.id, chunks)
        knowledge_base = get_knowledge_base(session, document.knowledge_base_id)
        if knowledge_base is not None:
            sync_document_vectors(
                knowledge_base_name=knowledge_base.name,
                document_name=document.name,
                document_id=document.id,
                knowledge_base_id=document.knowledge_base_id,
                chunks=chunks,
            )
        document.parse_status = "done"
        document.parse_error = None
        document.last_parsed_at = utc_now()
        document.updated_at = utc_now()
        session.add(document)
        session.commit()
        session.refresh(document)
        return document
    except Exception as exc:
        document.parse_status = "failed"
        document.parse_error = str(exc)
        document.updated_at = utc_now()
        session.add(document)
        session.commit()
        session.refresh(document)
        raise


def reindex_knowledge_base_documents(knowledge_base_id: str, session: Session) -> Dict[str, Any]:
    knowledge_base = get_knowledge_base(session, knowledge_base_id)
    if knowledge_base is None:
        raise ValueError("Knowledge base not found.")

    documents = list_documents(session, knowledge_base_id=knowledge_base_id)
    delete_knowledge_base_vectors(knowledge_base_id)

    reindexed_document_ids: List[str] = []
    failed_documents: List[Dict[str, str]] = []
    total_chunks = 0

    for document in documents:
        try:
            parsed_document = parse_and_index_document(document, session)
            total_chunks += len(list_document_chunks(session, parsed_document.id))
            reindexed_document_ids.append(parsed_document.id)
        except Exception as exc:
            failed_documents.append(
                {
                    "document_id": document.id,
                    "document_name": document.name,
                    "reason": str(exc),
                }
            )

    knowledge_base.updated_at = utc_now()
    session.add(knowledge_base)
    session.commit()

    return {
        "knowledge_base_id": knowledge_base_id,
        "knowledge_base_name": knowledge_base.name,
        "total_documents": len(documents),
        "reindexed_documents": len(reindexed_document_ids),
        "failed_documents": failed_documents,
        "total_chunks": total_chunks,
    }
