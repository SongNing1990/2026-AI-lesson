from typing import List, Optional

from pydantic import BaseModel, Field


class ChatSessionCreateRequest(BaseModel):
    title: Optional[str] = None
    knowledge_base_ids: List[str] = Field(min_length=1)


class ChatSessionRenameRequest(BaseModel):
    title: str = Field(min_length=1)


class ChatMessageResponse(BaseModel):
    id: str
    session_id: str
    role: str
    question_text: Optional[str]
    answer_markdown: Optional[str]
    citations_json: Optional[str]
    retrieval_snapshot_json: Optional[str]
    created_at: str


class ChatSessionResponse(BaseModel):
    id: str
    title: Optional[str]
    knowledge_base_ids: List[str]
    last_message_at: Optional[str]
    created_at: str
    updated_at: str


class ChatSessionDetailResponse(BaseModel):
    session: ChatSessionResponse
    messages: List[ChatMessageResponse]


class ChatSessionClearResponse(BaseModel):
    success: bool
    cleared_session_id: str
