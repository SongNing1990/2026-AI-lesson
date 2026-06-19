import csv
import json
import shutil
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.db import init_db
from app.core.paths import ensure_runtime_dirs, get_storage_root
from app.main import app


def print_result(name: str, passed: bool, detail: str) -> None:
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {name}: {detail}")


def create_csv(path: Path, topic: str, summary: str) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["主题", "内容"])
        writer.writerow([topic, summary])


def upload_and_index_document(client: TestClient, knowledge_base_id: str, file_path: Path) -> dict:
    upload_response = client.post(
        "/documents/upload",
        data={"knowledge_base_id": knowledge_base_id},
        files=[("files", (file_path.name, file_path.read_bytes(), "text/csv"))],
    )
    upload_response.raise_for_status()
    document_id = upload_response.json()["success"][0]["document_id"]

    index_response = client.post(f"/documents/{document_id}/index")
    index_response.raise_for_status()
    return index_response.json()


def main() -> int:
    ensure_runtime_dirs()
    init_db()

    chroma_dir = get_storage_root() / "chroma"
    if chroma_dir.exists():
        shutil.rmtree(chroma_dir)

    temp_dir = Path(tempfile.mkdtemp(prefix="step7_"))
    try:
        theory_a = temp_dir / "theory-a.csv"
        theory_b = temp_dir / "theory-b.csv"
        theory_c = temp_dir / "latin-publishing.csv"
        theory_d = temp_dir / "beijing-publishing.csv"
        theory_e = temp_dir / "pku-publishing.csv"
        create_csv(theory_a, "行动者网络理论", "行动者网络理论强调人类与非人类行动者共同构成网络，并通过关联关系塑造行动。")
        create_csv(theory_b, "行动者网络理论", "在课程管理场景里，行动者网络理论可用于分析平台、教师、学生、规则之间的协同。")
        create_csv(theory_c, "拉丁美洲出版教育路径", "拉丁美洲的出版教育路径强调校企协作、跨学科课程与区域实践结合，用于提升出版人才培养质量。")
        create_csv(theory_d, "北京出版教育路径", "北京的出版教育路径强调产学研联动、课程分层与本地实践基地建设。")
        create_csv(theory_e, "北京大学出版教育路径", "北京大学的出版教育路径强调学科交叉、出版实验平台与课程协同。")

        client = TestClient(app)

        kb_a = client.post("/knowledge-bases", json={"name": "ANT 研究", "description": "theory"}).json()
        kb_b = client.post("/knowledge-bases", json={"name": "课程管理", "description": "course"}).json()

        doc_a = upload_and_index_document(client, kb_a["id"], theory_a)
        doc_b = upload_and_index_document(client, kb_b["id"], theory_b)
        doc_c = upload_and_index_document(client, kb_a["id"], theory_c)
        doc_d = upload_and_index_document(client, kb_a["id"], theory_d)
        doc_e = upload_and_index_document(client, kb_a["id"], theory_e)

        ask_a = client.post(
            "/qa/ask",
            json={
                "question": "行动者网络理论强调什么？",
                "knowledge_base_ids": [kb_a["id"]],
                "top_k": 5,
            },
        )
        ask_a.raise_for_status()
        ask_a_data = ask_a.json()

        ask_b = client.post(
            "/qa/ask",
            json={
                "question": "行动者网络理论强调什么？",
                "knowledge_base_ids": [kb_b["id"]],
                "top_k": 5,
            },
        )
        ask_b.raise_for_status()
        ask_b_data = ask_b.json()

        answer_diff_ok = ask_a_data["answer"] != ask_b_data["answer"]
        no_cross_kb = all(item["knowledge_base_id"] == kb_a["id"] for item in ask_a_data["citations"]) and all(
            item["knowledge_base_id"] == kb_b["id"] for item in ask_b_data["citations"]
        )
        print_result(
            "同问不同库结果不同且不串库",
            answer_diff_ok and no_cross_kb,
            json.dumps({"kb_a": ask_a_data, "kb_b": ask_b_data}, ensure_ascii=False),
        )

        citations_ok = bool(ask_a_data["citations"]) and bool(ask_a_data["matched_documents"])
        print_result(
            "问答结果始终带来源",
            citations_ok,
            json.dumps({"citations": ask_a_data["citations"], "matched_documents": ask_a_data["matched_documents"]}, ensure_ascii=False),
        )

        ask_none = client.post(
            "/qa/ask",
            json={
                "question": "量子纠缠实验的数学证明是什么？",
                "knowledge_base_ids": [kb_a["id"]],
                "top_k": 5,
            },
        )
        ask_none.raise_for_status()
        ask_none_data = ask_none.json()
        limited_ok = ask_none_data["answer_limited"] is True and "未找到足够依据" in ask_none_data["answer"]
        print_result("无命中时受限反馈", limited_ok, json.dumps(ask_none_data, ensure_ascii=False))

        ownership_ok = (
            all(item["document_id"] == doc_a["id"] and item["document_name"] == doc_a["name"] for item in ask_a_data["matched_documents"])
            and all(item["document_id"] == doc_a["id"] for item in ask_a_data["citations"])
        )
        print_result(
            "matched_documents 与 citations 归属正确",
            ownership_ok,
            json.dumps({"doc": doc_a, "ask": ask_a_data}, ensure_ascii=False),
        )

        fuzzy_ask = client.post(
            "/qa/ask",
            json={
                "question": "拉丁美洲的出版教育模式是什么？",
                "knowledge_base_ids": [kb_a["id"]],
                "top_k": 5,
            },
        )
        fuzzy_ask.raise_for_status()
        fuzzy_data = fuzzy_ask.json()
        fuzzy_ok = (
            fuzzy_data["answer_limited"] is False
            and any(item["document_id"] == doc_c["id"] for item in fuzzy_data["matched_documents"])
            and "拉丁美洲" in fuzzy_data["answer"]
        )
        print_result("主题级模糊检索可命中近义问法", fuzzy_ok, json.dumps(fuzzy_data, ensure_ascii=False))

        subject_ask = client.post(
            "/qa/ask",
            json={
                "question": "拉丁美洲的出版教育模式是什么？",
                "knowledge_base_ids": [kb_a["id"]],
                "top_k": 5,
            },
        )
        subject_ask.raise_for_status()
        subject_data = subject_ask.json()
        subject_ok = (
            subject_data["answer_limited"] is False
            and any(item["document_id"] == doc_c["id"] for item in subject_data["matched_documents"])
            and all(item["document_id"] != doc_d["id"] for item in subject_data["matched_documents"])
            and "北京" not in subject_data["answer"]
        )
        print_result("主体精准约束下的事件模糊检索", subject_ok, json.dumps(subject_data, ensure_ascii=False))

        org_ask = client.post(
            "/qa/ask",
            json={
                "question": "北京大学的出版教育模式是什么？",
                "knowledge_base_ids": [kb_a["id"]],
                "top_k": 5,
            },
        )
        org_ask.raise_for_status()
        org_data = org_ask.json()
        org_ok = (
            org_data["answer_limited"] is False
            and any(item["document_id"] == doc_e["id"] for item in org_data["matched_documents"])
            and all(item["document_id"] != doc_d["id"] for item in org_data["matched_documents"])
        )
        print_result("机构主体识别约束下的事件模糊检索", org_ok, json.dumps(org_data, ensure_ascii=False))
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
