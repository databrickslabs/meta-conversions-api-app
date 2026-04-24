"""Application configuration with dual-mode auth support."""

import configparser
import logging
import os
from functools import lru_cache
from importlib.metadata import PackageNotFoundError, version as _pkg_version
from pathlib import Path

logger = logging.getLogger(__name__)

# Detect if running inside a Databricks App
IS_DATABRICKS_APP = bool(os.environ.get("DATABRICKS_APP_NAME"))

# Meta Graph API version — single source of truth
META_API_VERSION = "v24.0"

# App identity for telemetry — propagated to Databricks SDK user-agent
APP_NAME = "conversions-api-app"
try:
    APP_VERSION = _pkg_version("conversions-api-app")
except PackageNotFoundError:
    APP_VERSION = "0.1.0"

APP_USER_AGENT = f"{APP_NAME}/{APP_VERSION}"

# Register with the SDK once at import time so every WorkspaceClient picks it up
try:
    from databricks.sdk.core import with_user_agent_extra

    with_user_agent_extra(APP_NAME, APP_VERSION)
except Exception:
    logger.debug("Could not register user-agent extra with databricks-sdk", exc_info=True)


def normalize_databricks_host(host: str) -> str:
    """Return workspace URL with scheme; empty if host is blank."""
    host = (host or "").strip()
    if not host:
        return ""
    if host.startswith("http://") or host.startswith("https://"):
        return host
    return f"https://{host}"


def read_active_profile_host() -> str:
    """Host from ~/.databrickscfg for DATABRICKS_PROFILE (or DEFAULT)."""
    cfg_path = Path.home() / ".databrickscfg"
    if not cfg_path.exists():
        return ""
    active = (os.environ.get("DATABRICKS_PROFILE") or "DEFAULT").upper()
    config = configparser.ConfigParser()
    config.read(cfg_path)
    for section in config.sections():
        if section.upper() == active:
            return config.get(section, "host", fallback="").strip()
    return ""


def read_active_profile_token() -> str | None:
    """PAT from ~/.databrickscfg for the active profile, if present."""
    cfg_path = Path.home() / ".databrickscfg"
    if not cfg_path.exists():
        return None
    active = (os.environ.get("DATABRICKS_PROFILE") or "DEFAULT").upper()
    config = configparser.ConfigParser()
    config.read(cfg_path)
    for section in config.sections():
        if section.upper() == active:
            token = config.get(section, "token", fallback="").strip()
            return token or None
    return None


def get_workspace_host() -> str:
    """Get workspace host URL with https:// prefix."""
    if IS_DATABRICKS_APP:
        host = os.environ.get("DATABRICKS_HOST", "")
        return normalize_databricks_host(host)
    # Local development
    try:
        from databricks.sdk import WorkspaceClient

        profile = os.environ.get("DATABRICKS_PROFILE")
        w = WorkspaceClient(profile=profile) if profile else WorkspaceClient()
        return normalize_databricks_host(w.config.host or "")
    except Exception:
        logger.debug("WorkspaceClient init failed, falling back to env/config", exc_info=True)
        env_host = os.environ.get("DATABRICKS_HOST", "").strip()
        if env_host:
            return normalize_databricks_host(env_host)
        return normalize_databricks_host(read_active_profile_host())


def get_oauth_token() -> str | None:
    """Get OAuth token - works both locally and in Databricks Apps."""
    try:
        from databricks.sdk import WorkspaceClient

        if IS_DATABRICKS_APP:
            w = WorkspaceClient()
        else:
            profile = os.environ.get("DATABRICKS_PROFILE")
            w = WorkspaceClient(profile=profile) if profile else WorkspaceClient()

        if w.config.token:
            return w.config.token
        auth_headers = w.config.authenticate()
        if auth_headers and "Authorization" in auth_headers:
            return auth_headers["Authorization"].replace("Bearer ", "")
    except Exception:
        logger.debug("Could not obtain OAuth token", exc_info=True)
    return None


class Settings:
    """Application settings."""

    APP_NAME: str = APP_NAME
    VERSION: str = APP_VERSION
    DEBUG: bool = not IS_DATABRICKS_APP
    PORT: int = int(os.environ.get("PORT", 8000))
    DATABRICKS_HOST: str = get_workspace_host()


@lru_cache
def get_settings() -> Settings:
    return Settings()
