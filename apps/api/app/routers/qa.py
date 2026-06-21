from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db_session
from app.schemas.qa import QAAskRequest, QAAskResponse
from app.services.llm_client import (
    LLMClientError,
    LLMEmptyResponseError,
    LLMModelNotFoundError,
    LLMRequestTimeoutError,
    LLMServiceUnavailableError,
)
from app.services.qa_service import ask_question

router = APIRouter(prefix="/qa", tags=["qa"])


@router.post("/ask", response_model=QAAskResponse)
def ask_question_single_turn(
    payload: QAAskRequest,
    session: Session = Depends(get_db_session),
) -> QAAskResponse:
    try:
        return ask_question(session, payload.question, payload.knowledge_base_ids, payload.top_k, payload.session_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except LLMServiceUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except LLMModelNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except LLMRequestTimeoutError as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from exc
    except LLMEmptyResponseError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except LLMClientError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
