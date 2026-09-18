"""
Gawdee FastAPI Backend — centralized environment configuration.

RULE: this module is the ONLY place allowed to read environment variables.
Routes, services and models must `from .core.config import settings`
(or `from ..core.config import settings`) and never call os.getenv()/os.environ
directly.

EVERY field below is REQUIRED (no defaults): instantiating `Settings` raises
a pydantic ValidationError at import time, aborting application startup
immediately when any variable is missing. Copy `.env.example` to `.env`
and fill in per-environment values.
"""

from functools import lru_cache
from pathlib import Path
from typing import Union

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent  # backend/


def _resolve_relative(value: Path) -> Path:
    """Resolve relative paths against the backend directory."""
    return value if value.is_absolute() else (BACKEND_DIR / value).resolve()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Runtime ───────────────────────────────────────────────────────────
    ENVIRONMENT: str = Field(...)

    # ── Storage & secrets ─────────────────────────────────────────────────
    GAWDEE_STORAGE: Path = Field(...)
    GAWDEE_PUBLIC_DIR: Path = Field(...)
    GAWDEE_APP_KEY: str = Field(...)  # base64-encoded 32-byte key (AES-GCM + HMAC signing)

    # ── CORS ──────────────────────────────────────────────────────────────
    CORS_ORIGINS: Union[list[str], str] = Field(...)
    CORS_ORIGIN_REGEX: str = Field(...)

    # ── Session cookie ────────────────────────────────────────────────────
    SESSION_COOKIE_NAME: str = Field(...)
    SESSION_COOKIE_MAX_AGE_SECONDS: int = Field(...)
    SESSION_COOKIE_SECURE: bool = Field(...)
    SESSION_COOKIE_SAMESITE: str = Field(...)
    SESSION_COOKIE_HTTPONLY: bool = Field(...)
    SESSION_COOKIE_PATH: str = Field(...)

    # ── Admin auth ────────────────────────────────────────────────────────
    ADMIN_COOKIE_NAME: str = Field(...)
    ADMIN_TOKEN_TTL_SECONDS: int = Field(...)
    ADMIN_COOKIE_SAMESITE: str = Field(...)
    ADMIN_COOKIE_SECURE: bool = Field(...)

    # ── Commerce ──────────────────────────────────────────────────────────
    CURRENCY: str = Field(...)
    CHECKOUT_MAX_ITEMS: int = Field(...)
    CHECKOUT_MAX_QTY: int = Field(...)
    STALE_ORDER_MINUTES: int = Field(...)
    NOTIFICATION_BATCH_CHECKOUT: int = Field(...)
    NOTIFICATION_BATCH_WEBHOOK: int = Field(...)

    # ── Rate limits ───────────────────────────────────────────────────────
    AI_CHAT_LIMIT: int = Field(...)
    AI_CHAT_WINDOW_SECONDS: int = Field(...)
    LOGIN_MAX_ATTEMPTS: int = Field(...)
    LOGIN_WINDOW_SECONDS: int = Field(...)

    # ── OTP ───────────────────────────────────────────────────────────────
    OTP_REQUEST_LIMIT: int = Field(...)
    OTP_REQUEST_WINDOW_MINUTES: int = Field(...)
    OTP_EXPIRY_MINUTES: int = Field(...)
    OTP_MAX_ATTEMPTS: int = Field(...)
    OTP_CODE_DIGITS: int = Field(...)

    # ── Read-model list limits ────────────────────────────────────────────
    ADMIN_TOP_PRODUCTS_LIMIT: int = Field(...)
    ADMIN_RECENT_ORDERS_LIMIT: int = Field(...)
    BLOG_LIST_LIMIT: int = Field(...)

    # ── Third-party endpoints ─────────────────────────────────────────────
    RAZORPAY_API_BASE_URL: str = Field(...)
    DELHIVERY_PROD_TRACK_URL: str = Field(...)
    DELHIVERY_STAGING_TRACK_URL: str = Field(...)
    DELHIVERY_PACKAGE_TRACK_URL: str = Field(...)
    WHATSAPP_GRAPH_BASE_URL: str = Field(...)
    OPENAI_RESPONSES_URL: str = Field(...)
    GROQ_CHAT_URL: str = Field(...)

    # ── HTTP / DB tuning ──────────────────────────────────────────────────
    HTTP_TIMEOUT_SECONDS: int = Field(...)
    AI_HTTP_TIMEOUT_SECONDS: int = Field(...)
    DELHIVERY_HTTP_TIMEOUT_SECONDS: int = Field(...)
    DB_BUSY_TIMEOUT_MS: int = Field(...)

    # ── App metadata ──────────────────────────────────────────────────────
    APP_TITLE: str = Field(...)
    APP_VERSION: str = Field(...)
    APP_DESCRIPTION: str = Field(...)
    HEALTH_SERVICE_NAME: str = Field(...)

    # ── Validators ────────────────────────────────────────────────────────
    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_cors_origins(cls, v):
        if isinstance(v, str):
            s = v.strip()
            if s.startswith("["):
                import json
                return json.loads(s)
            return [x.strip() for x in s.split(",") if x.strip()]
        return v

    @field_validator("GAWDEE_STORAGE", "GAWDEE_PUBLIC_DIR", mode="before")
    @classmethod
    def _resolve_paths(cls, v):
        return _resolve_relative(Path(v)) if isinstance(v, (str, Path)) else v

    @field_validator("GAWDEE_APP_KEY")
    @classmethod
    def _validate_app_key(cls, v: str) -> str:
        import base64
        try:
            decoded = base64.b64decode(v.strip())
        except Exception:
            raise ValueError("GAWDEE_APP_KEY must be base64-encoded")
        if len(decoded) < 32:
            raise ValueError("GAWDEE_APP_KEY must decode to at least 32 bytes")
        return v.strip()

    @property
    def storage_dir(self) -> Path:
        return Path(self.GAWDEE_STORAGE)

    @property
    def db_path(self) -> Path:
        return self.storage_dir / "gawdee.sqlite"

    @property
    def public_upload_base(self) -> Path:
        return Path(self.GAWDEE_PUBLIC_DIR) / "assets" / "uploads"

    @property
    def cors_origins(self) -> list[str]:
        origins = self.CORS_ORIGINS
        return origins if isinstance(origins, list) else [origins]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Instantiate (and cache) settings. Raises on import if .env is incomplete,
    aborting application startup immediately."""
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
