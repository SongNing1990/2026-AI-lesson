from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.datetime_utils import to_utc_iso
from app.core.db import get_db_session
from app.models.chat_messages import ChatMessage
from app.models.chat_sessions import ChatSession
from app.repositories.chat import (
    clear_chat_session_messages,
    delete_chat_session,
    get_chat_session,
    list_chat_messages,
    list_chat_sessions,
    parse_selected_kb_ids,
    update_chat_session,
)
from app.repositories.knowledge_bases import get_knowledge_base, utc_now
from app.schemas.chat import (
    ChatMessageResponse,
    ChatSessionClearResponse,
    ChatSessionCreateRequest,
    ChatSessionDetailResponse,
    ChatSessionRenameRequest,
    ChatSessionResponse,
)
from app.schemas.knowledge_bases import DeleteResponse
from app.services.qa_service import create_session_for_knowledge_bases

router = APIRouter(prefix="/chat", tags=["chat"])


def serialize_chat_session(chat_session: ChatSession) -> ChatSessionResponse:
    return ChatSessionResponse(
        id=chat_session.id,
        title=chat_session.title,
        knowledge_base_ids=parse_selected_kb_ids(chat_session),
        last_message_at=to_utc_iso(chat_session.last_message_at) if chat_session.last_message_at else None,
        created_at=to_utc_iso(chat_session.created_at),
        updated_at=to_utc_iso(chat_session.updated_at),
    )


def serialize_chat_message(chat_message: ChatMessage) -> ChatMessageResponse:
    return ChatMessageResponse(
        id=chat_message.id,
        session_id=chat_message.session_id,
        role=chat_message.role,
        question_text=chat_message.question_text,
        answer_markdown=chat_message.answer_markdown,
        citations_json=chat_message.citations_json,
        retrieval_snapshot_json=chat_message.retrieval_snapshot_json,
        created_at=to_utc_iso(chat_message.created_at),
    )


@router.post("/sessions", response_model=ChatSessionResponse, status_code=status.HTTP_201_CREATED)
def create_chat_session_api(
    payload: ChatSessionCreateRequest,
    session: Session = Depends(get_db_session),
) -> ChatSessionResponse:
    for knowledge_base_id in payload.knowledge_base_ids:
        if get_knowledge_base(session, knowledge_base_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Knowledge base not found: {knowledge_base_id}")
    chat_session = create_session_for_knowledge_bases(session, payload.knowledge_base_ids, payload.title)
    return serialize_chat_session(chat_session)


@router.get("/sessions", response_model=List[ChatSessionResponse])
def list_chat_sessions_api(session: Session = Depends(get_db_session)) -> List[ChatSessionResponse]:
    return [serialize_chat_session(item) for item in list_chat_sessions(session)]


@router.get("/sessions/{session_id}", response_model=ChatSessionDetailResponse)
def get_chat_session_api(session_id: str, session: Session = Depends(get_db_session)) -> ChatSessionDetailResponse:
    chat_session = get_chat_session(session, session_id)
    if chat_session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat session not found.")
    messages = list_chat_messages(session, session_id)
    return ChatSessionDetailResponse(
        session=serialize_chat_session(chat_session),
        messages=[serialize_chat_message(item) for item in messages],
    )


@router.post("/sessions/{session_id}/rename", response_model=ChatSessionResponse)
def rename_chat_session_api(
    session_id: str,
    payload: ChatSessionRenameRequest,
    session: Session = Depends(get_db_session),
) -> ChatSessionResponse:
    chat_session = get_chat_session(session, session_id)
    if chat_session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat session not found.")
    chat_session.title = payload.title.strip()
    chat_session.updated_at = utc_now()
    chat_session = update_chat_session(session, chat_session)
    return serialize_chat_session(chat_session)


@router.post("/sessions/{session_id}/clear", response_model=ChatSessionClearResponse)
def clear_chat_session_api(session_id: str, session: Session = Depends(get_db_session)) -> ChatSessionClearResponse:
    cleared = clear_chat_session_messages(session, session_id)
    if not cleared:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat session not found.")
    chat_session = get_chat_session(session, session_id)
    if chat_session is not None:
        chat_session.last_message_at = None
        chat_session.updated_at = utc_now()
        update_chat_session(session, chat_session)
    return ChatSessionClearResponse(success=True, cleared_session_id=session_id)


@router.delete("/sessions/{session_id}", response_model=DeleteResponse)
def delete_chat_session_api(session_id: str, session: Session = Depends(get_db_session)) -> DeleteResponse:
    deleted = delete_chat_session(session, session_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat session not found.")
    return DeleteResponse(success=True, deleted_id=session_id)
