from pathlib import Path


def get_project_root() -> Path:
    return Path(__file__).resolve().parents[4]


def get_storage_root() -> Path:
    return get_project_root() / "storage"


def ensure_runtime_dirs() -> dict[str, Path]:
    storage_root = get_storage_root()
    files_dir = storage_root / "files"
    exports_dir = storage_root / "exports"
    logs_dir = storage_root / "logs"

    for path in (storage_root, files_dir, exports_dir, logs_dir):
        path.mkdir(parents=True, exist_ok=True)

    return {
        "storage": storage_root,
        "files": files_dir,
        "exports": exports_dir,
        "logs": logs_dir,
    }
