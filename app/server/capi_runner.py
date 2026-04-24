"""Run Meta CAPI events via SQL Statement Execution API.

Creates a session-scoped temporary UDTF with inlined source, then
executes it — all within a single BEGIN...END compound statement.
Access token is read from Databricks Secrets and mapping YAML from
a Unity Catalog Volume.
"""

import logging
import os
import re
from pathlib import Path

logger = logging.getLogger(__name__)

ASSETS_DIR = Path(__file__).parent / "assets"

# Strict pattern: backtick-quoted or plain identifiers, 3-part UC name
_VALID_TABLE_RE = re.compile(
    r"^(`[^`]+`|[A-Za-z_]\w*)"
    r"\.(`[^`]+`|[A-Za-z_]\w*)"
    r"\.(`[^`]+`|[A-Za-z_]\w*)$"
)


def _validate_table_name(name: str) -> str:
    """Validate a Unity Catalog table name (catalog.schema.table).

    Raises ValueError if the name doesn't match the expected pattern.
    """
    name = name.strip()
    if not _VALID_TABLE_RE.match(name):
        raise ValueError(
            f"Invalid table name: {name!r}. "
            "Expected format: catalog.schema.table"
        )
    return name


def _sql_escape_string(value: str) -> str:
    """Escape a string for use in a SQL string literal (double single quotes)."""
    return value.replace("'", "''")


def load_mapping_yaml() -> str:
    """Load the mapping YAML string from the bundled asset."""
    yaml_path = ASSETS_DIR / "mapping_conversion.yaml"
    return yaml_path.read_text()


def _load_udtf_source() -> str:
    """Load the inlined UDTF Python source from the bundled asset."""
    source_path = ASSETS_DIR / "udtf_inline_source.py"
    return source_path.read_text()


def _get_auth(user_token: str | None = None):
    """Return (host, headers) for Databricks REST API calls."""
    from server.config import APP_USER_AGENT, IS_DATABRICKS_APP, normalize_databricks_host

    if IS_DATABRICKS_APP:
        host = normalize_databricks_host(os.environ.get("DATABRICKS_HOST", "")).rstrip("/")
        if user_token:
            headers = {"Authorization": f"Bearer {user_token}"}
        else:
            from databricks.sdk import WorkspaceClient
            w = WorkspaceClient()
            headers = w.config.authenticate()
    else:
        from databricks.sdk import WorkspaceClient
        profile = os.environ.get("DATABRICKS_PROFILE")
        w = WorkspaceClient(profile=profile) if profile else WorkspaceClient()
        host = normalize_databricks_host(w.config.host or "").rstrip("/")
        headers = w.config.authenticate()

    # Tag outbound REST calls so Labs telemetry can attribute them
    headers["User-Agent"] = APP_USER_AGENT
    return host, headers


async def _find_warehouse(client, host: str, headers: dict) -> str | None:
    """Find a running SQL warehouse, return its ID."""
    resp = await client.get(f"{host}/api/2.0/sql/warehouses", headers=headers)
    data = resp.json()
    warehouses = data.get("warehouses", [])
    running = [wh for wh in warehouses if wh.get("state") == "RUNNING"]
    wh = running[0] if running else (warehouses[0] if warehouses else None)
    return wh["id"] if wh else None


async def _execute_sql(client, host: str, headers: dict, warehouse_id: str, sql: str) -> dict:
    """Execute a SQL statement, polling until completion."""
    import asyncio

    logger.info("Executing SQL on warehouse %s: %s", warehouse_id, sql[:200])
    resp = await client.post(
        f"{host}/api/2.0/sql/statements",
        headers=headers,
        json={
            "warehouse_id": warehouse_id,
            "statement": sql,
            "wait_timeout": "50s",
        },
        timeout=60,
    )
    data = resp.json()
    if resp.status_code != 200:
        logger.error("SQL Statement API HTTP %s: %s", resp.status_code, data)
        return data

    # Poll if still pending/running
    statement_id = data.get("statement_id")
    state = data.get("status", {}).get("state", "")
    poll_count = 0
    while state in ("PENDING", "RUNNING") and poll_count < 24:
        await asyncio.sleep(5)
        poll_count += 1
        poll_resp = await client.get(
            f"{host}/api/2.0/sql/statements/{statement_id}",
            headers=headers,
            timeout=15,
        )
        data = poll_resp.json()
        state = data.get("status", {}).get("state", "")
        logger.info("Poll %d: state=%s", poll_count, state)

    return data


async def run_quick_start(
    source_table: str,
    pixel_id: str,
    secret_scope: str,
    secret_key: str = "access_token",
    catalog: str = "meta_meta_conversions_api",
    test_event_code: str | None = None,
    user_token: str | None = None,
) -> dict:
    """Run the UDTF on Databricks via SQL Statement Execution API.

    Creates a temp UDTF and calls it in a single BEGIN...END block.
    """
    import httpx

    source_table = _validate_table_name(source_table)

    host, headers = _get_auth(user_token)

    udtf_source = _load_udtf_source()
    mapping_volume_path = f"/Volumes/{_sql_escape_string(catalog)}/meta_capi/mappings/mapping_conversion.yaml"
    pixel_id_escaped = _sql_escape_string(pixel_id)
    secret_scope_escaped = _sql_escape_string(secret_scope)
    secret_key_escaped = _sql_escape_string(secret_key)
    test_code_value = _sql_escape_string(test_event_code) if test_event_code else ""

    sql = f"""
BEGIN
  DECLARE pixel_id STRING DEFAULT '{pixel_id_escaped}';
  DECLARE access_token STRING DEFAULT secret('{secret_scope_escaped}', '{secret_key_escaped}');
  DECLARE test_event_code STRING DEFAULT '{test_code_value}';
  DECLARE mapping_yaml STRING;

  CREATE OR REPLACE TEMPORARY FUNCTION write_to_meta_capi(
      data TABLE,
      pixel_id STRING,
      access_token STRING,
      mapping_yaml STRING,
      test_event_code STRING
  )
  RETURNS TABLE (
      status STRING,
      events_received INT,
      events_failed INT,
      fbtrace_id STRING,
      error_message STRING
  )
  LANGUAGE PYTHON
  HANDLER 'MetaCAPILogic'
  AS $$
{udtf_source}
  $$;

  SET mapping_yaml = (
    SELECT CONCAT_WS('\\n', COLLECT_LIST(string(value)))
    FROM read_files('{mapping_volume_path}', format => 'text')
  );

  SELECT * FROM write_to_meta_capi(
    TABLE(SELECT * FROM {source_table}),
    pixel_id,
    access_token,
    mapping_yaml,
    test_event_code
  );
END;
"""

    async with httpx.AsyncClient() as client:
        warehouse_id = await _find_warehouse(client, host, headers)
        if not warehouse_id:
            return {"success": False, "message": "No SQL warehouse available."}

        logger.info("Executing Quick Start (temp UDTF) on warehouse %s", warehouse_id)
        result = await _execute_sql(client, host, headers, warehouse_id, sql)

        # Check status
        status = result.get("status", {})
        state = status.get("state", "")
        if state != "SUCCEEDED":
            logger.error("SQL Statement API returned state=%s, full response: %s", state, result)
            err = status.get("error", {}).get("message", "")
            if not err:
                err = result.get("message", state or "Unknown error")
            return {
                "success": False,
                "message": f"Quick Start failed: {err}",
                "events_sent": 0,
                "events_failed": 0,
            }

        # Parse results
        manifest = result.get("manifest", {})
        columns = [c["name"] for c in manifest.get("schema", {}).get("columns", [])]
        data_array = result.get("result", {}).get("data_array", [])

        col_idx = {name: i for i, name in enumerate(columns)}
        status_idx = col_idx.get("status")
        received_idx = col_idx.get("events_received")
        failed_idx = col_idx.get("events_failed")
        error_idx = col_idx.get("error_message")

        total_received = 0
        total_failed = 0
        errors: list[str] = []

        for row in data_array:
            row_status = row[status_idx] if status_idx is not None else None
            received = int(row[received_idx] or 0) if received_idx is not None else 0
            failed = int(row[failed_idx] or 0) if failed_idx is not None else 0
            error_msg = row[error_idx] if error_idx is not None else None

            if row_status == "success":
                total_received += received
                total_failed += failed
            else:
                total_failed += failed
                if error_msg:
                    errors.append(error_msg)

        total_batches = len(data_array)
        success = total_failed == 0 and not errors

        message = (
            f"Sent {total_received} events to Meta CAPI"
            f" ({total_batches} batch{'es' if total_batches != 1 else ''})."
        )
        if total_failed:
            message += f" {total_failed} failed."

        return {
            "success": success,
            "message": message,
            "events_sent": total_received,
            "events_failed": total_failed,
            "batches": total_batches,
            "errors": errors[:10],
        }
