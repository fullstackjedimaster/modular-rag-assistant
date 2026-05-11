import os
from pathlib import Path
from dotenv import load_dotenv

# Optional local-dev fallback only.
# In Docker, variables should already be injected by docker compose.
LOCAL_ENV_PATH = Path(__file__).resolve().parent / ".env"
if LOCAL_ENV_PATH.exists():
    load_dotenv(LOCAL_ENV_PATH)


def env(name: str,
        default: str  = None,
        required: bool = False) -> str:
    value = os.getenv(name, default)
    if required and (value is None or value == ""):
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value if value is not None else ""


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


EMBED_SIGNING_SECRET = env("EMBED_SIGNING_SECRET", required=True)
DATABASE_URL = env("DATABASE_URL", required=True)