from typing import Union

from fastapi import APIRouter

from app.core.config import get_settings
from app.core.db import get_database_path
from app.core.paths import ensure_runtime_dirs

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/health")
def get_health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/config")
def get_config() -> dict[str, Union[str, bool]]:
    settings = get_settings()
    runtime_dirs = ensure_runtime_dirs()
    return {
        "app_name": settings.app_name,
        "app_version": settings.app_version,
        "storage_dir": str(runtime_dirs["storage"]),
        "files_dir": str(runtime_dirs["files"]),
        "exports_dir": str(runtime_dirs["exports"]),
        "logs_dir": str(runtime_dirs["logs"]),
        "database_path": str(get_database_path()),
        "ocr_enabled": settings.ocr_enabled,
        "model_config_name": settings.model_config_name,
    }
