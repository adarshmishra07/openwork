"""
Configuration for Space Runtime.
Loads environment variables and provides config access.

API keys are now provided per-request via HTTP headers (BYOK model).
Environment variables are kept as fallbacks for local development only.
"""
import os
import contextvars
from dotenv import load_dotenv

# Load .env file if present
load_dotenv()

# API Keys - fallbacks for local development only
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# AWS
AWS_S3_BUCKET = os.getenv("AWS_S3_BUCKET", "future-me-ai")
AWS_REGION = os.getenv("AWS_REGION", "ap-south-1")

# Runtime
STAGE = os.getenv("STAGE", "dev")
DEBUG = os.getenv("DEBUG", "false").lower() == "true"

# Request-scoped API key overrides (async-safe with FastAPI)
_request_gemini_key: contextvars.ContextVar[str | None] = contextvars.ContextVar('gemini_api_key', default=None)
_request_openai_key: contextvars.ContextVar[str | None] = contextvars.ContextVar('openai_api_key', default=None)


def get_gemini_api_key() -> str:
    """Get Gemini API key: request-scoped override first, then env fallback."""
    return _request_gemini_key.get() or GEMINI_API_KEY


def get_openai_api_key() -> str:
    """Get OpenAI API key: request-scoped override first, then env fallback."""
    return _request_openai_key.get() or OPENAI_API_KEY


def set_request_keys(gemini_key: str | None = None, openai_key: str | None = None):
    """Set API keys for the current request scope."""
    if gemini_key:
        _request_gemini_key.set(gemini_key)
    if openai_key:
        _request_openai_key.set(openai_key)
