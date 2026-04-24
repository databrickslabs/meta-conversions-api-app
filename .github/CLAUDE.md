# CLAUDE.md — Project Guidance

## Project Overview

`conversions-api-app` is a Databricks App that provides a guided setup experience for connecting a Databricks lakehouse to [Meta's Conversions API (CAPI)](https://developers.facebook.com/docs/marketing-api/conversions-api/). It's a companion to the [Meta Conversions API marketplace listing](https://marketplace.databricks.com/details/8a8f4ead-db28-45e9-b39b-aabbbe1dbe08/Meta_Meta-Conversions-API).

**Stack:** FastAPI (Python) backend + React/TypeScript/Vite frontend, deployed as a Databricks App.

## Expertise and Principles

You are an expert in **Python, FastAPI, Databricks Apps, Databricks SDK, Databricks REST APIs, SQL Statement Execution API, Unity Catalog, TypeScript, React, and React Bootstrap**.

### Key Principles

- Write concise, technical responses with accurate examples.
- Prefer **functional and declarative patterns**; reach for classes only when necessary.
- Prefer **iteration and modularization** over duplication.
- Use descriptive variable names with auxiliary verbs (e.g. `is_active`, `has_permission`, `isLoading`, `hasError`).
- Naming conventions:
  - Python: lowercase with underscores (e.g. `app/server/capi_runner.py`, `app/server/routes.py`).
  - TypeScript: components in PascalCase (e.g. `QuickStart.tsx`), variables in camelCase.

## Code Style

### Python (backend)

- Use type hints everywhere, including `str | None` union syntax (PEP 604).
- Use `logger = logging.getLogger(__name__)` at module top; avoid `print()`.
- For SQL construction, always use the existing `_sql_escape_string` and `_validate_table_name` helpers — never interpolate raw user input into SQL.
- Keep `app/server/capi_runner.py` the single source of truth for SQL Statement API calls.

### TypeScript (frontend)

- Prefer functional components and hooks.
- Types live in `src/App.tsx` when shared (e.g. `CAPIConfig`, `SavedConnection`).
- Use React Bootstrap components (`Card`, `Button`, `Form`) rather than custom styled elements when possible.
- Proxy API calls through `postApi` / `useApi` from `src/hooks/useApi.ts`.

## Architecture Notes

- **Dual-mode auth** (`app/server/config.py`): detects Databricks Apps runtime via `DATABRICKS_APP_NAME` env var. Local dev reads from `~/.databrickscfg` profiles.
- **Secrets flow:** access tokens are created in Databricks Secrets during the Wizard flow via `POST /store-secret`. Subsequent API calls resolve tokens via `secret('scope', 'key')` in SQL, never by passing plaintext.
- **Quick Start** executes a UDTF via the SQL Statement Execution API. The UDTF is created inline as a `TEMPORARY FUNCTION` inside a `BEGIN...END` compound statement (see `app/server/capi_runner.py`).
- **SQL Statement API constraints:** single statement per call, max `wait_timeout` is 50 seconds, `DECLARE` (not `DECLARE OR REPLACE`) and `SET` (not `SET VAR`) required inside `BEGIN...END`.
- **Frontend build output** in `app/frontend/dist/` is committed to the repo so the Databricks App runtime can serve it without a build step.
- **Subfolder layout:** all deployable app code lives under `app/` (required by the Marketplace publishing spec). Deploy with `--source-code-path <workspace-path>/app`.

## Testing

- Backend tests live in `tests/` and use `pytest` with FastAPI's `TestClient`.
- Run `make test` for unit tests, `make coverage` for coverage report.
- Frontend type-check with `npx tsc -b --noEmit` before committing UI changes.

## Deployment

- Build the frontend first: `cd app/frontend && npm run build` (or `make build`).
- Sync to a workspace path, then `databricks apps deploy conversions-api-app --source-code-path <workspace-path>/app`.
- After creating a new app, run `databricks apps update` to grant the `user_api_scopes` from `app/app.yaml` — deploy alone does not grant them.

## When Making Changes

- **UI-affecting changes:** rebuild `app/frontend/dist/` and commit the updated bundle.
- **Schema/API changes:** update both the Pydantic model in `app/server/routes.py` and the TypeScript type in the relevant component.
- **New dependencies:** add to `pyproject.toml` (backend) or `app/frontend/package.json`; run `uv sync` / `npm install`; do not commit `.venv/` or `node_modules/`.

## Things to Avoid

- Do not commit `.venv/`, `node_modules/`, `.git/`, or `__pycache__/` to the workspace via `databricks sync` — exclude them explicitly.
- Do not pass access tokens as plaintext in Python when the SQL can read them from Secrets directly.
- Do not call `CREATE OR REPLACE FUNCTION` with `OR REPLACE` inside a `BEGIN...END` block — it isn't valid there.
