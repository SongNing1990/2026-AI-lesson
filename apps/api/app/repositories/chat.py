import json
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.chat_messages import ChatMessage
from app.models.chat_sessions import ChatSession


def create_chat_session(session: Session, chat_session: ChatSession) -> ChatSession:
    session.add(chat_session)
    session.commit()
    session.refresh(chat_session)
    return chat_session


def get_chat_session(session: Session, session_id: str) -> Optional[ChatSession]:
    return session.get(ChatSession, session_id)


def list_chat_sessions(session: Session) -> List[ChatSession]:
    stmt = select(ChatSession).order_by(ChatSession.last_message_at.desc().nullslast(), ChatSession.updated_at.desc())
    return list(session.execute(stmt).scalars().all())


def update_chat_session(session: Session, chat_session: ChatSession) -> ChatSession:
    session.add(chat_session)
    session.commit()
    session.refresh(chat_session)
    return chat_session


def delete_chat_session(session: Session, session_id: str) -> bool:
    chat_session = session.get(ChatSession, session_id)
    if chat_session is None:
        return False
    session.query(ChatMessage).filter(ChatMessage.session_id == session_id).delete(synchronize_session=False)
    session.delete(chat_session)
    session.commit()
    return True


def clear_chat_session_messages(session: Session, session_id: str) -> bool:
    chat_session = session.get(ChatSession, session_id)
    if chat_session is None:
        return False
    session.query(ChatMessage).filter(ChatMessage.session_id == session_id).delete(synchronize_session=False)
    session.commit()
    return True


def create_chat_message(session: Session, chat_message: ChatMessage) -> ChatMessage:
    session.add(chat_message)
    session.commit()
    session.refresh(chat_message)
    return chat_message


def list_chat_messages(session: Session, session_id: str) -> List[ChatMessage]:
    stmt = select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc())
    return list(session.execute(stmt).scalars().all())


def list_recent_chat_messages(session: Session, session_id: str, limit: int) -> List[ChatMessage]:
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
    )
    messages = list(session.execute(stmt).scalars().all())
    messages.reverse()
    return messages


def parse_selected_kb_ids(chat_session: ChatSession) -> List[str]:
    try:
        data = json.loads(chat_session.selected_kb_ids_json)
        if not isinstance(data, list):
            return []
        return [item for item in data if isinstance(item, str)]
    except Exception:
        return []
