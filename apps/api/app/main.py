from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.db import get_database_path, init_db
from app.routers.documents import router as documents_router
from app.routers.knowledge_bases import router as knowledge_bases_router
from app.core.paths import ensure_runtime_dirs
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
app.include_router(system_router)


@app.on_event("startup")
def on_startup() -> None:
    ensure_runtime_dirs()
    get_database_path().touch(exist_ok=True)
    init_db()
