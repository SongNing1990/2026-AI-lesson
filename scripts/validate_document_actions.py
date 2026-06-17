import io
import shutil
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


def print_result(name: str, passed: bool, detail: str) -> None:
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {name}: {detail}")


def main() -> int:
    storage_root = Path(__file__).resolve().parents[1] / "storage" / "files"
    if storage_root.exists():
        shutil.rmtree(storage_root)
    storage_root.mkdir(parents=True, exist_ok=True)

    client = TestClient(app)

    kb_response = client.post(
        "/knowledge-bases",
        json={"name": "Doc Action KB", "description": "validate document actions"},
    )
    kb_response.raise_for_status()
    knowledge_base_id = kb_response.json()["id"]

    upload_response = client.post(
        "/documents/upload",
        data={"knowledge_base_id": knowledge_base_id},
        files=[("files", ("sample.docx", io.BytesIO(b"docx-binary"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))],
    )
    upload_response.raise_for_status()
    upload_data = upload_response.json()
    document_id = upload_data["success"][0]["document_id"]

    docs_response = client.get(f"/documents?knowledge_base_id={knowledge_base_id}")
    docs_response.raise_for_status()
    document = docs_response.json()[0]
    print_result("保留原始文件名", document["name"] == "sample.docx", f"name={document['name']}")

    storage_path = Path(__file__).resolve().parents[1] / document["storage_path"]
    print_result("落盘原名可见", storage_path.name == "sample.docx", f"storage_name={storage_path.name}")
    print_result("目录使用知识库名称", storage_path.parent.name == "Doc Action KB", f"folder={storage_path.parent.name}")

    zh_upload_response = client.post(
        "/documents/upload",
        data={"knowledge_base_id": knowledge_base_id},
        files=[("files", ("政策视角下出版融合的发展与反思.docx", io.BytesIO(b"docx-binary-zh"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))],
    )
    zh_upload_response.raise_for_status()
    zh_document_id = zh_upload_response.json()["success"][0]["document_id"]
    zh_doc_response = client.get(f"/documents/{zh_document_id}")
    zh_doc_response.raise_for_status()
    zh_document = zh_doc_response.json()
    zh_storage_path = Path(__file__).resolve().parents[1] / zh_document["storage_path"]
    print_result("中文文件名保留", zh_document["name"] == "政策视角下出版融合的发展与反思.docx", f"name={zh_document['name']}")
    print_result(
        "中文文件落盘名称保留",
        zh_storage_path.name == "政策视角下出版融合的发展与反思.docx",
        f"storage_name={zh_storage_path.name}",
    )

    open_response = client.get(f"/documents/{document_id}/open")
    print_result(
        "打开原始文件接口",
        open_response.status_code == 200 and "inline" in open_response.headers.get("content-disposition", ""),
        f"status={open_response.status_code} disposition={open_response.headers.get('content-disposition')}",
    )

    download_response = client.get(f"/documents/{document_id}/download")
    print_result(
        "下载文件接口",
        download_response.status_code == 200 and "attachment" in download_response.headers.get("content-disposition", ""),
        f"status={download_response.status_code} disposition={download_response.headers.get('content-disposition')}",
    )

    delete_response = client.delete(f"/documents/{document_id}")
    print_result(
        "删除文件接口",
        delete_response.status_code == 200,
        f"status={delete_response.status_code} body={delete_response.text}",
    )
    print_result("删除后本地文件清理", not storage_path.exists(), f"exists={storage_path.exists()}")
    deleted_doc_response = client.get(f"/documents/{document_id}")
    print_result("删除后记录不可见", deleted_doc_response.status_code == 404, f"status={deleted_doc_response.status_code}")

    link_response = client.post(
        "/documents/import-links",
        json={
            "knowledge_base_id": knowledge_base_id,
            "urls": ["https://example.com"],
        },
    )
    link_response.raise_for_status()
    link_data = link_response.json()
    print_result(
        "网页链接导入",
        len(link_data["success"]) == 1,
        f"success={len(link_data['success'])} failed={len(link_data['failed'])}",
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
