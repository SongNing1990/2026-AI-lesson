import io
import json
import shutil
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.db import SessionLocal
from app.main import app
from app.models.documents import Document
from app.models.knowledge_bases import KnowledgeBase


def print_result(name: str, passed: bool, detail: str) -> None:
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {name}: {detail}")


def ensure_clean_storage() -> None:
    storage_root = Path(__file__).resolve().parents[1] / "storage" / "files"
    if storage_root.exists():
        shutil.rmtree(storage_root)
    storage_root.mkdir(parents=True, exist_ok=True)


def main() -> int:
    ensure_clean_storage()
    client = TestClient(app)

    kb_response = client.post(
        "/knowledge-bases",
        json={"name": "Step4 Upload KB", "description": "for validation"},
    )
    kb_response.raise_for_status()
    kb = kb_response.json()
    knowledge_base_id = kb["id"]

    files = [
        ("files", ("sample.pdf", io.BytesIO(b"%PDF-1.4 sample"), "application/pdf")),
        ("files", ("notes.csv", io.BytesIO(b"a,b\n1,2\n"), "text/csv")),
        ("files", ("bad.txt", io.BytesIO(b"plain text"), "text/plain")),
        ("files", ("empty.jpg", io.BytesIO(b""), "image/jpeg")),
    ]

    upload_response = client.post(
        "/documents/upload",
        data={"knowledge_base_id": knowledge_base_id},
        files=files,
    )
    upload_response.raise_for_status()
    upload_data = upload_response.json()

    success_count = len(upload_data["success"])
    failed_count = len(upload_data["failed"])
    print_result(
        "逐项上传结果",
        success_count == 2 and failed_count == 2,
        json.dumps(upload_data, ensure_ascii=False),
    )

    docs_response = client.get(f"/documents?knowledge_base_id={knowledge_base_id}")
    docs_response.raise_for_status()
    docs = docs_response.json()
    pending_ok = len(docs) == 2 and all(item["parse_status"] == "pending" for item in docs)
    print_result("documents 记录", pending_ok, f"count={len(docs)} statuses={[item['parse_status'] for item in docs]}")

    session = SessionLocal()
    try:
        db_docs = session.query(Document).filter(Document.knowledge_base_id == knowledge_base_id).all()
        storage_checks = []
        for document in db_docs:
            path = Path(__file__).resolve().parents[1] / document.storage_path
            storage_checks.append(path.exists())
        print_result("磁盘原文件落盘", all(storage_checks) and len(storage_checks) == 2, f"exists={storage_checks}")
    finally:
        session.close()

    invalid_kb_response = client.post(
        "/documents/upload",
        data={"knowledge_base_id": "missing-kb"},
        files=[("files", ("sample.pdf", io.BytesIO(b"%PDF-1.4 sample"), "application/pdf"))],
    )
    print_result(
        "不存在知识库拦截",
        invalid_kb_response.status_code == 404,
        f"status={invalid_kb_response.status_code} body={invalid_kb_response.text}",
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
