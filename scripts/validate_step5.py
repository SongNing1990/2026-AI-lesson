import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

from fastapi.testclient import TestClient

from app.main import app


class TestPageHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/ok":
            html = """
            <html>
              <head><title>Step5 Test Page</title></head>
              <body>
                <article>
                  <h1>Open Page</h1>
                  <p>This is a public test page for step five import validation.</p>
                </article>
              </body>
            </html>
            """
            body = html.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        self.send_response(404)
        self.end_headers()

    def log_message(self, format: str, *args) -> None:
        return


def print_result(name: str, passed: bool, detail: str) -> None:
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {name}: {detail}")


def main() -> int:
    server = HTTPServer(("127.0.0.1", 8765), TestPageHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    try:
        client = TestClient(app)
        kb_response = client.post(
            "/knowledge-bases",
            json={"name": "Step5 URL KB", "description": "for url import validation"},
        )
        kb_response.raise_for_status()
        knowledge_base_id = kb_response.json()["id"]

        single_response = client.post(
            "/documents/import-url",
            json={
                "knowledge_base_id": knowledge_base_id,
                "url": "http://127.0.0.1:8765/ok",
            },
        )
        single_response.raise_for_status()
        single_data = single_response.json()
        print_result(
            "单条网页导入",
            len(single_data["success"]) == 1 and len(single_data["failed"]) == 0,
            json.dumps(single_data, ensure_ascii=False),
        )

        document_id = single_data["success"][0]["document_id"]
        detail_response = client.get(f"/documents/{document_id}")
        detail_response.raise_for_status()
        detail_data = detail_response.json()
        print_result(
            "网页文档记录",
            detail_data["source_type"] == "url" and detail_data["file_type"] == "html",
            f"source_type={detail_data['source_type']} file_type={detail_data['file_type']}",
        )
        print_result(
            "网页来源 URL",
            detail_data["source_url"] == "http://127.0.0.1:8765/ok",
            f"source_url={detail_data['source_url']}",
        )

        batch_response = client.post(
            "/documents/import-urls",
            json={
                "knowledge_base_id": knowledge_base_id,
                "urls": [
                    "http://127.0.0.1:8765/ok",
                    "not a url",
                ],
            },
        )
        batch_response.raise_for_status()
        batch_data = batch_response.json()
        print_result(
            "批量网页导入逐项结果",
            len(batch_data["success"]) == 1 and len(batch_data["failed"]) == 1,
            json.dumps(batch_data, ensure_ascii=False),
        )

        invalid_response = client.post(
            "/documents/import-url",
            json={
                "knowledge_base_id": knowledge_base_id,
                "url": "http://127.0.0.1:8765/missing",
            },
        )
        invalid_response.raise_for_status()
        invalid_data = invalid_response.json()
        print_result(
            "无法访问网页错误",
            len(invalid_data["failed"]) == 1 and "HTTP Error 404" in invalid_data["failed"][0]["reason"],
            json.dumps(invalid_data, ensure_ascii=False),
        )
    finally:
        server.shutdown()
        server.server_close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
