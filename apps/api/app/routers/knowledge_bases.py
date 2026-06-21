from datetime import timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.datetime_utils import to_utc_iso
from app.core.db import get_db_session
from app.models.knowledge_bases import KnowledgeBase
from app.repositories.knowledge_bases import (
    delete_knowledge_base_records,
    get_knowledge_base,
    get_knowledge_base_with_document_count,
    list_knowledge_bases,
    list_recent_knowledge_bases,
    utc_now,
)
from app.services.document_indexing import reindex_knowledge_base_documents
from app.schemas.knowledge_bases import (
    DeleteResponse,
    KnowledgeBaseCreate,
    KnowledgeBaseReindexResponse,
    KnowledgeBaseResponse,
    KnowledgeBaseUpdate,
)

router = APIRouter(prefix="/knowledge-bases", tags=["knowledge_bases"])


def serialize_knowledge_base(item: tuple[KnowledgeBase, int]) -> KnowledgeBaseResponse:
    knowledge_base, document_count = item
    return KnowledgeBaseResponse(
        id=knowledge_base.id,
        name=knowledge_base.name,
        description=knowledge_base.description,
        color=knowledge_base.color,
        document_count=document_count,
        created_at=to_utc_iso(knowledge_base.created_at),
        updated_at=to_utc_iso(knowledge_base.updated_at),
        last_opened_at=to_utc_iso(knowledge_base.last_opened_at)
        if knowledge_base.last_opened_at
        else None,
    )


@router.post("", response_model=KnowledgeBaseResponse, status_code=status.HTTP_201_CREATED)
def create_knowledge_base(
    payload: KnowledgeBaseCreate,
    session: Session = Depends(get_db_session),
) -> KnowledgeBaseResponse:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Knowledge base name cannot be empty.")

    now = utc_now()
    knowledge_base = KnowledgeBase(
        id=str(uuid4()),
        name=name,
        description=payload.description,
        color=None,
        created_at=now,
        updated_at=now,
        last_opened_at=None,
        deleted_at=None,
    )
    session.add(knowledge_base)
    session.commit()

    item = get_knowledge_base_with_document_count(session, knowledge_base.id)
    if item is None:
        raise HTTPException(status_code=500, detail="Failed to create knowledge base.")
    return serialize_knowledge_base(item)


@router.get("", response_model=list[KnowledgeBaseResponse])
def get_knowledge_bases(session: Session = Depends(get_db_session)) -> list[KnowledgeBaseResponse]:
    return [serialize_knowledge_base(item) for item in list_knowledge_bases(session)]


@router.get("/recent", response_model=list[KnowledgeBaseResponse])
def get_recent_knowledge_bases(session: Session = Depends(get_db_session)) -> list[KnowledgeBaseResponse]:
    return [serialize_knowledge_base(item) for item in list_recent_knowledge_bases(session)]


@router.patch("/{knowledge_base_id}", response_model=KnowledgeBaseResponse)
def update_knowledge_base(
    knowledge_base_id: str,
    payload: KnowledgeBaseUpdate,
    session: Session = Depends(get_db_session),
) -> KnowledgeBaseResponse:
    knowledge_base = get_knowledge_base(session, knowledge_base_id)
    if knowledge_base is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge base not found.")

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Knowledge base name cannot be empty.",
            )
        knowledge_base.name = name

    if payload.description is not None:
        knowledge_base.description = payload.description

    knowledge_base.updated_at = utc_now()
    session.add(knowledge_base)
    session.commit()

    item = get_knowledge_base_with_document_count(session, knowledge_base_id)
    if item is None:
        raise HTTPException(status_code=500, detail="Failed to update knowledge base.")
    return serialize_knowledge_base(item)


@router.delete("/{knowledge_base_id}", response_model=DeleteResponse)
def delete_knowledge_base(
    knowledge_base_id: str,
    session: Session = Depends(get_db_session),
) -> DeleteResponse:
    deleted = delete_knowledge_base_records(session, knowledge_base_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge base not found.")
    return DeleteResponse(success=True, deleted_id=knowledge_base_id)


@router.post("/{knowledge_base_id}/reindex", response_model=KnowledgeBaseReindexResponse)
def reindex_knowledge_base(
    knowledge_base_id: str,
    session: Session = Depends(get_db_session),
) -> KnowledgeBaseReindexResponse:
    if get_knowledge_base(session, knowledge_base_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge base not found.")

    try:
        result = reindex_knowledge_base_documents(knowledge_base_id, session)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    return KnowledgeBaseReindexResponse(**result)
