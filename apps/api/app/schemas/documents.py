from typing import List, Optional

from pydantic import BaseModel


class DocumentResponse(BaseModel):
    id: str
    knowledge_base_id: str
    name: str
    source_type: str
    file_type: str
    mime_type: Optional[str]
    source_url: Optional[str]
    storage_path: str
    file_size: Optional[int]
    parse_status: str
    parse_error: Optional[str]
    preview_text: Optional[str]
    summary_text: Optional[str]
    page_count: Optional[int]
    retry_count: int
    created_at: str
    updated_at: str


class DocumentUploadSuccess(BaseModel):
    file_name: str
    document_id: str
    parse_status: str


class DocumentUploadFailure(BaseModel):
    file_name: str
    reason: str


class DocumentUploadResponse(BaseModel):
    knowledge_base_id: str
    success: List[DocumentUploadSuccess]
    failed: List[DocumentUploadFailure]


class DocumentLinkImportRequest(BaseModel):
    knowledge_base_id: str
    urls: List[str]


class DocumentSingleUrlImportRequest(BaseModel):
    knowledge_base_id: str
    url: str


class DocumentBatchMoveRequest(BaseModel):
    document_ids: List[str]
    target_knowledge_base_id: str


class DocumentBatchMoveResponse(BaseModel):
    success: bool
    moved_ids: List[str]
    target_knowledge_base_id: str
