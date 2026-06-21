from typing import List, Optional

from pydantic import BaseModel, Field


class QAAskRequest(BaseModel):
    question: str = Field(min_length=1)
    knowledge_base_ids: List[str] = Field(default_factory=list)
    session_id: Optional[str] = None
    top_k: int = Field(default=5, ge=1, le=10)


class CitationHighlightRange(BaseModel):
    start: int
    end: int


class QACitation(BaseModel):
    knowledge_base_id: str
    knowledge_base_name: str
    document_id: str
    document_name: str
    location_label: str
    snippet: str
    highlight_ranges: List[CitationHighlightRange]
    score: float


class QAMatchedDocument(BaseModel):
    knowledge_base_id: str
    knowledge_base_name: str
    document_id: str
    document_name: str
    score: float


class QAAskResponse(BaseModel):
    answer: str
    citations: List[QACitation]
    matched_documents: List[QAMatchedDocument]
    answer_limited: bool
    message: Optional[str] = None
    session_id: Optional[str] = None
