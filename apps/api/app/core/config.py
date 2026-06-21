import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    app_name: str
    app_version: str
    model_config_name: str
    ocr_enabled: bool
    llm_enabled: bool
    llm_provider: str
    llm_model_name: str
    llm_base_url: str
    llm_timeout_seconds: int
    llm_temperature: float
    llm_max_tokens: int
    llm_fallback_to_extractive: bool


def get_settings() -> Settings:
    model_name = os.getenv("LOCAL_KB_LLM_MODEL_NAME", "qwen2.5:7b-instruct").strip() or "qwen2.5:7b-instruct"
    provider = os.getenv("LOCAL_KB_LLM_PROVIDER", "ollama").strip() or "ollama"
    base_url = os.getenv("LOCAL_KB_LLM_BASE_URL", "http://127.0.0.1:11434").strip() or "http://127.0.0.1:11434"
    config_name = os.getenv("LOCAL_KB_MODEL_CONFIG_NAME", f"{provider}-{model_name.replace(':', '-')}-default").strip()

    return Settings(
        app_name=os.getenv("LOCAL_KB_APP_NAME", "Local Knowledge Base API").strip() or "Local Knowledge Base API",
        app_version=os.getenv("LOCAL_KB_APP_VERSION", "0.1.0").strip() or "0.1.0",
        model_config_name=config_name or f"{provider}-{model_name.replace(':', '-')}-default",
        ocr_enabled=os.getenv("LOCAL_KB_OCR_ENABLED", "true").strip().lower() != "false",
        llm_enabled=os.getenv("LOCAL_KB_LLM_ENABLED", "true").strip().lower() != "false",
        llm_provider=provider,
        llm_model_name=model_name,
        llm_base_url=base_url,
        llm_timeout_seconds=int(os.getenv("LOCAL_KB_LLM_TIMEOUT_SECONDS", "120").strip() or "120"),
        llm_temperature=float(os.getenv("LOCAL_KB_LLM_TEMPERATURE", "0.2").strip() or "0.2"),
        llm_max_tokens=int(os.getenv("LOCAL_KB_LLM_MAX_TOKENS", "1024").strip() or "1024"),
        llm_fallback_to_extractive=os.getenv("LOCAL_KB_LLM_FALLBACK_TO_EXTRACTIVE", "true").strip().lower() != "false",
    )
