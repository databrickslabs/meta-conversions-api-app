"""API routes for the Conversions API App."""

import logging
import os
from pathlib import Path

from fastapi import APIRouter, Request
from pydantic import BaseModel

from server.config import (
    get_oauth_token,
    get_settings,
    IS_DATABRICKS_APP,
    META_API_VERSION,
    normalize_databricks_host,
    read_active_profile_host,
    read_active_profile_token,
)

logger = logging.getLogger(__name__)

router = APIRouter()

ASSETS_DIR = Path(__file__).parent / "assets"

SHARED_FALLBACK_DIR = "/Workspace/Shared/meta-capi"


def _ensure_workspace_dir(w, preferred_path: str) -> str:
    """Create workspace directory, falling back to /Workspace/Shared if needed.

    In Databricks Apps the SP may create objects in user paths via API but
    the Jobs service cannot resolve them, so always use the shared fallback.
    """
    if IS_DATABRICKS_APP:
        try:
            w.workspace.mkdirs(SHARED_FALLBACK_DIR)
        except Exception:
            logger.exception("Failed to create shared workspace directory %s", SHARED_FALLBACK_DIR)
        return SHARED_FALLBACK_DIR

    workspace_dir = preferred_path.rstrip("/")
    try:
        w.workspace.mkdirs(workspace_dir)
        return workspace_dir
    except Exception:
        logger.warning("Could not create workspace dir %s, falling back to %s", workspace_dir, SHARED_FALLBACK_DIR)
        w.workspace.mkdirs(SHARED_FALLBACK_DIR)
        return SHARED_FALLBACK_DIR


class HealthResponse(BaseModel):
    status: str
    app: str
    version: str
    is_databricks_app: bool


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    settings = get_settings()
    return HealthResponse(
        status="healthy",
        app=settings.APP_NAME,
        version=settings.VERSION,
        is_databricks_app=IS_DATABRICKS_APP,
    )


def _display_name_from_scim_dict(data: dict | None) -> str | None:
    """Pick a human-readable label from SCIM / current-user JSON."""
    if not data:
        return None
    name = data.get("displayName") or data.get("userName")
    if name:
        return str(name)
    for e in data.get("emails") or []:
        if isinstance(e, dict):
            v = e.get("value")
            if v:
                return str(v)
    n = data.get("name") or {}
    if isinstance(n, dict):
        parts = [n.get("givenName"), n.get("familyName")]
        s = " ".join(p for p in parts if p)
        if s:
            return s
    return None


def _display_name_from_sdk_user(me) -> str | None:
    """Extract display string from databricks.sdk.service.iam.User."""
    if me is None:
        return None
    if me.display_name:
        return me.display_name
    if me.user_name:
        return me.user_name
    if me.emails:
        for e in me.emails:
            v = getattr(e, "value", None)
            if v:
                return v
    if me.name:
        parts = [me.name.given_name, me.name.family_name]
        s = " ".join(p for p in parts if p)
        if s:
            return s
    return None


def _workspace_user_id_from_sdk_user(me) -> str | None:
    """Workspace /Workspace/Users/<id> segment (usually email), not display name."""
    if me is None:
        return None
    if me.user_name:
        return me.user_name
    if me.emails:
        for e in me.emails:
            v = getattr(e, "value", None)
            if v:
                return v
    return None


def _workspace_user_id_from_scim_dict(data: dict | None) -> str | None:
    if not data:
        return None
    un = data.get("userName")
    if un:
        return str(un)
    for e in data.get("emails") or []:
        if isinstance(e, dict):
            v = e.get("value")
            if v:
                return str(v)
    return None


def _bearer_from_workspace_client(w) -> str | None:
    """OAuth configs often omit config.token until authenticate() runs."""
    tok = getattr(w.config, "token", None)
    if tok:
        return tok
    try:
        headers = w.config.authenticate()
        if not headers:
            return None
        auth = headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            return auth[7:]
    except Exception:
        logger.debug("Could not extract bearer token from workspace client", exc_info=True)
    return None


def _classify_databricks_auth_issue(
    exc: BaseException | None = None,
    cli_stderr: str | None = None,
) -> dict | None:
    """Map SDK/CLI failures to a structured warning when OAuth refresh is the cause."""
    parts: list[str] = []
    if exc is not None:
        parts.append(str(exc))
    if cli_stderr:
        parts.append(cli_stderr)
    blob = "\n".join(parts).lower()
    if not blob.strip():
        return None
    refresh_markers = (
        "refresh token",
        "cannot get access token",
        "reauthenticate",
        "invalid_grant",
        "a new access token could not be retrieved",
        "token could not be retrieved",
    )
    if any(m in blob for m in refresh_markers):
        return {
            "severity": "warning",
            "code": "token_refresh",
            "detail": (
                "Databricks CLI OAuth could not refresh your access token. "
                "Run: databricks auth login --host <your-workspace-url> "
                "or add a personal access token (token = …) to this profile in ~/.databrickscfg."
            ),
        }
    return None


def _current_user_via_cli(profile: str | None) -> tuple[str | None, str | None, str | None]:
    """Returns (display_name, workspace_user_id, stderr_on_failure) from the CLI."""
    import json
    import shutil
    import subprocess

    if not shutil.which("databricks"):
        return None, None, None
    cmd = ["databricks", "current-user", "me", "-o", "json"]
    if profile:
        cmd.extend(["-p", profile])
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=25,
        )
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "").strip() or None
            return None, None, err
        data = json.loads(proc.stdout)
        return (
            _display_name_from_scim_dict(data),
            _workspace_user_id_from_scim_dict(data),
            None,
        )
    except Exception as e:
        return None, None, str(e)


async def _fetch_scim_me(workspace_url: str, token: str) -> dict | None:
    """Return SCIM Me JSON or None."""
    import httpx

    base = workspace_url.rstrip("/")
    url = f"{base}/api/2.0/preview/scim/v2/Me"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                url, headers={"Authorization": f"Bearer {token}"}
            )
        if resp.status_code != 200:
            return None
        return resp.json()
    except Exception:
        logger.debug("SCIM /Me request failed", exc_info=True)
        return None


async def _scim_me_display_name(workspace_url: str, token: str) -> str | None:
    """Resolve display name via SCIM when SDK current_user.me() is unavailable."""
    data = await _fetch_scim_me(workspace_url, token)
    return _display_name_from_scim_dict(data)


@router.get("/me")
async def get_current_user(request: Request):
    """Return the current user's display name and workspace info."""
    user_name: str | None = None
    workspace_user_id: str | None = None
    workspace = ""

    if IS_DATABRICKS_APP:
        fwd_email = (request.headers.get("x-forwarded-email") or "").strip()
        if fwd_email and "@" in fwd_email:
            workspace_user_id = fwd_email
        user_name = (
            request.headers.get("x-forwarded-preferred-username")
            or request.headers.get("x-forwarded-email", "").split("@")[0]
            or None
        )
        host = os.environ.get("DATABRICKS_HOST", "")
        workspace = normalize_databricks_host(host)
        token = get_oauth_token()
        if token and workspace and (not user_name or workspace_user_id is None):
            scim = await _fetch_scim_me(workspace, token)
            if scim:
                if not user_name:
                    user_name = _display_name_from_scim_dict(scim)
                if workspace_user_id is None:
                    workspace_user_id = _workspace_user_id_from_scim_dict(scim)
    else:
        profile = os.environ.get("DATABRICKS_PROFILE")
        client_exc: BaseException | None = None
        me_exc: BaseException | None = None
        cli_stderr: str | None = None
        try:
            from databricks.sdk import WorkspaceClient

            w = WorkspaceClient(profile=profile) if profile else WorkspaceClient()
            workspace = normalize_databricks_host(w.config.host or "")
            try:
                me = w.current_user.me()
                user_name = _display_name_from_sdk_user(me)
                workspace_user_id = _workspace_user_id_from_sdk_user(me)
            except Exception as e:
                me_exc = e
                token = (
                    _bearer_from_workspace_client(w)
                    or read_active_profile_token()
                    or get_oauth_token()
                )
                if token and workspace:
                    scim = await _fetch_scim_me(workspace, token)
                    if scim:
                        user_name = _display_name_from_scim_dict(scim)
                        workspace_user_id = _workspace_user_id_from_scim_dict(scim)
        except Exception as e:
            client_exc = e
            env_host = os.environ.get("DATABRICKS_HOST", "").strip()
            cfg_host = read_active_profile_host()
            workspace = normalize_databricks_host(env_host or cfg_host)
            pat = read_active_profile_token()
            host_for_pat = normalize_databricks_host(cfg_host or env_host)
            if pat and host_for_pat:
                try:
                    from databricks.sdk import WorkspaceClient

                    w2 = WorkspaceClient(host=host_for_pat, token=pat)
                    me = w2.current_user.me()
                    user_name = _display_name_from_sdk_user(me)
                    workspace_user_id = _workspace_user_id_from_sdk_user(me)
                    if not workspace:
                        workspace = host_for_pat
                except Exception:
                    logger.debug("PAT-based current_user.me() failed", exc_info=True)
                if user_name is None and workspace:
                    scim = await _fetch_scim_me(workspace, pat)
                    if scim:
                        user_name = _display_name_from_scim_dict(scim)
                        workspace_user_id = (
                            workspace_user_id
                            or _workspace_user_id_from_scim_dict(scim)
                        )
            if user_name is None:
                cli_name, cli_uid, cli_stderr = _current_user_via_cli(profile)
                user_name = cli_name
                workspace_user_id = workspace_user_id or cli_uid

    default_workspace_path: str | None = None
    if workspace_user_id:
        default_workspace_path = f"/Workspace/Users/{workspace_user_id}".rstrip("/")

    auth_issue: dict | None = None
    if user_name is None and not IS_DATABRICKS_APP:
        auth_issue = (
            _classify_databricks_auth_issue(client_exc)
            or _classify_databricks_auth_issue(me_exc)
            or _classify_databricks_auth_issue(None, cli_stderr)
        )
        if auth_issue is None and (client_exc or me_exc or cli_stderr):
            auth_issue = {
                "severity": "error",
                "code": "auth_failed",
                "detail": (
                    "Could not load your Databricks user. "
                    "Check ~/.databrickscfg, network access, and workspace permissions."
                ),
            }

    return {
        "user_name": user_name,
        "workspace": workspace,
        "default_workspace_path": default_workspace_path,
        "auth_issue": auth_issue,
    }


@router.get("/config")
async def get_app_config():
    """Return non-sensitive app configuration for the frontend."""
    settings = get_settings()
    return {
        "app_name": settings.APP_NAME,
        "version": settings.VERSION,
    }


# --- Databricks Profiles ---


@router.get("/profiles")
async def list_profiles():
    """List available Databricks CLI profiles from ~/.databrickscfg."""
    import configparser

    cfg_path = Path.home() / ".databrickscfg"
    profiles = []
    active_profile = os.environ.get("DATABRICKS_PROFILE", "DEFAULT")

    if cfg_path.exists():
        config = configparser.ConfigParser()
        config.read(cfg_path)

        # configparser treats [DEFAULT] specially — include it if it has a host
        default_host = config.defaults().get("host", "")
        if default_host:
            profiles.append({
                "name": "DEFAULT",
                "host": default_host,
                "active": active_profile.upper() == "DEFAULT",
            })

        for section in config.sections():
            host = config.get(section, "host", fallback="")
            profiles.append({
                "name": section,
                "host": host,
                "active": section.upper() == active_profile.upper(),
            })

    return {"profiles": profiles, "active_profile": active_profile}


@router.post("/profiles/switch")
async def switch_profile(body: dict):
    """Switch the active Databricks profile."""
    from server.config import get_settings

    profile_name = body.get("profile", "DEFAULT")
    os.environ["DATABRICKS_PROFILE"] = profile_name

    # Clear cached settings so they re-read with new profile
    get_settings.cache_clear()

    # Re-resolve workspace host and user
    host = ""
    user_name = profile_name
    try:
        from databricks.sdk import WorkspaceClient

        w = WorkspaceClient(profile=profile_name)
        host = normalize_databricks_host(w.config.host or "")
        try:
            user = w.current_user.me()
            user_name = user.display_name or user.user_name or profile_name
        except Exception:
            logger.debug("current_user.me() failed during profile switch, trying SCIM", exc_info=True)
            token = getattr(w.config, "token", None) or get_oauth_token()
            if token and host:
                resolved = await _scim_me_display_name(host, token)
                if resolved:
                    user_name = resolved
    except Exception as e:
        logger.warning("Profile switch to %r failed: %s", profile_name, e)
        return {"success": False, "message": f"Failed to switch: {str(e)}"}

    return {
        "success": True,
        "message": f"Switched to profile '{profile_name}'",
        "host": host,
        "user_name": user_name,
    }


# --- Marketplace Installation ---

META_CAPI_LISTING_ID = "8a8f4ead-db28-45e9-b39b-aabbbe1dbe08"


async def _get_marketplace_token(host: str) -> str | None:
    """Get a token with 'marketplace' scope via SP client-credentials flow."""
    import httpx

    client_id = os.environ.get("DATABRICKS_CLIENT_ID", "")
    client_secret = os.environ.get("DATABRICKS_CLIENT_SECRET", "")
    if not client_id or not client_secret:
        return None

    token_url = f"{host.rstrip('/')}/oidc/v1/token"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                token_url,
                data={
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "scope": "all-apis",
                },
            )
        if resp.status_code == 200:
            return resp.json().get("access_token")
    except Exception:
        logger.debug("Failed to obtain marketplace-scoped token", exc_info=True)
    return None


async def _check_marketplace_installation(host: str, token: str) -> dict:
    """Call the marketplace consumer API directly (bypasses SDK scope check)."""
    import httpx

    base = host.rstrip("/")
    url = f"{base}/api/2.1/marketplace-consumer/installations"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            url, headers={"Authorization": f"Bearer {token}"}
        )
    if resp.status_code != 200:
        return {"installed": False, "message": f"Marketplace API error: {resp.text}"}

    for inst in resp.json().get("installations", []):
        if inst.get("listing_id") == META_CAPI_LISTING_ID:
            return {
                "installed": True,
                "listing_name": inst.get("listing_name", "Meta Conversions API"),
                "listing_id": inst["listing_id"],
                "catalog_name": inst.get("catalog_name", ""),
            }

    return {"installed": False, "message": "Meta CAPI listing not found on this workspace."}


@router.get("/marketplace-listing")
async def get_marketplace_listing(request: Request):
    """Find the Meta CAPI marketplace installation on the current workspace."""
    try:
        if IS_DATABRICKS_APP:
            # The default SP token and forwarded user token lack the
            # 'marketplace' scope.  Request it explicitly via the SP's
            # client-credentials flow, then hit the REST API directly.
            host = normalize_databricks_host(
                os.environ.get("DATABRICKS_HOST", "")
            )
            if not host:
                return {"installed": False, "message": "DATABRICKS_HOST not set."}
            token = await _get_marketplace_token(host)
            if not token:
                return {
                    "installed": False,
                    "message": "Could not obtain marketplace-scoped token.",
                }
            return await _check_marketplace_installation(host, token)
        else:
            from databricks.sdk import WorkspaceClient

            profile = os.environ.get("DATABRICKS_PROFILE")
            w = WorkspaceClient(profile=profile) if profile else WorkspaceClient()

            for inst in w.consumer_installations.list():
                listing_id = getattr(inst, "listing_id", None) or ""
                if listing_id == META_CAPI_LISTING_ID:
                    return {
                        "installed": True,
                        "listing_name": getattr(inst, "listing_name", "Meta Conversions API"),
                        "listing_id": listing_id,
                        "catalog_name": getattr(inst, "catalog_name", ""),
                    }

            return {"installed": False, "message": "Meta CAPI listing not found on this workspace."}
    except Exception as e:
        return {"installed": False, "message": str(e)}


# --- Test Connection ---


class TestConnectionRequest(BaseModel):
    access_token: str
    pixel_id: str
    test_event_code: str | None = None


@router.post("/test-connection")
async def test_connection(req: TestConnectionRequest):
    """Validate Meta CAPI credentials by sending a test-only event.

    Uses test_event_code so the event appears only in the Test Events
    tab in Meta Events Manager and never affects production data.
    """
    import time
    import hashlib
    import httpx

    url = f"https://graph.facebook.com/{META_API_VERSION}/{req.pixel_id}/events"
    payload = {
        "data": [
            {
                "event_name": "PageView",
                "event_time": int(time.time()),
                "action_source": "website",
                "user_data": {
                    "em": [hashlib.sha256(b"test@example.com").hexdigest()],
                },
            }
        ],
        "test_event_code": req.test_event_code or "DBXCONNTEST",
        "access_token": req.access_token,
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json=payload)
            data = resp.json()

        if resp.status_code == 200 and data.get("events_received") is not None:
            return {
                "success": True,
                "message": "Connection successful — credentials verified.",
            }
        else:
            error_msg = data.get("error", {}).get("message", resp.text)
            return {
                "success": False,
                "message": f"Meta API error: {error_msg}",
            }
    except Exception as e:
        return {
            "success": False,
            "message": f"Connection failed: {str(e)}",
        }


# --- Store Secret ---


class StoreSecretRequest(BaseModel):
    access_token: str
    secret_scope: str
    secret_key: str = "access_token"


@router.post("/store-secret")
async def store_secret(req: StoreSecretRequest):
    """Create a secret scope (if needed) and store the access token."""
    try:
        from databricks.sdk import WorkspaceClient

        profile = os.environ.get("DATABRICKS_PROFILE")
        w = WorkspaceClient(profile=profile) if profile else WorkspaceClient()

        # Create or verify secret scope
        scope_exists = False
        for scope in w.secrets.list_scopes():
            if scope.name == req.secret_scope:
                scope_exists = True
                break

        if not scope_exists:
            try:
                w.secrets.create_scope(scope=req.secret_scope)
            except Exception as scope_err:
                err_msg = str(scope_err).lower()
                if "exceeds" in err_msg or "limit" in err_msg or "maximum" in err_msg or "quota" in err_msg:
                    return {
                        "success": False,
                        "error_type": "max_scopes",
                        "message": "Your workspace has reached the maximum number of secret scopes.",
                    }
                raise

        # Store access token as secret
        w.secrets.put_secret(
            scope=req.secret_scope,
            key=req.secret_key,
            string_value=req.access_token,
        )

        return {
            "success": True,
            "message": "Secret stored successfully.",
            "secret_scope": req.secret_scope,
            "secret_key": req.secret_key,
        }
    except Exception as e:
        if isinstance(e, dict) or (hasattr(e, 'args') and 'max_scopes' in str(e)):
            raise
        return {
            "success": False,
            "message": f"Failed to store secret: {str(e)}",
        }


# --- Quick Launch ---


class QuickLaunchRequest(BaseModel):
    access_token: str = ""
    pixel_id: str
    test_event_code: str | None = None
    secret_scope: str
    workspace_path: str


@router.post("/quick-launch")
async def quick_launch(req: QuickLaunchRequest):
    """Deploy notebook and set up secrets in the workspace."""
    try:
        from databricks.sdk import WorkspaceClient

        profile = os.environ.get("DATABRICKS_PROFILE")
        w = WorkspaceClient(profile=profile) if profile else WorkspaceClient()

        # Upload notebook to workspace (with catalog + secret scope injected)
        notebook_path = ASSETS_DIR / "meta_capi_udtf_example.ipynb.json"
        notebook_text = notebook_path.read_text()

        # Resolve the marketplace catalog name for the notebook
        catalog_name = ""
        try:
            for inst in w.consumer_installations.list():
                lid = getattr(inst, "listing_id", None) or ""
                if lid == META_CAPI_LISTING_ID:
                    catalog_name = getattr(inst, "catalog_name", "") or ""
                    break
        except Exception:
            logger.debug("Could not resolve marketplace catalog for notebook", exc_info=True)

        notebook_text = notebook_text.replace("__CATALOG_NAME__", catalog_name or "meta_capi_sample_data")
        notebook_text = notebook_text.replace("__SECRET_SCOPE__", req.secret_scope)
        notebook_content = notebook_text.encode()

        import base64
        from databricks.sdk.service.workspace import ImportFormat, Language

        # Ensure workspace directory exists (falls back to /Workspace/Shared)
        workspace_dir = _ensure_workspace_dir(w, req.workspace_path)

        workspace_notebook_path = workspace_dir + "/Meta CAPI - UDTF Example"

        w.workspace.import_(
            path=workspace_notebook_path,
            content=base64.b64encode(notebook_content).decode(),
            format=ImportFormat.JUPYTER,
            overwrite=True,
            language=Language.PYTHON,
        )

        # 4. Check if marketplace listing has a mapping YAML in its volume
        marketplace_mapping_path = None
        try:
            for inst in w.consumer_installations.list():
                listing_id = getattr(inst, "listing_id", None) or ""
                if listing_id == META_CAPI_LISTING_ID:
                    catalog = getattr(inst, "catalog_name", "")
                    if catalog:
                        vol_path = f"/Volumes/{catalog}/meta_capi/mappings/mapping_conversion.yaml"
                        try:
                            info = w.files.get_status(vol_path)
                            if info:
                                marketplace_mapping_path = vol_path
                        except Exception:
                            logger.debug("Marketplace mapping not found at %s", vol_path)
                    break
        except Exception:
            logger.debug("Could not check marketplace mapping volume", exc_info=True)

        if marketplace_mapping_path:
            mapping_source = f"Marketplace volume: {marketplace_mapping_path}"
        else:
            # Upload bundled mapping YAML as fallback
            mapping_path = ASSETS_DIR / "mapping_conversion.yaml"
            mapping_content = mapping_path.read_bytes()

            workspace_mapping_path = workspace_dir + "/mapping_conversion.yaml"
            w.workspace.import_(
                path=workspace_mapping_path,
                content=base64.b64encode(mapping_content).decode(),
                format=ImportFormat.AUTO,
                overwrite=True,
            )
            mapping_source = f"Uploaded to workspace: {workspace_mapping_path}"

        notebook_url = f"{w.config.host}#workspace{workspace_notebook_path}"

        return {
            "success": True,
            "message": "Notebook and mapping deployed successfully!",
            "notebook_url": notebook_url,
            "mapping_source": mapping_source,
            "marketplace_mapping_path": marketplace_mapping_path,
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Deployment failed: {str(e)}",
        }


# --- Table Search ---


@router.get("/search-tables")
async def search_tables(q: str = ""):
    """Search Unity Catalog for catalogs, schemas, or tables.

    Cascading search:
    - No dots: list catalogs matching the query
    - One dot (catalog.): list schemas in that catalog
    - Two dots (catalog.schema.): list tables in that schema
    """
    from databricks.sdk import WorkspaceClient

    profile = os.environ.get("DATABRICKS_PROFILE")
    w = WorkspaceClient(profile=profile) if profile else WorkspaceClient()

    results: list[dict] = []
    parts = q.split(".")

    try:
        if len(parts) == 1:
            # List catalogs matching the query
            query = parts[0].lower()
            for cat in w.catalogs.list():
                name = cat.name or ""
                if query and query not in name.lower():
                    continue
                results.append({
                    "full_name": f"{name}.",
                    "catalog_name": name,
                    "schema_name": None,
                    "name": name,
                    "table_type": "CATALOG",
                })
                if len(results) >= 20:
                    break

        elif len(parts) == 2:
            # List schemas in the catalog
            catalog = parts[0]
            schema_filter = parts[1].lower()
            for schema in w.schemas.list(catalog_name=catalog):
                name = schema.name or ""
                if schema_filter and schema_filter not in name.lower():
                    continue
                results.append({
                    "full_name": f"{catalog}.{name}.",
                    "catalog_name": catalog,
                    "schema_name": name,
                    "name": name,
                    "table_type": "SCHEMA",
                })
                if len(results) >= 20:
                    break

        else:
            # List tables in catalog.schema
            catalog = parts[0]
            schema = parts[1]
            name_filter = ".".join(parts[2:]).lower()
            count = 0
            for tbl in w.tables.list(
                catalog_name=catalog,
                schema_name=schema,
            ):
                tbl_name = tbl.name or ""
                if name_filter and name_filter not in tbl_name.lower():
                    continue
                full = tbl.full_name or f"{catalog}.{schema}.{tbl_name}"
                results.append({
                    "full_name": full,
                    "catalog_name": catalog,
                    "schema_name": schema,
                    "name": tbl_name,
                    "table_type": str(tbl.table_type) if tbl.table_type else None,
                })
                count += 1
                if count >= 20:
                    break
    except Exception:
        logger.debug("Table search failed for query %r", q, exc_info=True)

    return {"tables": results}


# --- Default Mapping ---


@router.get("/default-mapping")
async def get_default_mapping():
    """Return the default column mapping from the YAML file."""
    import yaml

    mapping_path = ASSETS_DIR / "mapping_conversion.yaml"
    with open(mapping_path) as f:
        mapping = yaml.safe_load(f)
    return {"mapping": mapping}


# --- Save Mapping ---


class MappingFieldInput(BaseModel):
    capi_param: str
    source_column: str
    transforms: list[str]
    group: str  # 'server', 'user_data', 'custom_data'


DEFAULT_CONVERSION_SOURCE_TABLE = "{marketplace_catalog}.meta_capi.conversion_data"


class CreateJobRequest(BaseModel):
    config: dict
    fields: list[MappingFieldInput]
    source_table: str | None = None
    job_name: str = "Meta CAPI - Send Conversion Events"
    schedule_type: str = "on_demand"
    schedule: str = ""
    workspace_path: str = "/Workspace/Users/"
    secret_scope: str = "meta-capi"


def _build_mapping_yaml(fields: list[MappingFieldInput]) -> str:
    """Build the YAML mapping structure from field inputs."""
    import yaml

    mapping: dict = {}

    NORMALIZE_MAP = {
        "em": "normalize_email",
        "ph": "normalize_phone",
    }

    for field in fields:
        entry: dict = {"source": field.source_column}
        if field.transforms:
            resolved = []
            for t in field.transforms:
                if t == "normalize":
                    specific = NORMALIZE_MAP.get(field.capi_param)
                    if specific:
                        resolved.append(specific)
                else:
                    resolved.append(t)
            if resolved:
                entry["transform"] = resolved

        if field.group == "server":
            mapping[field.capi_param] = entry
        elif field.group == "user_data":
            if "user_data" not in mapping:
                mapping["user_data"] = {}
            mapping["user_data"][field.capi_param] = entry
        elif field.group == "custom_data":
            if "custom_data" not in mapping:
                mapping["custom_data"] = {}
            mapping["custom_data"][field.capi_param] = entry

    return yaml.dump(mapping, default_flow_style=False)


@router.post("/create-job")
async def create_job(req: CreateJobRequest):
    """Create a Databricks job with the notebook and mapping config."""
    import base64

    try:
        from databricks.sdk import WorkspaceClient
        from databricks.sdk.service.workspace import ImportFormat, Language

        profile = os.environ.get("DATABRICKS_PROFILE")
        w = WorkspaceClient(profile=profile) if profile else WorkspaceClient()

        table = (req.source_table or "").strip() or DEFAULT_CONVERSION_SOURCE_TABLE
        mapping_yaml = _build_mapping_yaml(req.fields)

        # Save mapping YAML locally
        output_path = ASSETS_DIR / "mapping_custom.yaml"
        with open(output_path, "w") as f:
            f.write(mapping_yaml)

        # 1. Upload notebook to workspace
        notebook_path = ASSETS_DIR / "meta_capi_udtf_example.ipynb.json"
        notebook_text = notebook_path.read_text()

        # Resolve marketplace catalog
        catalog_name = ""
        try:
            for inst in w.consumer_installations.list():
                lid = getattr(inst, "listing_id", None) or ""
                if lid == META_CAPI_LISTING_ID:
                    catalog_name = getattr(inst, "catalog_name", "") or ""
                    break
        except Exception:
            logger.debug("Could not resolve marketplace catalog for job", exc_info=True)

        notebook_text = notebook_text.replace(
            "__CATALOG_NAME__", catalog_name or "meta_capi_sample_data"
        )
        notebook_text = notebook_text.replace("__SECRET_SCOPE__", req.secret_scope)
        notebook_content = notebook_text.encode()

        # Ensure workspace directory exists (falls back to /Workspace/Shared)
        workspace_dir = _ensure_workspace_dir(w, req.workspace_path)

        workspace_notebook_path = workspace_dir + "/Meta CAPI - UDTF Example"

        w.workspace.import_(
            path=workspace_notebook_path,
            content=base64.b64encode(notebook_content).decode(),
            format=ImportFormat.JUPYTER,
            overwrite=True,
            language=Language.PYTHON,
        )

        # 2. Upload mapping YAML to workspace
        mapping_workspace_path = (
            workspace_dir + "/mapping_conversion.yaml"
        )
        w.workspace.import_(
            path=mapping_workspace_path,
            content=base64.b64encode(mapping_yaml.encode()).decode(),
            format=ImportFormat.AUTO,
            overwrite=True,
        )

        # 3. Create the Databricks job
        from databricks.sdk.service.jobs import (
            Task,
            NotebookTask,
            CronSchedule,
            PauseStatus,
        )

        pixel_id = req.config.get("pixel_id", "")
        test_event_code = req.config.get("test_event_code", "") or ""

        job_kwargs: dict = {
            "name": req.job_name,
            "description": (
                "Sends conversion events to the Meta Conversions API "
                f"for Pixel {pixel_id}. Created by the Meta CAPI Databricks App."
            ),
            "tasks": [
                Task(
                    task_key="send_conversion_events",
                    notebook_task=NotebookTask(
                        notebook_path=workspace_notebook_path,
                        base_parameters={
                            "pixel_id": pixel_id,
                            "test_event_code": test_event_code,
                            "secret_scope": req.secret_scope,
                            "delta_share_catalog": catalog_name
                            or "meta_capi_sample_data",
                            "api_version": META_API_VERSION,
                        },
                    ),
                )
            ],
        }

        schedule_msg = "on demand"
        if req.schedule_type != "on_demand" and req.schedule:
            job_kwargs["schedule"] = CronSchedule(
                quartz_cron_expression=f"CRON {req.schedule}",
                timezone_id="UTC",
                pause_status=PauseStatus.PAUSED,
            )
            schedule_msg = f"scheduled ({req.schedule}, paused)"

        job = w.jobs.create(**job_kwargs)

        job_url = f"{w.config.host}#job/{job.job_id}"

        return {
            "success": True,
            "message": f"Job '{req.job_name}' created successfully ({schedule_msg}).",
            "job_url": job_url,
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Failed to create job: {str(e)}",
        }


# --- Quick Start (Run Now) ---


class PreviewTableRequest(BaseModel):
    source_table: str


@router.post("/preview-table")
async def preview_table(req: PreviewTableRequest, request: Request):
    """Preview a few rows from a source table using the calling user's permissions."""
    import re

    source_table = req.source_table.strip()
    if not source_table:
        return {"success": False, "message": "Source table is required."}

    if not re.match(
        r"^(`[^`]+`|[A-Za-z_]\w*)\.(`[^`]+`|[A-Za-z_]\w*)\.(`[^`]+`|[A-Za-z_]\w*)$",
        source_table,
    ):
        return {"success": False, "message": "Invalid table name format."}

    try:
        import httpx
        from databricks.sdk import WorkspaceClient

        profile = os.environ.get("DATABRICKS_PROFILE")
        w = WorkspaceClient(profile=profile) if profile else WorkspaceClient()
        host = normalize_databricks_host(w.config.host or "").rstrip("/")
        headers = w.config.authenticate()

        # Find a SQL warehouse
        async with httpx.AsyncClient(timeout=30) as client:
            wh_resp = await client.get(f"{host}/api/2.0/sql/warehouses", headers=headers)
            wh_data = wh_resp.json()
            warehouses = wh_data.get("warehouses", [])
            running = [wh for wh in warehouses if wh.get("state") == "RUNNING"]
            wh = running[0] if running else (warehouses[0] if warehouses else None)
            if not wh:
                return {"success": False, "message": "No SQL warehouse available."}

            # Execute query
            stmt_resp = await client.post(
                f"{host}/api/2.0/sql/statements",
                headers=headers,
                json={
                    "warehouse_id": wh["id"],
                    "statement": f"SELECT * FROM {source_table} LIMIT 5",
                    "wait_timeout": "30s",
                },
            )
            stmt_data = stmt_resp.json()

        status = stmt_data.get("status", {})
        if status.get("state") != "SUCCEEDED":
            err = status.get("error", {}).get("message", status.get("state", "Unknown error"))
            msg = f"Query failed: {err}"
            if "INSUFFICIENT_PRIVILEGES" in err or "privilege" in err.lower():
                msg += " Hint: Have you (or your group) been granted access to the dataset table?"
            return {"success": False, "message": msg}

        manifest = stmt_data.get("manifest", {})
        columns = [c["name"] for c in manifest.get("schema", {}).get("columns", [])]
        data_array = stmt_data.get("result", {}).get("data_array", [])
        rows = [dict(zip(columns, row)) for row in data_array]

        return {
            "success": True,
            "columns": columns,
            "rows": rows,
            "total_preview": len(rows),
        }
    except Exception as e:
        return {"success": False, "message": f"Preview failed: {str(e)}"}


class RunQuickStartRequest(BaseModel):
    pixel_id: str
    test_event_code: str | None = None
    source_table: str = ""
    secret_scope: str
    secret_key: str = "access_token"
    catalog: str = ""


@router.post("/run-quick-start")
async def run_quick_start_endpoint(req: RunQuickStartRequest, request: Request):
    """Run CAPI events directly in-app via SQL Statement Execution API."""
    from server.capi_runner import run_quick_start

    import re

    source_table = req.source_table.strip()
    if not source_table:
        return {"success": False, "message": "Source table is required."}

    if not re.match(r"^(`[^`]+`|[A-Za-z_]\w*)\.(`[^`]+`|[A-Za-z_]\w*)\.(`[^`]+`|[A-Za-z_]\w*)$", source_table):
        return {
            "success": False,
            "message": "Invalid table name format. Expected: catalog.schema.table",
        }

    if not req.secret_scope:
        return {"success": False, "message": "Secret scope is required."}

    # Derive catalog from source table if not provided
    catalog = req.catalog.strip() or source_table.split(".")[0]

    try:
        user_token = request.headers.get("x-forwarded-access-token") if IS_DATABRICKS_APP else None
        result = await run_quick_start(
            source_table=source_table,
            pixel_id=req.pixel_id,
            secret_scope=req.secret_scope,
            secret_key=req.secret_key,
            catalog=catalog,
            test_event_code=req.test_event_code or None,
            user_token=user_token,
        )
        return result
    except Exception as e:
        return {
            "success": False,
            "message": f"Quick Start failed: {str(e)}",
            "events_sent": 0,
            "events_failed": 0,
            "batches": 0,
            "errors": [str(e)],
        }
