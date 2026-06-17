from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ExportJob(Base):
    __tablename__ = "export_jobs"
    __table_args__ = (Index("idx_exports_session", "session_id"),)

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    session_id: Mapped[str] = mapped_column(Text, ForeignKey("chat_sessions.id"), nullable=False)
    format: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    output_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime, nullable=False)
    finished_at: Mapped[Optional[str]] = mapped_column(DateTime, nullable=True)
