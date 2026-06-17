from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (Index("idx_messages_session_created", "session_id", "created_at"),)

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    session_id: Mapped[str] = mapped_column(Text, ForeignKey("chat_sessions.id"), nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    question_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    answer_markdown: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    citations_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    retrieval_snapshot_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime, nullable=False)
