import mimetypes
import re
from pathlib import Path
from typing import Dict, Optional, Tuple

from fastapi import UploadFile

from app.core.paths import ensure_runtime_dirs

SUPPORTED_EXTENSIONS: Dict[str, str] = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".pptx": "pptx",
    ".xls": "excel",
    ".xlsx": "excel",
    ".csv": "csv",
    ".png": "png",
    ".jpg": "jpg",
    ".jpeg": "jpeg",
}


def get_extension(filename: str) -> str:
    return Path(filename).suffix.lower()


def detect_file_type(filename: str) -> Optional[str]:
    return SUPPORTED_EXTENSIONS.get(get_extension(filename))


def guess_mime_type(filename: str, upload_file: UploadFile) -> Optional[str]:
    if upload_file.content_type:
      return upload_file.content_type
    guessed, _ = mimetypes.guess_type(filename)
    return guessed


def sanitize_filename(filename: str) -> str:
    basename = Path(filename).name
    stem = Path(basename).stem.strip() or "file"
    suffix = Path(basename).suffix.lower()
    safe_stem = re.sub(r"[^A-Za-z0-9._\-\u4e00-\u9fff() ]+", "_", stem).strip(" ._") or "file"
    return f"{safe_stem}{suffix}"


def sanitize_folder_name(name: str) -> str:
    safe_name = re.sub(r"[^A-Za-z0-9._\-\u4e00-\u9fff() ]+", "_", name).strip(" ._") or "knowledge_base"
    return safe_name


def build_storage_path(knowledge_base_name: str, filename: str) -> Tuple[Path, str]:
    runtime_dirs = ensure_runtime_dirs()
    folder_name = sanitize_folder_name(knowledge_base_name)
    knowledge_base_dir = runtime_dirs["files"] / folder_name
    knowledge_base_dir.mkdir(parents=True, exist_ok=True)
    safe_name = sanitize_filename(filename)
    absolute_path = knowledge_base_dir / safe_name
    if absolute_path.exists():
        stem = Path(safe_name).stem
        suffix = Path(safe_name).suffix
        counter = 2
        while True:
            candidate_name = f"{stem} ({counter}){suffix}"
            absolute_path = knowledge_base_dir / candidate_name
            if not absolute_path.exists():
                safe_name = candidate_name
                break
            counter += 1
    relative_path = Path("storage") / "files" / folder_name / safe_name
    return absolute_path, str(relative_path)
