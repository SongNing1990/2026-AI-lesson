from typing import Optional

from sqlalchemy import DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    title: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    selected_kb_ids_json: Mapped[str] = mapped_column(Text, nullable=False)
    last_message_at: Mapped[Optional[str]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[str] = mapped_column(DateTime, nullable=False)
