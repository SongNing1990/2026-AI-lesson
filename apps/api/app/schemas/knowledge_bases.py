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


class KnowledgeBaseReindexFailure(BaseModel):
    document_id: str
    document_name: str
    reason: str


class KnowledgeBaseReindexResponse(BaseModel):
    knowledge_base_id: str
    knowledge_base_name: str
    total_documents: int
    reindexed_documents: int
    failed_documents: list[KnowledgeBaseReindexFailure]
    total_chunks: int
