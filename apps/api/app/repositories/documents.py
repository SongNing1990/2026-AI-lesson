from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.document_chunks import DocumentChunk
from app.models.documents import Document


def list_documents(
    session: Session,
    knowledge_base_id: Optional[str] = None,
    parse_status: Optional[str] = None,
) -> List[Document]:
    stmt = select(Document)
    if knowledge_base_id is not None:
        stmt = stmt.where(Document.knowledge_base_id == knowledge_base_id)
    if parse_status is not None:
        stmt = stmt.where(Document.parse_status == parse_status)
    stmt = stmt.order_by(Document.updated_at.desc())
    return list(session.execute(stmt).scalars().all())


def get_document(session: Session, document_id: str) -> Optional[Document]:
    return session.get(Document, document_id)


def create_document(session: Session, document: Document) -> Document:
    session.add(document)
    session.commit()
    session.refresh(document)
    return document


def update_document_knowledge_base(session: Session, document_id: str, knowledge_base_id: str) -> Optional[Document]:
    document = session.get(Document, document_id)
    if document is None:
        return None

    document.knowledge_base_id = knowledge_base_id
    session.add(document)

    session.query(DocumentChunk).filter(DocumentChunk.document_id == document_id).update(
        {DocumentChunk.knowledge_base_id: knowledge_base_id},
        synchronize_session=False,
    )
    session.commit()
    session.refresh(document)
    return document


def delete_document_record(session: Session, document_id: str) -> bool:
    document = session.get(Document, document_id)
    if document is None:
        return False

    session.query(DocumentChunk).filter(DocumentChunk.document_id == document_id).delete(
        synchronize_session=False
    )
    session.delete(document)
    session.commit()
    return True


def replace_document_chunks(session: Session, document_id: str, chunks: List[DocumentChunk]) -> None:
    session.query(DocumentChunk).filter(DocumentChunk.document_id == document_id).delete(
        synchronize_session=False
    )
    for chunk in chunks:
        session.add(chunk)
    session.commit()


def list_document_chunks(session: Session, document_id: str) -> List[DocumentChunk]:
    stmt = (
        select(DocumentChunk)
        .where(DocumentChunk.document_id == document_id)
        .order_by(DocumentChunk.chunk_index.asc())
    )
    return list(session.execute(stmt).scalars().all())
