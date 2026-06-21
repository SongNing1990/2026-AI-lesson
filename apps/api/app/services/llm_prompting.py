from typing import List, Sequence, Tuple

from app.schemas.qa import QACitation


MAX_PROMPT_CITATIONS = 5
MAX_CITATION_SNIPPET_LENGTH = 420
MAX_TOTAL_CONTEXT_LENGTH = 2200


def _normalize_text(value: str) -> str:
    return " ".join(value.strip().split())


def _truncate_text(value: str, limit: int) -> str:
    text = _normalize_text(value)
    if len(text) <= limit:
        return text
    return f"{text[:limit].rstrip()}..."


def _dedupe_citations(citations: Sequence[QACitation]) -> List[QACitation]:
    seen: set[tuple[str, str, str]] = set()
    result: List[QACitation] = []
    for citation in citations:
        key = (citation.document_id, citation.location_label, _normalize_text(citation.snippet))
        if key in seen:
            continue
        seen.add(key)
        result.append(citation)
    return result


def _select_prompt_citations(citations: Sequence[QACitation]) -> List[QACitation]:
    deduped = _dedupe_citations(citations)
    selected: List[QACitation] = []
    current_total = 0

    for citation in deduped[:MAX_PROMPT_CITATIONS]:
        snippet = _truncate_text(citation.snippet, MAX_CITATION_SNIPPET_LENGTH)
        estimated = len(snippet)
        if selected and current_total + estimated > MAX_TOTAL_CONTEXT_LENGTH:
            break
        selected.append(
            QACitation(
                knowledge_base_id=citation.knowledge_base_id,
                knowledge_base_name=citation.knowledge_base_name,
                document_id=citation.document_id,
                document_name=citation.document_name,
                location_label=citation.location_label,
                snippet=snippet,
                highlight_ranges=citation.highlight_ranges,
                score=citation.score,
            )
        )
        current_total += estimated

    return selected


def build_evidence_blocks(citations: Sequence[QACitation]) -> str:
    selected = _select_prompt_citations(citations)
    if not selected:
        return "当前没有可用证据。"

    blocks: List[str] = []
    for index, citation in enumerate(selected, start=1):
        blocks.append(
            "\n".join(
                [
                    f"[证据{index}]",
                    f"知识库：{citation.knowledge_base_name}",
                    f"文档：{citation.document_name}",
                    f"定位：{citation.location_label}",
                    f"内容：{citation.snippet}",
                ]
            )
        )
    return "\n\n".join(blocks)


def build_qa_prompts(
    *,
    question: str,
    knowledge_base_names: Sequence[str],
    citations: Sequence[QACitation],
) -> Tuple[str, str]:
    normalized_question = _normalize_text(question)
    normalized_knowledge_bases = [name.strip() for name in knowledge_base_names if name and name.strip()]
    scope_text = "、".join(normalized_knowledge_bases) if normalized_knowledge_bases else "当前选定知识库"
    evidence_text = build_evidence_blocks(citations)

    system_prompt = (
        "你是一个本地知识库问答助手。"
        "你只能依据系统提供的证据回答，不得编造、不补充证据之外的事实。"
        "如果证据不足，请明确说明“当前证据不足，无法确认”。"
        "请使用简体中文作答。"
        "回答要直接、清楚、结构稳定。"
        "不要把文件名本身当成事实内容，不要自行输出来源列表。"
    )

    user_prompt = "\n".join(
        [
            "请基于以下知识库证据回答问题。",
            f"问题：{normalized_question}",
            f"知识库范围：{scope_text}",
            "",
            "证据如下：",
            evidence_text,
            "",
            "输出要求：",
            "1. 先直接回答问题。",
            "2. 如有必要，再做 2 到 4 句简短归纳。",
            "3. 如果证据不足，请明确说明“当前证据不足，无法确认”。",
            "4. 不要输出额外来源列表，不要写“根据文件名”之类表述。",
        ]
    )

    return system_prompt, user_prompt
