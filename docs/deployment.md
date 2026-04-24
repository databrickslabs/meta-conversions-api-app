# Deployment

How to deploy `conversions-api-app` to a Databricks workspace.

## Prerequisites

- Databricks CLI v0.210+ installed and configured for your target workspace
- Node.js 20+ and `uv` for Python
- Write access to a workspace path (e.g. `/Workspace/Users/<you>/conversions-api-app`)
- Permission to create Databricks Apps in the target workspace

## One-time setup per workspace

### 1. Build the frontend

```bash
cd app/frontend
npm ci
npm run build
```

This populates `app/frontend/dist/`, which is committed to the repo so the Databricks App runtime can serve it without a build step.

> Note: `app/frontend/dist/` is committed on purpose. If you change any frontend code, rebuild and commit the new `dist/`.

### 2. Sync the repo to your workspace

```bash
databricks sync . /Workspace/Users/<your-email>/conversions-api-app \
  --watch=false \
  --exclude .git \
  --exclude node_modules \
  --exclude __pycache__ \
  --exclude .databricks \
  --exclude .venv
```

Excluding `.git`, `node_modules`, `.venv`, `__pycache__`, and `.databricks` is important — some of those contain files above the 10 MB workspace file size limit and will cause deploy to fail.

### 3. Create the app

```bash
databricks apps create conversions-api-app \
  --description "Meta Conversions API Connector"
```

This provisions app compute. It takes 2–5 minutes on first creation.

### 4. Deploy the source

```bash
databricks apps deploy conversions-api-app \
  --source-code-path /Workspace/Users/<your-email>/conversions-api-app/app
```

⚠️ Note the `/app` suffix. The Marketplace publishing spec requires the app's source code to live in a subfolder, so `--source-code-path` must point at the `app/` subfolder within the synced repo, not the repo root.

### 5. Grant the user API scopes

⚠️ Important: the `user_api_scopes` declared in `app.yaml` are what the app *requests*. They must be explicitly *granted* via `update` or the UI. `create` + `deploy` alone do not grant them.

```bash
databricks apps update conversions-api-app --json '{
  "user_api_scopes": [
    "sql",
    "sql.warehouses",
    "catalog.catalogs:read",
    "catalog.schemas:read",
    "catalog.tables:read",
    "files.files"
  ]
}'
```

After granting, verify with:

```bash
databricks apps get conversions-api-app --output json | jq '.effective_user_api_scopes'
```

You should see the scopes from `app.yaml` plus the default `iam.current-user:read` and `iam.access-control:read`.

## Updating a deployed app

For subsequent deployments:

```bash
# Rebuild frontend if UI changed
cd app/frontend && npm run build && cd ../..

# Sync latest source
databricks sync . /Workspace/Users/<your-email>/conversions-api-app --watch=false \
  --exclude .git --exclude node_modules --exclude __pycache__ --exclude .databricks --exclude .venv

# Deploy — note the /app suffix on the source-code-path
databricks apps deploy conversions-api-app \
  --source-code-path /Workspace/Users/<your-email>/conversions-api-app/app
```

Or use the bundled `make` target (handles the `/app` suffix automatically):

```bash
SOURCE_PATH=/Workspace/Users/<your-email>/conversions-api-app/app make deploy
```

## Local development

### Backend

```bash
uv sync --extra dev
cd app && uv run python app.py
# Backend listens on :8000
```

### Frontend

```bash
cd app/frontend
npm install
npm run dev
# Dev server on :5173, proxies /api to :8000
```

Open [http://localhost:5173](http://localhost:5173).

## Multi-workspace deployments

If you deploy to more than one workspace (e.g. dogfood + staging + prod), create one CLI profile per workspace and pass `-p <profile>` to every command. You can maintain separate repo-folder paths per workspace too.

## Removing the app

```bash
databricks apps stop conversions-api-app
databricks apps delete conversions-api-app
```

Neither of these removes the synced source from your workspace — do that separately if needed.
