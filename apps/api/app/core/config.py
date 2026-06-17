from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    app_name: str = "Local Knowledge Base API"
    app_version: str = "0.1.0"
    model_config_name: str = "placeholder-local-model-config"
    ocr_enabled: bool = True


def get_settings() -> Settings:
    return Settings()
