from typing import List, Optional

from pydantic import BaseModel, Field


class ExportRequest(BaseModel):
    question: str = Field(min_length=1)
    answer: str = Field(min_length=1)
    knowledge_base_ids: List[str] = Field(default_factory=list)
    knowledge_base_names: List[str] = Field(default_factory=list)
    citations: List[dict] = Field(default_factory=list)
    session_id: Optional[str] = None


class ExportJobResponse(BaseModel):
    id: str
    format: str
    status: str
    output_path: Optional[str]
    download_url: Optional[str]
    error_message: Optional[str]
    created_at: str
    finished_at: Optional[str]
