from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db_session
from app.schemas.qa import QAAskRequest, QAAskResponse
from app.services.qa_service import ask_question

router = APIRouter(prefix="/qa", tags=["qa"])


@router.post("/ask", response_model=QAAskResponse)
def ask_question_single_turn(
    payload: QAAskRequest,
    session: Session = Depends(get_db_session),
) -> QAAskResponse:
    try:
        return ask_question(session, payload.question, payload.knowledge_base_ids, payload.top_k)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
