from typing import Optional

from sqlalchemy import DateTime, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class KnowledgeBase(Base):
    __tablename__ = "knowledge_bases"
    __table_args__ = (
        Index("idx_kb_updated_at", "updated_at"),
        Index("idx_kb_last_opened_at", "last_opened_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[str] = mapped_column(DateTime, nullable=False)
    last_opened_at: Mapped[Optional[str]] = mapped_column(DateTime, nullable=True)
    deleted_at: Mapped[Optional[str]] = mapped_column(DateTime, nullable=True)
