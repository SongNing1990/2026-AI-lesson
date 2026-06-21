from typing import Union

from fastapi import APIRouter

from app.core.config import get_settings
from app.core.db import get_database_path
from app.core.paths import ensure_runtime_dirs
from app.services.llm_client import check_llm_status

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/health")
def get_health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/config")
def get_config() -> dict[str, Union[str, bool, int, float]]:
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
        "llm_enabled": settings.llm_enabled,
        "llm_provider": settings.llm_provider,
        "llm_model_name": settings.llm_model_name,
        "llm_base_url": settings.llm_base_url,
        "llm_timeout_seconds": settings.llm_timeout_seconds,
        "llm_temperature": settings.llm_temperature,
        "llm_max_tokens": settings.llm_max_tokens,
        "llm_fallback_to_extractive": settings.llm_fallback_to_extractive,
    }


@router.get("/llm-status")
def get_llm_status() -> dict[str, Union[str, bool]]:
    status = check_llm_status()
    return {
        "available": status.available,
        "provider": status.provider,
        "model": status.model,
        "reachable": status.reachable,
        "message": status.message,
    }
