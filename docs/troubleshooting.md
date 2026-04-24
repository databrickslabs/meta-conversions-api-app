# Troubleshooting

## Deployment

### `databricks apps deploy` fails with "File size imported is (N bytes), exceeded max size (10485760 bytes)"

You probably synced `.venv/`, `.git/`, or `node_modules/` into the workspace. These directories contain files larger than the 10 MB workspace file size limit.

Fix: clean up the workspace and re-sync with explicit excludes.

```bash
# Remove the problem directories from the workspace
for dir in .venv .git .claude .databricks __pycache__ node_modules; do
  databricks workspace delete "/Workspace/Users/<you>/conversions-api-app/$dir" --recursive 2>/dev/null
done

# Re-sync with excludes
databricks sync . /Workspace/Users/<you>/conversions-api-app --watch=false \
  --exclude .git --exclude node_modules --exclude __pycache__ --exclude .databricks --exclude .venv
```

### `effective_user_api_scopes` only shows `iam.current-user:read` and `iam.access-control:read`

The scopes declared in `app.yaml` are what the app *requests*, but they must be granted explicitly. Run `databricks apps update` with the full scope list — see [Deployment §5](./deployment.md#5-grant-the-user-api-scopes).

### Marketplace listing not detected (Settings panel shows "Marketplace listing not detected")

The Marketplace listing provides the sample data and mapping YAML that Quick Start depends on. If the workspace hasn't installed the listing, enter the catalog name manually in Settings — the app will use that as the `{marketplace_catalog}` substitution for all lookups.

## Quick Start

### `PARSE_SYNTAX_ERROR: Syntax error at or near 'DECLARE'; extra input 'DECLARE'`

The SQL Statement Execution API accepts only a single statement per call. Multi-statement scripts must be wrapped in a `BEGIN...END` compound statement.

Inside `BEGIN...END`:
- Use `DECLARE`, not `DECLARE OR REPLACE`
- Use `SET`, not `SET VAR`
- All `DECLARE` statements must come before any other statements (including `CREATE TEMPORARY FUNCTION`)

This is already handled in `server/capi_runner.py`; the error typically shows up only if you're running the raw SQL directly in the SQL editor on a serverless warehouse, which uses a slightly different dialect.

### `INVALID_VARIABLE_DECLARATION.ONLY_AT_BEGINNING`

A `DECLARE` statement appears after a non-DECLARE statement inside a `BEGIN...END` block. Move all `DECLARE` lines to the top.

### `CANNOT_RESOLVE_STAR_EXPAND: Cannot resolve __auto_generated_subquery_name_1.* given input columns c`

This is a known issue with UC-registered UDTFs that take a `TABLE()` argument in certain catalog configurations. The app works around it by creating a session-scoped temp UDTF rather than calling a pre-registered UC function. If you hit this running custom SQL directly against a UC-registered Meta CAPI UDTF, use the temp-function pattern shown in `server/capi_runner.py`.

### `The wait_timeout field must be 0 seconds (disables wait), or between 5 seconds and 50 seconds`

The SQL Statement Execution API caps `wait_timeout` at 50s. For longer-running queries, send a shorter `wait_timeout` and poll the statement endpoint for completion. `server/capi_runner.py` polls up to 24 times with a 5-second interval (total ~2 minutes).

### Events sent successfully but don't appear in Meta Events Manager

Expected behavior — Meta takes up to 30 minutes to surface server-side events in the dashboard. If you're debugging, use the **Event Test Code** field and check the Test Events tab in Meta Events Manager for real-time validation.

### 1001 events sent but only 1000 batched

Meta's batch size is 1000 events per request. The app splits larger event sets into multiple batches; `Batches: 2` on the result screen means the app made 2 HTTPS calls to the Graph API.

## Secrets

### `Failed to read secret` error during Quick Start

The access token wasn't stored in the expected secret scope/key, or the app's service principal doesn't have READ permission on the secret scope. Fix by either re-saving the token via the Wizard or adjusting scope ACLs in the workspace.

### Workspace shows "Your workspace has reached the maximum number of secret scopes"

Databricks workspaces are limited to 100 secret scopes. Clean up unused scopes via the CLI (`databricks secrets list-scopes` + `delete-scope`) or share a scope across connections by setting `Secret Scope` in the Wizard's advanced settings.

## Local development

### Backend can't find a Databricks profile

The backend reads `DATABRICKS_PROFILE` from the environment or falls back to `DEFAULT` in `~/.databrickscfg`. Set it explicitly:

```bash
export DATABRICKS_PROFILE=my-profile
uv run python app.py
```

### Frontend dev server returns 502 on `/api/*` calls

The Vite dev server proxies `/api/*` to `http://localhost:8000` by default. Make sure the backend is actually running on port 8000.

## Getting help

- File issues at [github.com/databrickslabs/conversions-api-app/issues](https://github.com/databrickslabs/conversions-api-app/issues)
- Security vulnerabilities: see [`SECURITY.md`](../SECURITY.md)
