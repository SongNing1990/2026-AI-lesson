from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    __table_args__ = (
        UniqueConstraint("document_id", "chunk_index", name="uq_document_chunk_index"),
        UniqueConstraint("vector_id", name="uq_document_chunk_vector_id"),
        Index("idx_chunks_kb_doc", "knowledge_base_id", "document_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    document_id: Mapped[str] = mapped_column(String, ForeignKey("documents.id"), nullable=False)
    knowledge_base_id: Mapped[str] = mapped_column(String, ForeignKey("knowledge_bases.id"), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    token_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    location_label: Mapped[str] = mapped_column(String, nullable=False)
    page_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sheet_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    start_offset: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    end_offset: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    vector_id: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime, nullable=False)
