from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from .paths import ensure_runtime_dirs

Base = declarative_base()


def get_database_path() -> Path:
    runtime_dirs = ensure_runtime_dirs()
    return runtime_dirs["storage"] / "app.db"


def get_database_url() -> str:
    return f"sqlite:///{get_database_path()}"


engine = create_engine(
    get_database_url(),
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, class_=Session)


def init_db() -> None:
    from app.models import app_settings, chat_messages, chat_sessions, document_chunks, documents, export_jobs, knowledge_bases  # noqa: F401

    Base.metadata.create_all(bind=engine)


def get_db_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
