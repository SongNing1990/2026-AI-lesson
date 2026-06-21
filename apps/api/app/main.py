from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from app.core.config import get_settings
from app.core.db import get_database_path, init_db
from app.routers.chat import router as chat_router
from app.routers.documents import router as documents_router
from app.routers.exports import router as exports_router
from app.routers.knowledge_bases import router as knowledge_bases_router
from app.core.paths import ensure_runtime_dirs
from app.routers.qa import router as qa_router
from app.routers.system import router as system_router

settings = get_settings()
app = FastAPI(title=settings.app_name, version=settings.app_version)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_origin_regex=r"^https?://(127\.0\.0\.1|localhost)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(knowledge_bases_router)
app.include_router(documents_router)
app.include_router(chat_router)
app.include_router(exports_router)
app.include_router(qa_router)
app.include_router(system_router)


@app.get("/", response_class=HTMLResponse)
def root() -> str:
    return """
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Local Knowledge Base API</title>
        <style>
          body {
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: linear-gradient(180deg, #f4f8ff 0%, #eaf2ff 100%);
            color: #12305f;
          }
          .wrap {
            max-width: 820px;
            margin: 48px auto;
            padding: 32px;
            background: rgba(255, 255, 255, 0.92);
            border: 1px solid rgba(18, 48, 95, 0.08);
            border-radius: 24px;
            box-shadow: 0 18px 40px rgba(24, 73, 156, 0.08);
          }
          h1 { margin-top: 0; }
          code, a { color: #1750c3; }
          ul { line-height: 1.9; padding-left: 20px; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <h1>本地知识库问答后端已启动</h1>
          <p>这个地址是 API 服务入口，不是完整前端页面。</p>
          <ul>
            <li>前端体验地址：<a href="http://127.0.0.1:5177/" target="_blank">http://127.0.0.1:5177/</a></li>
            <li>健康检查：<a href="/system/health" target="_blank">/system/health</a></li>
            <li>系统配置：<a href="/system/config" target="_blank">/system/config</a></li>
          </ul>
        </div>
      </body>
    </html>
    """


@app.on_event("startup")
def on_startup() -> None:
    ensure_runtime_dirs()
    get_database_path().touch(exist_ok=True)
    init_db()
