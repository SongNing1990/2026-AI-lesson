import csv
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


def main() -> int:
    ensure_runtime_dirs()
    init_db()

    temp_dir = Path(tempfile.mkdtemp(prefix="step8_"))
    try:
        client = TestClient(app)

        kb = client.post("/knowledge-bases", json={"name": "Step8 Session KB", "description": "session test"}).json()
        doc_path = temp_dir / "session.csv"
        create_csv(
            doc_path,
            "行动者网络理论",
            "行动者网络理论强调人类与非人类行动者构成网络，分析关系、翻译与协同。",
        )
        upload = client.post(
            "/documents/upload",
            data={"knowledge_base_id": kb["id"]},
            files=[("files", (doc_path.name, doc_path.read_bytes(), "text/csv"))],
        )
        upload.raise_for_status()

        session_create = client.post(
            "/chat/sessions",
            json={"title": "ANT 会话", "knowledge_base_ids": [kb["id"]]},
        )
        session_create.raise_for_status()
        session_data = session_create.json()
        session_id = session_data["id"]

        ask1 = client.post(
            "/qa/ask",
            json={"question": "行动者网络理论强调什么？", "session_id": session_id, "top_k": 5},
        )
        ask1.raise_for_status()
        ask1_data = ask1.json()

        ask2 = client.post(
            "/qa/ask",
            json={"question": "那它在这里主要分析什么？", "session_id": session_id, "top_k": 5},
        )
        ask2.raise_for_status()
        ask2_data = ask2.json()

        ask3 = client.post(
            "/qa/ask",
            json={"question": "再用一句话概括一下。", "session_id": session_id, "top_k": 5},
        )
        ask3.raise_for_status()
        ask3_data = ask3.json()

        session_detail = client.get(f"/chat/sessions/{session_id}")
        session_detail.raise_for_status()
        detail_data = session_detail.json()

        drift_ok = (
            "行动者网络理论" in ask1_data["answer"]
            and ask2_data["answer_limited"] is False
            and ask3_data["answer_limited"] is False
        )
        print_result("连续追问 3 轮主题不明显漂移", drift_ok, ask3_data["answer"])

        kb_scope_ok = all(item["knowledge_base_id"] == kb["id"] for item in ask2_data["citations"])
        print_result("每轮问答仍受知识库范围限制", kb_scope_ok, str(ask2_data["citations"]))

        history_ok = len(detail_data["messages"]) >= 6
        print_result("历史消息已持久化", history_ok, f"messages={len(detail_data['messages'])}")

        renamed = client.post(f"/chat/sessions/{session_id}/rename", json={"title": "重命名后的会话"})
        renamed.raise_for_status()
        rename_ok = renamed.json()["title"] == "重命名后的会话"
        print_result("会话可重命名", rename_ok, renamed.text)

        client_reopen = TestClient(app)
        reopened = client_reopen.get(f"/chat/sessions/{session_id}")
        reopened.raise_for_status()
        reopened_ok = len(reopened.json()["messages"]) >= 6
        print_result("重开应用后还能看到历史会话和消息", reopened_ok, reopened.text[:240])

        cleared = client.post(f"/chat/sessions/{session_id}/clear")
        cleared.raise_for_status()
        after_clear = client.get(f"/chat/sessions/{session_id}")
        after_clear.raise_for_status()
        clear_ok = len(after_clear.json()["messages"]) == 0
        print_result("会话可清空", clear_ok, after_clear.text)

        deleted = client.delete(f"/chat/sessions/{session_id}")
        deleted.raise_for_status()
        deleted_lookup = client.get(f"/chat/sessions/{session_id}")
        delete_ok = deleted_lookup.status_code == 404
        print_result("会话可删除", delete_ok, deleted_lookup.text)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
