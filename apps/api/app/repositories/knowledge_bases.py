from datetime import datetime, timezone
from typing import List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.document_chunks import DocumentChunk
from app.models.documents import Document
from app.models.knowledge_bases import KnowledgeBase
from app.services.vector_store import delete_knowledge_base_vectors


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def list_knowledge_bases(session: Session) -> List[Tuple[KnowledgeBase, int]]:
    stmt = (
        select(KnowledgeBase, func.count(Document.id))
        .outerjoin(Document, Document.knowledge_base_id == KnowledgeBase.id)
        .group_by(KnowledgeBase.id)
        .order_by(KnowledgeBase.updated_at.desc())
    )
    return list(session.execute(stmt).all())


def list_recent_knowledge_bases(session: Session) -> List[Tuple[KnowledgeBase, int]]:
    stmt = (
        select(KnowledgeBase, func.count(Document.id))
        .outerjoin(Document, Document.knowledge_base_id == KnowledgeBase.id)
        .group_by(KnowledgeBase.id)
        .order_by(KnowledgeBase.last_opened_at.desc().nullslast(), KnowledgeBase.updated_at.desc())
    )
    return list(session.execute(stmt).all())


def get_knowledge_base(session: Session, knowledge_base_id: str) -> Optional[KnowledgeBase]:
    return session.get(KnowledgeBase, knowledge_base_id)


def get_knowledge_base_with_document_count(
    session: Session, knowledge_base_id: str
) -> Optional[Tuple[KnowledgeBase, int]]:
    stmt = (
        select(KnowledgeBase, func.count(Document.id))
        .outerjoin(Document, Document.knowledge_base_id == KnowledgeBase.id)
        .where(KnowledgeBase.id == knowledge_base_id)
        .group_by(KnowledgeBase.id)
    )
    return session.execute(stmt).one_or_none()


def delete_knowledge_base_records(session: Session, knowledge_base_id: str) -> bool:
    knowledge_base = session.get(KnowledgeBase, knowledge_base_id)
    if knowledge_base is None:
        return False

    document_ids = list(
        session.execute(
            select(Document.id).where(Document.knowledge_base_id == knowledge_base_id)
        ).scalars()
    )

    if document_ids:
        session.query(DocumentChunk).filter(DocumentChunk.document_id.in_(document_ids)).delete(
            synchronize_session=False
        )
        session.query(Document).filter(Document.id.in_(document_ids)).delete(
            synchronize_session=False
        )

    session.delete(knowledge_base)
    session.commit()
    delete_knowledge_base_vectors(knowledge_base_id)
    return True
