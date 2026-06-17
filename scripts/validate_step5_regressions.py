import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

from fastapi.testclient import TestClient

from app.main import app


class MultiPageHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        pages = {
            "/one": "<html><head><title>Page One</title></head><body><p>One body.</p></body></html>",
            "/two": "<html><head><title>Page Two</title></head><body><p>Two body.</p></body></html>",
        }
        html = pages.get(self.path)
        if html is None:
            self.send_response(404)
            self.end_headers()
            return

        body = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args) -> None:
        return


def print_result(name: str, passed: bool, detail: str) -> None:
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {name}: {detail}")


def main() -> int:
    server = HTTPServer(("127.0.0.1", 8766), MultiPageHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    try:
        client = TestClient(app)
        kb_response = client.post(
            "/knowledge-bases",
            json={"name": "Step5 Regression KB", "description": "for step5 regression validation"},
        )
        kb_response.raise_for_status()
        knowledge_base_id = kb_response.json()["id"]

        batch_response = client.post(
            "/documents/import-urls",
            json={
                "knowledge_base_id": knowledge_base_id,
                "urls": [
                    "127.0.0.1:8766/one",
                    "http://127.0.0.1:8766/two",
                ],
            },
        )
        batch_response.raise_for_status()
        batch_data = batch_response.json()
        print_result(
            "两条公开网页批量导入",
            len(batch_data["success"]) == 2 and len(batch_data["failed"]) == 0,
            json.dumps(batch_data, ensure_ascii=False),
        )

        docs_response = client.get(f"/documents?knowledge_base_id={knowledge_base_id}")
        docs_response.raise_for_status()
        docs = docs_response.json()
        url_docs = [item for item in docs if item["source_type"] == "url"]
        print_result(
            "网页文档类型一致",
            len(url_docs) == 2 and all(item["file_type"] == "html" for item in url_docs),
            json.dumps(url_docs, ensure_ascii=False),
        )
    finally:
        server.shutdown()
        server.server_close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
