import re
import json
from collections import OrderedDict
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Sequence
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.chat_messages import ChatMessage
from app.models.chat_sessions import ChatSession
from app.models.document_chunks import DocumentChunk
from app.models.documents import Document
from app.models.knowledge_bases import KnowledgeBase
from app.core.config import get_settings
from app.repositories.chat import create_chat_message, create_chat_session, get_chat_session, list_recent_chat_messages, parse_selected_kb_ids, update_chat_session
from app.repositories.knowledge_bases import get_knowledge_base
from app.schemas.qa import CitationHighlightRange, QACitation, QAAskResponse, QAMatchedDocument
from app.repositories.knowledge_bases import utc_now
from app.services.llm_client import (
    LLMClientError,
    LLMEmptyResponseError,
    LLMModelNotFoundError,
    LLMRequestTimeoutError,
    LLMServiceUnavailableError,
    generate_text,
)
from app.services.llm_prompting import build_qa_prompts
from app.services.text_vectors import extract_terms
from app.services.vector_store import backfill_vectors_for_knowledge_bases, query_vectors


MIN_EVIDENCE_SCORE = 0.18
MAX_CITATIONS = 4
FUZZY_TERM_MATCH_THRESHOLD = 0.56
MIN_VECTOR_ONLY_SCORE = 0.62
RELATIVE_HIT_SCORE_THRESHOLD = 0.45
GENERIC_TERMS = {
    "强调",
    "分析",
    "研究",
    "内容",
    "问题",
    "方法",
    "方式",
    "作用",
    "影响",
    "意义",
    "路径",
    "模式",
    "体系",
    "机制",
    "理论",
    "实践",
    "发展",
    "提升",
    "说明",
    "表明",
    "用于",
    "实验",
    "平台",
}
SYNONYM_SUFFIX_GROUPS = [
    ("路径", "模式", "方式", "途径", "机制", "体系"),
    ("作用", "影响", "意义", "价值"),
    ("趋势", "方向", "走向", "动向"),
    ("定义", "概念", "内涵", "含义"),
]
OVERVIEW_QUESTION_PATTERNS = [
    "主要讲了什么",
    "主要讲什么",
    "讲了什么",
    "讲什么",
    "主要内容是什么",
    "内容是什么",
    "核心内容是什么",
    "概述一下",
    "概括一下",
    "总结一下",
    "说了什么",
]
SUBJECT_PREFIX_PATTERN = re.compile(r"^(关于|围绕|针对|对于|请问|请说明|请概述|请总结|想了解)?")
REGION_ENTITY_SUFFIXES = ("省", "市", "区", "县", "州", "国", "洲", "地区", "自治区", "特别行政区")
ORG_ENTITY_SUFFIXES = ("大学", "学院", "学校", "出版社", "公司", "集团", "协会", "机构", "中心", "委员会", "研究院", "实验室", "平台")
REGION_ENTITY_PATTERN = re.compile(r"[\u4e00-\u9fff]{2,10}(?:省|市|区|县|州|国|洲|地区|自治区|特别行政区)")
ORG_ENTITY_PATTERN = re.compile(r"[\u4e00-\u9fff]{2,14}(?:大学|学院|学校|出版社|公司|集团|协会|机构|中心|委员会|研究院|实验室|平台)")
PERSON_CUE_PATTERNS = (
    re.compile(r"([\u4e00-\u9fff]{2,4})(?:提出|指出|认为|强调|主张|表示|介绍|撰写|出版|发布)"),
    re.compile(r"([\u4e00-\u9fff]{2,4})(?:是谁|做了什么|提出了什么)"),
)
SUBJECT_STOP_TERMS = {
    "什么",
    "哪些",
    "哪个",
    "谁",
    "如何",
    "怎么",
    "怎样",
    "内容",
    "问题",
    "事件",
    "原因",
    "结果",
    "影响",
    "作用",
    "模式",
    "路径",
    "方式",
    "定义",
    "概念",
}
SUBJECT_BOOST = 0.22
SUBJECT_PENALTY = 0.18
MAX_CONTEXT_MESSAGES = 6


@dataclass
class RetrievalHit:
    knowledge_base_id: str
    knowledge_base_name: str
    document_id: str
    document_name: str
    location_label: str
    text: str
    vector_distance: float
    lexical_score: float
    subject_score: float
    combined_score: float


@dataclass
class RetrievalCandidate:
    knowledge_base_id: str
    knowledge_base_name: str
    document_id: str
    document_name: str
    location_label: str
    text: str
    vector_distance: float


def ask_question(
    session: Session,
    question: str,
    knowledge_base_ids: Sequence[str],
    top_k: int,
    session_id: Optional[str] = None,
) -> QAAskResponse:
    normalized_question = question.strip()
    if not normalized_question:
        return QAAskResponse(
            answer="未找到足够依据，无法回答当前问题。",
            citations=[],
            matched_documents=[],
            answer_limited=True,
            message="问题不能为空。",
            session_id=session_id,
        )

    active_session: Optional[ChatSession] = None
    effective_knowledge_base_ids = list(knowledge_base_ids)
    if session_id:
        active_session = get_chat_session(session, session_id)
        if active_session is None:
            raise ValueError(f"Chat session not found: {session_id}")
        if not effective_knowledge_base_ids:
            effective_knowledge_base_ids = parse_selected_kb_ids(active_session)
    if not effective_knowledge_base_ids:
        return QAAskResponse(
            answer="未找到足够依据，无法回答当前问题。",
            citations=[],
            matched_documents=[],
            answer_limited=True,
            message="知识库范围不能为空。",
            session_id=session_id,
        )

    contextual_question = build_contextual_question(session, session_id, normalized_question)
    knowledge_bases = validate_knowledge_bases(session, effective_knowledge_base_ids)
    backfill_vectors_for_knowledge_bases(session, effective_knowledge_base_ids)
    hits, raw_results = retrieve_ranked_hits(
        session=session,
        knowledge_base_ids=effective_knowledge_base_ids,
        question=contextual_question,
        top_k=top_k,
    )

    if not hits or hits[0].combined_score < MIN_EVIDENCE_SCORE:
        response = QAAskResponse(
            answer="未找到足够依据，当前选定知识库内没有足够证据支持回答这个问题。",
            citations=[],
            matched_documents=[],
            answer_limited=True,
            message="请尝试更换知识库范围、补充文档，或换一种问法。",
            session_id=active_session.id if active_session else None,
        )
        persist_chat_turn(session, active_session, normalized_question, response, raw_results)
        touch_knowledge_bases(session, effective_knowledge_base_ids)
        return response

    top_hits = select_top_hits(hits)
    citations = [build_citation(hit, normalized_question) for hit in top_hits]
    matched_documents = build_matched_documents(top_hits)
    generated_answer, used_fallback, fallback_message = generate_answer_with_qwen(
        question=normalized_question,
        knowledge_base_names=[item.name for item in knowledge_bases.values()],
        citations=citations,
    )

    response = QAAskResponse(
        answer=generated_answer,
        citations=citations,
        matched_documents=matched_documents,
        answer_limited=False,
        message=(
            fallback_message
            if used_fallback
            else f"已在 {len(knowledge_bases)} 个知识库范围内完成检索。"
        ),
        session_id=active_session.id if active_session else None,
    )
    persist_chat_turn(session, active_session, normalized_question, response, raw_results)
    touch_knowledge_bases(session, effective_knowledge_base_ids)
    return response


def create_session_for_knowledge_bases(session: Session, knowledge_base_ids: Sequence[str], title: Optional[str] = None) -> ChatSession:
    now = utc_now()
    chat_session = ChatSession(
        id=str(uuid4()),
        title=title.strip() if title and title.strip() else "新会话",
        selected_kb_ids_json=json.dumps(list(knowledge_base_ids), ensure_ascii=False),
        last_message_at=None,
        created_at=now,
        updated_at=now,
    )
    return create_chat_session(session, chat_session)


def build_contextual_question(session: Session, session_id: Optional[str], question: str) -> str:
    if not session_id:
        return question
    recent_messages = list_recent_chat_messages(session, session_id, MAX_CONTEXT_MESSAGES)
    context_lines: List[str] = []
    recent_user_questions: List[str] = []
    for message in recent_messages:
        if message.role == "user" and message.question_text:
            context_lines.append(f"用户：{message.question_text}")
            recent_user_questions.append(message.question_text)
        elif message.role == "assistant" and message.answer_markdown:
            context_lines.append(f"助手：{message.answer_markdown}")
    if not context_lines:
        return question

    subject_terms: List[str] = []
    for previous_question in recent_user_questions[-3:]:
        subject_terms.extend(extract_subject_terms(previous_question))
        subject_terms.extend(extract_focus_terms(previous_question)[:2])

    normalized_subject_terms = dedupe_terms(subject_terms)[:6]
    if normalized_subject_terms:
        return f"{' '.join(normalized_subject_terms)} {question}"

    context_lines.append(f"用户：{question}")
    return "\n".join(context_lines[-MAX_CONTEXT_MESSAGES - 1 :])


def persist_chat_turn(
    session: Session,
    active_session: Optional[ChatSession],
    question: str,
    response: QAAskResponse,
    raw_results: Dict[str, List[List[object]]],
) -> None:
    if active_session is None:
        return

    now = utc_now()
    create_chat_message(
        session,
        ChatMessage(
            id=str(uuid4()),
            session_id=active_session.id,
            role="user",
            question_text=question,
            answer_markdown=None,
            citations_json=None,
            retrieval_snapshot_json=None,
            created_at=now,
        ),
    )
    create_chat_message(
        session,
        ChatMessage(
            id=str(uuid4()),
            session_id=active_session.id,
            role="assistant",
            question_text=None,
            answer_markdown=response.answer,
            citations_json=json.dumps([item.model_dump() for item in response.citations], ensure_ascii=False),
            retrieval_snapshot_json=json.dumps(raw_results, ensure_ascii=False),
            created_at=utc_now(),
        ),
    )
    active_session.last_message_at = utc_now()
    active_session.updated_at = utc_now()
    update_chat_session(session, active_session)


def touch_knowledge_bases(session: Session, knowledge_base_ids: Sequence[str]) -> None:
    now = utc_now()
    for knowledge_base_id in knowledge_base_ids:
        knowledge_base = get_knowledge_base(session, knowledge_base_id)
        if knowledge_base is None:
            continue
        knowledge_base.last_opened_at = now
        knowledge_base.updated_at = now
        session.add(knowledge_base)
    session.commit()


def validate_knowledge_bases(session: Session, knowledge_base_ids: Sequence[str]) -> Dict[str, KnowledgeBase]:
    result: Dict[str, KnowledgeBase] = {}
    for knowledge_base_id in knowledge_base_ids:
        knowledge_base = get_knowledge_base(session, knowledge_base_id)
        if knowledge_base is None:
            raise ValueError(f"Knowledge base not found: {knowledge_base_id}")
        result[knowledge_base_id] = knowledge_base
    return result


def retrieve_ranked_hits(
    *,
    session: Session,
    knowledge_base_ids: Sequence[str],
    question: str,
    top_k: int,
) -> tuple[List[RetrievalHit], Dict[str, List[List[object]]]]:
    vector_results = query_vectors(knowledge_base_ids, question, max(top_k * 8, top_k + 16, 32))
    vector_distance_by_key = index_vector_distances(vector_results)
    candidates = collect_retrieval_candidates(session, knowledge_base_ids, vector_distance_by_key)
    hits = rerank_candidates(candidates, question)
    snapshot = build_retrieval_snapshot(hits[: max(top_k * 4, 12)])
    return hits, snapshot


def index_vector_distances(raw_results: Dict[str, List[List[object]]]) -> Dict[str, float]:
    documents = raw_results.get("documents", [[]])[0]
    metadatas = raw_results.get("metadatas", [[]])[0]
    distances = raw_results.get("distances", [[]])[0]
    indexed: Dict[str, float] = {}

    for document_text, metadata, distance in zip(documents, metadatas, distances):
        if not isinstance(document_text, str) or not isinstance(metadata, dict):
            continue
        key = make_candidate_key(
            document_id=str(metadata.get("document_id", "")),
            location_label=str(metadata.get("location_label", "")),
            text=document_text,
        )
        value = float(distance or 0.0)
        previous = indexed.get(key)
        indexed[key] = value if previous is None else min(previous, value)

    return indexed


def collect_retrieval_candidates(
    session: Session,
    knowledge_base_ids: Sequence[str],
    vector_distance_by_key: Dict[str, float],
) -> List[RetrievalCandidate]:
    if not knowledge_base_ids:
        return []

    chunk_stmt = (
        select(
            DocumentChunk.knowledge_base_id,
            KnowledgeBase.name,
            DocumentChunk.document_id,
            Document.name,
            DocumentChunk.location_label,
            DocumentChunk.text,
        )
        .join(Document, Document.id == DocumentChunk.document_id)
        .join(KnowledgeBase, KnowledgeBase.id == DocumentChunk.knowledge_base_id)
        .where(DocumentChunk.knowledge_base_id.in_(knowledge_base_ids))
        .where(Document.parse_status == "done")
        .order_by(DocumentChunk.document_id.asc(), DocumentChunk.chunk_index.asc())
    )

    preview_stmt = (
        select(
            Document.knowledge_base_id,
            KnowledgeBase.name,
            Document.id,
            Document.name,
            Document.preview_text,
        )
        .join(KnowledgeBase, KnowledgeBase.id == Document.knowledge_base_id)
        .where(Document.knowledge_base_id.in_(knowledge_base_ids))
        .where(Document.parse_status != "done")
    )

    candidates: List[RetrievalCandidate] = []
    seen_keys: set[str] = set()

    for knowledge_base_id, knowledge_base_name, document_id, document_name, location_label, text in session.execute(chunk_stmt).all():
        if not isinstance(text, str) or not text.strip():
            continue
        key = make_candidate_key(document_id=document_id, location_label=location_label, text=text)
        candidates.append(
            RetrievalCandidate(
                knowledge_base_id=str(knowledge_base_id),
                knowledge_base_name=str(knowledge_base_name),
                document_id=str(document_id),
                document_name=str(document_name),
                location_label=str(location_label),
                text=text,
                vector_distance=vector_distance_by_key.get(key, 2.0),
            )
        )
        seen_keys.add(str(document_id))

    for knowledge_base_id, knowledge_base_name, document_id, document_name, preview_text in session.execute(preview_stmt).all():
        if str(document_id) in seen_keys:
            continue
        if not isinstance(preview_text, str) or not preview_text.strip():
            continue
        text = preview_text.strip()
        key = make_candidate_key(document_id=document_id, location_label="Preview Cache", text=text)
        candidates.append(
            RetrievalCandidate(
                knowledge_base_id=str(knowledge_base_id),
                knowledge_base_name=str(knowledge_base_name),
                document_id=str(document_id),
                document_name=str(document_name),
                location_label="Preview Cache",
                text=text,
                vector_distance=vector_distance_by_key.get(key, 2.0),
            )
        )

    return candidates


def make_candidate_key(*, document_id: str, location_label: str, text: str) -> str:
    normalized_text = re.sub(r"\s+", " ", text).strip().lower()
    return f"{document_id}::{location_label.strip().lower()}::{normalized_text[:160]}"


def rerank_candidates(candidates: Sequence[RetrievalCandidate], question: str) -> List[RetrievalHit]:
    question_terms = build_query_terms(question)
    overview_question = is_overview_question(question)
    subject_terms = extract_subject_terms(question)
    hits: List[RetrievalHit] = []

    for candidate in candidates:
        lexical_score = compute_lexical_score(candidate.text, question_terms)
        vector_score = normalize_vector_score(candidate.vector_distance)
        subject_score = compute_subject_score(candidate.text, subject_terms)
        document_name_score = compute_document_name_score(candidate.document_name, question_terms, subject_terms)
        combined_score = (
            lexical_score * 0.42
            + vector_score * 0.18
            + subject_score * 0.22
            + document_name_score * 0.18
        )

        subject_anchor_score = max(subject_score, document_name_score)
        if subject_terms:
            if subject_anchor_score >= 0.85:
                combined_score += SUBJECT_BOOST
            elif subject_anchor_score < 0.2 and lexical_score < 0.28:
                combined_score -= SUBJECT_PENALTY

        if candidate.location_label.lower().startswith("preview") and lexical_score >= 0.12:
            combined_score += 0.04

        vector_gate = 0.30 if overview_question else 0.50
        if (
            lexical_score < 0.08
            and document_name_score < 0.18
            and subject_score < 0.18
            and vector_score < vector_gate
        ):
            continue
        if lexical_score < 0.16 and subject_anchor_score < 0.2 and vector_score < 0.25:
            continue

        hits.append(
            RetrievalHit(
                knowledge_base_id=candidate.knowledge_base_id,
                knowledge_base_name=candidate.knowledge_base_name,
                document_id=candidate.document_id,
                document_name=candidate.document_name,
                location_label=candidate.location_label,
                text=candidate.text,
                vector_distance=candidate.vector_distance,
                lexical_score=lexical_score,
                subject_score=subject_score,
                combined_score=combined_score,
            )
        )

    hits.sort(key=lambda item: item.combined_score, reverse=True)
    return hits


def build_retrieval_snapshot(hits: Sequence[RetrievalHit]) -> Dict[str, List[List[object]]]:
    return {
        "documents": [[hit.text for hit in hits]],
        "metadatas": [[
            {
                "knowledge_base_id": hit.knowledge_base_id,
                "knowledge_base_name": hit.knowledge_base_name,
                "document_id": hit.document_id,
                "document_name": hit.document_name,
                "location_label": hit.location_label,
                "combined_score": round(hit.combined_score, 4),
                "lexical_score": round(hit.lexical_score, 4),
                "subject_score": round(hit.subject_score, 4),
            }
            for hit in hits
        ]],
        "distances": [[round(hit.vector_distance, 4) for hit in hits]],
    }


def rerank_hits(raw_results: Dict[str, List[List[object]]], question: str) -> List[RetrievalHit]:
    documents = raw_results.get("documents", [[]])[0]
    metadatas = raw_results.get("metadatas", [[]])[0]
    distances = raw_results.get("distances", [[]])[0]
    question_terms = build_query_terms(question)
    overview_question = is_overview_question(question)
    subject_terms = extract_subject_terms(question)
    hits: List[RetrievalHit] = []

    for document_text, metadata, distance in zip(documents, metadatas, distances):
        if not isinstance(document_text, str) or not isinstance(metadata, dict):
            continue
        lexical_score = compute_lexical_score(document_text, question_terms)
        vector_score = normalize_vector_score(distance)
        subject_score = compute_subject_score(document_text, subject_terms)
        combined_score = lexical_score * 0.48 + vector_score * 0.30 + subject_score * 0.22
        if subject_terms:
            if subject_score >= 0.85:
                combined_score += SUBJECT_BOOST
            elif subject_score < 0.2:
                combined_score -= SUBJECT_PENALTY
        vector_gate = 0.38 if overview_question else MIN_VECTOR_ONLY_SCORE
        if subject_terms and subject_score < 0.2 and lexical_score < 0.28:
            continue
        if lexical_score < 0.08 and vector_score < vector_gate:
            continue

        hits.append(
            RetrievalHit(
                knowledge_base_id=str(metadata.get("knowledge_base_id", "")),
                knowledge_base_name=str(metadata.get("knowledge_base_name", "")),
                document_id=str(metadata.get("document_id", "")),
                document_name=str(metadata.get("document_name", "")),
                location_label=str(metadata.get("location_label", "")),
                text=document_text,
                vector_distance=float(distance or 0.0),
                lexical_score=lexical_score,
                subject_score=subject_score,
                combined_score=combined_score,
            )
        )

    hits.sort(key=lambda item: item.combined_score, reverse=True)
    return hits


def select_top_hits(hits: Sequence[RetrievalHit]) -> List[RetrievalHit]:
    if not hits:
        return []
    lead_score = hits[0].combined_score
    min_score = max(MIN_EVIDENCE_SCORE, lead_score * RELATIVE_HIT_SCORE_THRESHOLD)
    lead_subject_score = hits[0].subject_score
    eligible = [
        hit
        for hit in hits
        if hit.combined_score >= min_score
        and (lead_subject_score < 0.2 or hit.subject_score >= max(0.45, lead_subject_score * 0.72))
    ]

    selected: List[RetrievalHit] = []
    selected_document_ids: set[str] = set()
    for hit in eligible:
        if hit.document_id in selected_document_ids:
            continue
        selected.append(hit)
        selected_document_ids.add(hit.document_id)
        if len(selected) >= MAX_CITATIONS:
            return selected

    for hit in eligible:
        if len(selected) >= MAX_CITATIONS:
            break
        if hit in selected:
            continue
        selected.append(hit)

    return selected[:MAX_CITATIONS]


def normalize_vector_score(distance: object) -> float:
    value = float(distance or 0.0)
    return max(0.0, 1.0 - value / 2.0)


def compute_lexical_score(document_text: str, question_terms: Sequence[str]) -> float:
    if not question_terms:
        return 0.0
    document_terms = build_document_terms(document_text)
    if not document_terms:
        return 0.0
    weighted_total = sum(max(1.0, min(len(term), 8) / 2) for term in question_terms)
    weighted_hits = 0.0
    for term in question_terms:
        if not term:
            continue
        weight = max(1.0, min(len(term), 8) / 2)
        best_score = 0.0
        for document_term in document_terms:
            if not likely_related(term, document_term):
                continue
            best_score = max(best_score, compute_term_similarity(term, document_term))
            if best_score >= 0.999:
                break
        if best_score >= FUZZY_TERM_MATCH_THRESHOLD:
            weighted_hits += weight * best_score

    return min(1.0, weighted_hits / max(weighted_total, 1.0))


def compute_document_name_score(document_name: str, question_terms: Sequence[str], subject_terms: Sequence[str]) -> float:
    lexical_score = compute_lexical_score(document_name, question_terms)
    subject_score = compute_subject_score(document_name, subject_terms)
    return max(lexical_score, subject_score)


def is_overview_question(question: str) -> bool:
    normalized = re.sub(r"\s+", "", question.strip().lower())
    if not normalized:
        return False
    return any(pattern in normalized for pattern in OVERVIEW_QUESTION_PATTERNS)


def build_query_terms(question: str) -> List[str]:
    base_terms = extract_terms(question)
    focus_terms = extract_focus_terms(question)
    subject_terms = extract_subject_terms(question)
    return dedupe_terms(base_terms + focus_terms + subject_terms + [canonicalize_term(term) for term in focus_terms + subject_terms])


def build_document_terms(document_text: str) -> List[str]:
    base_terms = extract_terms(document_text)
    focus_terms = extract_focus_terms(document_text)
    return dedupe_terms(focus_terms + [canonicalize_term(term) for term in focus_terms] + base_terms[:120])


def extract_subject_terms(question: str) -> List[str]:
    normalized = SUBJECT_PREFIX_PATTERN.sub("", question.strip().lower())
    normalized = re.sub(r"[？?。!！]", "", normalized)
    candidates: List[str] = []
    entity_terms = extract_entity_like_subjects(normalized)
    if entity_terms:
        return remove_contained_subjects(dedupe_terms(entity_terms))[:4]

    match = re.search(r"(.+?)(是谁|是什么|做了什么|发生了什么|有哪些|如何|怎么|怎样|模式|路径|方式|影响|作用|定义|概念)", normalized)
    if match:
        subject = match.group(1).strip("：:，, ")
        if "的" in subject:
            subject = subject.split("的", 1)[0].strip()
        if subject:
            candidates.append(subject)

    for term in extract_focus_terms(normalized):
        if len(term) < 2:
            continue
        if term in SUBJECT_STOP_TERMS:
            continue
        if len(term) > 12:
            continue
        if term.endswith(("是什么", "做了什么", "发生了什么")):
            continue
        if any(stop in term and len(term) <= len(stop) + 1 for stop in SUBJECT_STOP_TERMS):
            continue
        candidates.append(term)

    return remove_contained_subjects(dedupe_terms(candidates))[:4]


def extract_entity_like_subjects(text: str) -> List[str]:
    ordered: "OrderedDict[str, None]" = OrderedDict()

    for pattern in PERSON_CUE_PATTERNS:
        for match in pattern.finditer(text):
            candidate = match.group(1).strip()
            if 2 <= len(candidate) <= 4:
                ordered[candidate] = None

    for pattern in (REGION_ENTITY_PATTERN, ORG_ENTITY_PATTERN):
        for match in pattern.finditer(text):
            candidate = match.group(0).strip()
            if 2 <= len(candidate) <= 18:
                ordered[candidate] = None

    return list(ordered.keys())


def remove_contained_subjects(subject_terms: Sequence[str]) -> List[str]:
    result: List[str] = []
    for term in sorted(subject_terms, key=len, reverse=True):
        if any(term != kept and term in kept for kept in result):
            continue
        result.append(term)
    return result


def compute_subject_score(document_text: str, subject_terms: Sequence[str]) -> float:
    if not subject_terms:
        return 0.0
    document_terms = build_document_terms(document_text)
    if not document_terms:
        return 0.0

    scores: List[float] = []
    for subject_term in subject_terms:
        best_score = 0.0
        for document_term in document_terms:
            if not likely_related(subject_term, document_term):
                continue
            best_score = max(best_score, compute_term_similarity(subject_term, document_term))
            if best_score >= 0.999:
                break
        scores.append(best_score)

    if not scores:
        return 0.0
    return sum(scores) / len(scores)


def extract_focus_terms(text: str) -> List[str]:
    normalized = re.sub(r"\s+", " ", text).strip().lower()
    if not normalized:
        return []

    ordered: "OrderedDict[str, None]" = OrderedDict()
    for segment in re.split(r"[，,。；;：:\n]", normalized):
        segment = segment.strip()
        if len(segment) < 2:
            continue
        ordered[segment] = None
        for part in re.split(r"[的与和及在中对关于]", segment):
            part = part.strip()
            if len(part) >= 2:
                ordered[part] = None
    return list(ordered.keys())


def canonicalize_term(term: str) -> str:
    normalized = term.strip().lower()
    if len(normalized) < 2:
        return normalized

    for canonical, *aliases in SYNONYM_SUFFIX_GROUPS:
        for alias in aliases:
            if normalized.endswith(alias) and len(normalized) > len(alias):
                return f"{normalized[:-len(alias)]}{canonical}"
    return normalized


def dedupe_terms(terms: Sequence[str]) -> List[str]:
    ordered: "OrderedDict[str, None]" = OrderedDict()
    for term in terms:
        normalized = term.strip().lower()
        if len(normalized) < 2:
            continue
        if normalized in GENERIC_TERMS and len(normalized) <= 3:
            continue
        ordered[normalized] = None
    return list(ordered.keys())


def likely_related(left: str, right: str) -> bool:
    if left == right:
        return True
    if left in right or right in left:
        return True
    if canonicalize_term(left) == canonicalize_term(right):
        return True
    if min(len(left), len(right)) < 3:
        return False
    return compute_term_similarity(left, right) >= FUZZY_TERM_MATCH_THRESHOLD


def compute_term_similarity(left: str, right: str) -> float:
    left_normalized = left.lower()
    right_normalized = right.lower()
    if left_normalized == right_normalized:
        return 1.0

    left_canonical = canonicalize_term(left_normalized)
    right_canonical = canonicalize_term(right_normalized)
    if left_canonical == right_canonical:
        return 0.96

    if left_canonical in right_canonical or right_canonical in left_canonical:
        shorter = min(len(left_canonical), len(right_canonical))
        longer = max(len(left_canonical), len(right_canonical))
        return min(0.95, 0.76 + shorter / max(longer, 1) * 0.18)

    sequence_score = SequenceMatcher(None, left_canonical, right_canonical).ratio()
    bigram_score = compute_bigram_similarity(left_canonical, right_canonical)
    return max(sequence_score, bigram_score)


def compute_bigram_similarity(left: str, right: str) -> float:
    left_bigrams = build_bigrams(left)
    right_bigrams = build_bigrams(right)
    if not left_bigrams or not right_bigrams:
        return 0.0
    intersection = len(left_bigrams & right_bigrams)
    union = len(left_bigrams | right_bigrams)
    if union == 0:
        return 0.0
    return intersection / union


def build_bigrams(value: str) -> set[str]:
    if len(value) < 2:
        return set()
    return {value[index : index + 2] for index in range(len(value) - 1)}


def build_citation(hit: RetrievalHit, question: str) -> QACitation:
    snippet, ranges = build_snippet_and_highlights(hit.text, question)
    return QACitation(
        knowledge_base_id=hit.knowledge_base_id,
        knowledge_base_name=hit.knowledge_base_name,
        document_id=hit.document_id,
        document_name=hit.document_name,
        location_label=hit.location_label,
        snippet=snippet,
        highlight_ranges=[CitationHighlightRange(start=start, end=end) for start, end in ranges],
        score=round(hit.combined_score, 4),
    )


def build_matched_documents(hits: Sequence[RetrievalHit]) -> List[QAMatchedDocument]:
    ranked_documents: "OrderedDict[str, RetrievalHit]" = OrderedDict()
    for hit in hits:
        current = ranked_documents.get(hit.document_id)
        if current is None or hit.combined_score > current.combined_score:
            ranked_documents[hit.document_id] = hit

    return [
        QAMatchedDocument(
            knowledge_base_id=hit.knowledge_base_id,
            knowledge_base_name=hit.knowledge_base_name,
            document_id=hit.document_id,
            document_name=hit.document_name,
            score=round(hit.combined_score, 4),
        )
        for hit in ranked_documents.values()
    ]


def build_answer(question: str, citations: Sequence[QACitation]) -> str:
    evidence_lines: List[str] = []
    for citation in citations:
        line = extract_answer_line(citation.snippet, question)
        if line and line not in evidence_lines:
            evidence_lines.append(line)
        if len(evidence_lines) >= 2:
            break

    if not evidence_lines:
        return "未找到足够依据，当前选定知识库内没有足够证据支持回答这个问题。"

    answer_body = "；".join(evidence_lines)
    return f"{answer_body}。"


def generate_answer_with_qwen(
    *,
    question: str,
    knowledge_base_names: Sequence[str],
    citations: Sequence[QACitation],
) -> tuple[str, bool, str]:
    settings = get_settings()
    fallback_answer = build_answer(question, citations)

    if not settings.llm_enabled:
        return fallback_answer, True, "本地模型未启用，已使用抽取式回答。"

    system_prompt, user_prompt = build_qa_prompts(
        question=question,
        knowledge_base_names=knowledge_base_names,
        citations=citations,
    )

    try:
        answer = generate_text(
            model=settings.llm_model_name,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=settings.llm_temperature,
            max_tokens=settings.llm_max_tokens,
            base_url=settings.llm_base_url,
            timeout_seconds=settings.llm_timeout_seconds,
        )
        cleaned_answer = answer.strip()
        if cleaned_answer:
            return cleaned_answer, False, ""
    except LLMServiceUnavailableError:
        if not settings.llm_fallback_to_extractive:
            raise
        return fallback_answer, True, "本地 Ollama 服务不可用，已回退到抽取式回答。"
    except LLMModelNotFoundError:
        if not settings.llm_fallback_to_extractive:
            raise
        return fallback_answer, True, f"本地模型 {settings.llm_model_name} 未安装，已回退到抽取式回答。"
    except LLMRequestTimeoutError:
        if not settings.llm_fallback_to_extractive:
            raise
        return fallback_answer, True, "本地模型响应超时，已回退到抽取式回答。"
    except LLMEmptyResponseError:
        if not settings.llm_fallback_to_extractive:
            raise
        return fallback_answer, True, "本地模型未返回有效内容，已回退到抽取式回答。"
    except LLMClientError:
        if not settings.llm_fallback_to_extractive:
            raise

    return fallback_answer, True, "本地模型调用失败，已回退到抽取式回答。"


def build_snippet_and_highlights(text: str, question: str) -> tuple[str, List[tuple[int, int]]]:
    raw_text = normalize_source_text(text)
    if not raw_text:
        return "", []

    candidate_terms = [term for term in extract_terms(question) if len(term) >= 2]
    candidate_terms.sort(key=len, reverse=True)

    first_start: Optional[int] = None
    first_end: Optional[int] = None
    text_lower = raw_text.lower()
    for term in candidate_terms:
        start = text_lower.find(term.lower())
        if start >= 0:
            first_start = start
            first_end = start + len(term)
            break

    snippet = extract_best_snippet(raw_text, candidate_terms, first_start, first_end)
    highlights: List[tuple[int, int]] = []
    snippet_lower = snippet.lower()
    for term in candidate_terms:
        cursor = 0
        while cursor < len(snippet):
            index = snippet_lower.find(term.lower(), cursor)
            if index < 0:
                break
            highlights.append((index, index + len(term)))
            cursor = index + len(term)

    return snippet, merge_ranges(highlights)


def normalize_source_text(text: str) -> str:
    normalized = re.sub(r"\s+", " ", text).strip()
    patterns = [
        r"\bhttps?://\S+",
        r"\b\d{4}/\d{1,2}/\d{1,2}\s+\d{1,2}:\d{2}\b",
        r"第\d+/\d+页",
        r"第\d+页",
    ]
    for pattern in patterns:
        normalized = re.sub(pattern, " ", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def extract_best_snippet(
    raw_text: str,
    candidate_terms: Sequence[str],
    first_start: Optional[int],
    first_end: Optional[int],
) -> str:
    segments = split_into_meaningful_segments(raw_text)
    if not segments:
        return raw_text[:220].strip()

    best_segment = ""
    best_score = -1.0
    for segment in segments:
        lexical_score = compute_lexical_score(segment, candidate_terms)
        if lexical_score <= 0 and not contains_any_term(segment, candidate_terms):
            continue
        density_bonus = min(len(segment), 180) / 1800
        score = lexical_score + density_bonus
        if score > best_score:
            best_score = score
            best_segment = segment

    if best_segment:
        return trim_snippet(best_segment, candidate_terms, 220)

    if first_start is None:
        return trim_snippet(raw_text[:220], candidate_terms, 220)

    snippet_start = max(0, first_start - 50)
    snippet_end = min(len(raw_text), max((first_end or first_start) + 110, first_start + 140))
    return trim_snippet(raw_text[snippet_start:snippet_end], candidate_terms, 220)


def split_into_meaningful_segments(text: str) -> List[str]:
    coarse_segments = [segment.strip() for segment in re.split(r"[。；;!?！？\n]", text) if segment.strip()]
    result: List[str] = []
    for segment in coarse_segments:
        if " | " in segment:
            pieces = [piece.strip() for piece in segment.split(" | ") if piece.strip()]
            result.extend(piece for piece in pieces if len(piece) >= 6)
            continue
        result.append(segment)
    return [segment for segment in result if len(segment) >= 6]


def contains_any_term(text: str, terms: Sequence[str]) -> bool:
    lowered = text.lower()
    return any(term.lower() in lowered for term in terms if term)


def trim_snippet(text: str, candidate_terms: Sequence[str], limit: int) -> str:
    snippet = text.strip()
    if len(snippet) <= limit:
        return snippet

    lowered = snippet.lower()
    best_start = 0
    for term in candidate_terms:
        index = lowered.find(term.lower())
        if index >= 0:
            best_start = max(0, index - 36)
            break

    trimmed = snippet[best_start : best_start + limit].strip()
    return trimmed


def merge_ranges(ranges: Sequence[tuple[int, int]]) -> List[tuple[int, int]]:
    if not ranges:
        return []
    ordered = sorted(ranges, key=lambda item: (item[0], item[1]))
    merged: List[tuple[int, int]] = [ordered[0]]
    for start, end in ordered[1:]:
        last_start, last_end = merged[-1]
        if start <= last_end:
            merged[-1] = (last_start, max(last_end, end))
        else:
            merged.append((start, end))
    return merged


def clean_sentence(snippet: str) -> str:
    sentence = snippet.strip().strip("；;。")
    if len(sentence) > 120:
        sentence = sentence[:120].rstrip()
    return sentence


def extract_answer_line(snippet: str, question: str) -> str:
    raw = clean_sentence(snippet)
    if not raw:
        return ""

    raw = re.sub(r"\s+", " ", raw)
    segments = [segment.strip() for segment in re.split(r"[。；;!?！？\n]", raw) if segment.strip()]
    cleaned_segments: List[str] = []
    for segment in segments:
        if " | " in segment:
            parts = [part.strip() for part in segment.split(" | ") if part.strip()]
            meaningful_parts = [part for part in parts if part not in {"主题", "内容", "字段", "值"}]
            if meaningful_parts:
                segment = meaningful_parts[-1]
        cleaned_segments.append(segment)

    question_terms = [term for term in extract_terms(question) if len(term) >= 2]
    ranked_segments = sorted(
        cleaned_segments,
        key=lambda item: (
            compute_lexical_score(item, question_terms),
            len(item),
        ),
        reverse=True,
    )

    for segment in ranked_segments:
        normalized = segment.strip("：:，, ")
        if len(normalized) >= 8:
            return clean_sentence(normalized)

    return clean_sentence(cleaned_segments[0]) if cleaned_segments else ""
