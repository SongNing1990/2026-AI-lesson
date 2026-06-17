from typing import Optional

from pydantic import BaseModel, Field


class KnowledgeBaseCreate(BaseModel):
    name: str = Field(..., min_length=1)
    description: Optional[str] = None


class KnowledgeBaseUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = None


class KnowledgeBaseResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    color: Optional[str]
    document_count: int
    created_at: str
    updated_at: str
    last_opened_at: Optional[str]


class DeleteResponse(BaseModel):
    success: bool
    deleted_id: str
