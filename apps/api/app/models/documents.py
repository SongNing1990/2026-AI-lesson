from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        Index("idx_documents_kb_status", "knowledge_base_id", "parse_status"),
        Index("idx_documents_checksum", "checksum"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    knowledge_base_id: Mapped[str] = mapped_column(String, ForeignKey("knowledge_bases.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    source_type: Mapped[str] = mapped_column(String, nullable=False)
    file_type: Mapped[str] = mapped_column(String, nullable=False)
    mime_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    source_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    original_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    file_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    checksum: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    parse_status: Mapped[str] = mapped_column(String, nullable=False)
    parse_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    preview_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    summary_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    page_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_parsed_at: Mapped[Optional[str]] = mapped_column(DateTime, nullable=True)
    metadata_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[str] = mapped_column(DateTime, nullable=False)
