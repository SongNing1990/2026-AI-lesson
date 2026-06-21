import json
from dataclasses import dataclass
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from app.core.config import get_settings


class LLMClientError(RuntimeError):
    """Base error for local LLM client failures."""


class LLMServiceUnavailableError(LLMClientError):
    """Raised when the local model service cannot be reached."""


class LLMModelNotFoundError(LLMClientError):
    """Raised when the configured model is not available in the runtime."""


class LLMRequestTimeoutError(LLMClientError):
    """Raised when the local model request times out."""


class LLMEmptyResponseError(LLMClientError):
    """Raised when the local model returns no usable text."""


@dataclass(frozen=True)
class LLMStatus:
    available: bool
    provider: str
    model: str
    reachable: bool
    message: str


@dataclass(frozen=True)
class LLMGenerateRequest:
    model: str
    system_prompt: str
    user_prompt: str
    temperature: float
    max_tokens: int


def _normalize_base_url(base_url: str) -> str:
    value = base_url.strip()
    if not value:
        return "http://127.0.0.1:11434/"
    if not value.endswith("/"):
        value = f"{value}/"
    return value


def _read_json_response(response: Any) -> dict[str, Any]:
    raw = response.read()
    if not raw:
        raise LLMEmptyResponseError("Ollama 返回为空。")
    try:
        return json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise LLMClientError("Ollama 返回了无法解析的 JSON。") from exc


def _extract_response_text(data: dict[str, Any]) -> str:
    text = data.get("response")
    if isinstance(text, str) and text.strip():
        return text.strip()

    message = data.get("message")
    if isinstance(message, dict):
        content = message.get("content")
        if isinstance(content, str) and content.strip():
            return content.strip()

    raise LLMEmptyResponseError("Ollama 未返回有效文本。")


def generate_text(
    *,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
    base_url: Optional[str] = None,
    timeout_seconds: Optional[int] = None,
) -> str:
    settings = get_settings()
    resolved_base_url = _normalize_base_url(base_url or settings.llm_base_url)
    resolved_timeout = timeout_seconds or settings.llm_timeout_seconds
    endpoint = urljoin(resolved_base_url, "api/generate")
    payload = {
        "model": model,
        "prompt": user_prompt,
        "system": system_prompt,
        "stream": False,
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens,
        },
    }
    request = Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=resolved_timeout) as response:
            data = _read_json_response(response)
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        lowered = body.lower()
        if exc.code == 404 or "not found" in lowered:
            raise LLMModelNotFoundError(f"Ollama 中未找到模型：{model}") from exc
        raise LLMClientError(f"Ollama 请求失败：HTTP {exc.code}") from exc
    except TimeoutError as exc:
        raise LLMRequestTimeoutError("Ollama 请求超时。") from exc
    except URLError as exc:
        raise LLMServiceUnavailableError("无法连接本地 Ollama 服务。") from exc

    return _extract_response_text(data)


def check_llm_status(
    *,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    base_url: Optional[str] = None,
    timeout_seconds: Optional[int] = None,
) -> LLMStatus:
    settings = get_settings()
    resolved_provider = provider or settings.llm_provider
    resolved_model = model or settings.llm_model_name
    resolved_base_url = _normalize_base_url(base_url or settings.llm_base_url)
    resolved_timeout = timeout_seconds or settings.llm_timeout_seconds
    endpoint = urljoin(resolved_base_url, "api/tags")
    request = Request(endpoint, method="GET")

    try:
        with urlopen(request, timeout=resolved_timeout) as response:
            data = _read_json_response(response)
    except TimeoutError:
        return LLMStatus(
            available=False,
            provider=resolved_provider,
            model=resolved_model,
            reachable=False,
            message="本地 Ollama 服务请求超时。",
        )
    except URLError:
        return LLMStatus(
            available=False,
            provider=resolved_provider,
            model=resolved_model,
            reachable=False,
            message="无法连接本地 Ollama 服务。",
        )
    except HTTPError as exc:
        return LLMStatus(
            available=False,
            provider=resolved_provider,
            model=resolved_model,
            reachable=False,
            message=f"Ollama 状态检查失败：HTTP {exc.code}",
        )
    except LLMClientError as exc:
        return LLMStatus(
            available=False,
            provider=resolved_provider,
            model=resolved_model,
            reachable=False,
            message=str(exc),
        )

    models = data.get("models")
    if not isinstance(models, list):
        return LLMStatus(
            available=False,
            provider=resolved_provider,
            model=resolved_model,
            reachable=True,
            message="Ollama 已响应，但返回的模型列表格式不正确。",
        )

    model_names = {
        str(item.get("name", "")).strip()
        for item in models
        if isinstance(item, dict)
    }
    available = resolved_model in model_names
    return LLMStatus(
        available=available,
        provider=resolved_provider,
        model=resolved_model,
        reachable=True,
        message="ok" if available else f"Ollama 已启动，但未找到模型：{resolved_model}",
    )
