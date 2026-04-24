# Meta Conversions API App for Databricks

[![build](https://github.com/databrickslabs/meta-conversions-api-app/actions/workflows/push.yml/badge.svg)](https://github.com/databrickslabs/meta-conversions-api-app/actions/workflows/push.yml)
[![codecov](https://codecov.io/github/databrickslabs/meta-conversions-api-app/graph/badge.svg)](https://codecov.io/github/databrickslabs/meta-conversions-api-app)
![python](https://img.shields.io/badge/python-3.11%2B-blue.svg)
![node](https://img.shields.io/badge/node-20%2B-green.svg)
![license](https://img.shields.io/badge/license-Databricks-lightgrey.svg)

A companion Databricks App for the [Meta Conversions API](https://marketplace.databricks.com/details/8a8f4ead-db28-45e9-b39b-aabbbe1dbe08/Meta_Meta-Conversions-API) marketplace listing. Provides a guided setup experience for connecting your Databricks lakehouse to [Meta's Conversions API (CAPI)](https://developers.facebook.com/docs/marketing-api/conversions-api/) — built with FastAPI and React.

> This is a [Databricks Labs](https://databricks.com/learn/labs) project. It is provided as-is and is not formally supported by Databricks. See [`LICENSE`](./LICENSE) for terms of use.

## About the Meta Conversions API

The Meta Conversions API lets you share server-side marketing data directly from your Databricks lakehouse to Meta, bypassing browser-based limitations like ad blockers and cookie restrictions. When used alongside the Meta Pixel, it improves measurement, reporting, and optimization by providing a more complete view of the customer journey.

**Use cases**
- **Optimizing ad performance** — Fuel Meta AI's delivery engine with high-quality signals to decrease cost per action
- **Improving measurement** — Accurately track actions including deep-funnel milestones like subscription renewals or qualified leads
- **Increasing match quality** — Share hashed first-party data to improve event match quality (EMQ) and enhance audience retargeting
- **Tracking offline conversions** — Connect in-store purchases and phone-call conversions directly to Meta ad campaigns

## What This App Does

- **Guided wizard** to configure your Meta Pixel ID, access token, and optional test event code
- **Test connection** to validate credentials against the Meta Graph API before saving
- **Quick Launch** deploys a ready-to-run UDTF notebook with sample data to your workspace, securely stores your access token in Databricks Secrets, and uses the marketplace listing's mapping YAML when available
- **Job Setup** lets you configure column mappings from your source table to Meta CAPI parameters (with mandatory transforms enforced per Meta's spec), then creates a Databricks job with optional scheduling
- **Settings panel** reads your `~/.databrickscfg` profiles, lets you switch workspaces, and shows marketplace listing status
- **Connection management** saves connections locally, lets you review/edit config, and pick up where you left off

## Prerequisites

- A Databricks workspace
- The [Meta Conversions API marketplace listing](https://marketplace.databricks.com/details/8a8f4ead-db28-45e9-b39b-aabbbe1dbe08/Meta_Meta-Conversions-API) installed on your workspace
- A Meta Pixel ID and access token ([how to get them](https://developers.facebook.com/docs/marketing-api/conversions-api/get-started))

## Deploy to Databricks

See [`docs/deployment.md`](./docs/deployment.md) for the full flow.

```bash
# Build the frontend
cd app/frontend && npm run build && cd ../..

# Create the app
databricks apps create meta-conversions-api-app \
  --description "Meta Conversions API Connector" \
  -p <your-profile>

# Deploy — note the /app suffix: Marketplace requires the source
# code to live in a subfolder, so --source-code-path points at app/
databricks apps deploy meta-conversions-api-app \
  --source-code-path /Workspace/Users/<your-email>/meta-conversions-api-app/app \
  -p <your-profile>
```

## Local Development

### Install dependencies

```bash
# Python backend (root of repo)
uv sync --extra dev

# React frontend
cd app/frontend
npm install
```

### Run

```bash
# Terminal 1: Backend (port 8000)
cd app && uv run python app.py

# Terminal 2: Frontend dev server (port 5173, proxies /api to backend)
cd app/frontend
npm run dev
```

Open http://localhost:5173

## Architecture

```
meta-conversions-api-app/
  app/                        # App source — deployed to Databricks
    app.py                    # FastAPI entry point (serves API + React SPA)
    app.yaml                  # Databricks Apps deployment config
    manifest.yaml             # Marketplace publishing spec
    server/
      config.py               # Dual-mode auth (local dev + Databricks App)
      routes.py               # API endpoints
      capi_runner.py          # SQL Statement API + temp UDTF execution
      assets/                 # Bundled notebook + mapping YAML
    frontend/
      src/
        App.tsx               # Main app with routing and state
        components/           # React components (Wizard, JobSetup, etc.)
        hooks/useApi.ts       # Fetch hook + POST helper
      dist/                   # Pre-built bundle (committed)
  tests/                      # Backend tests
  docs/                       # User + deployment documentation
  pyproject.toml              # Project metadata + tool config
  Makefile                    # clean/lint/fmt/test/coverage/build/deploy
```

### API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/me` | Current user + workspace from active Databricks profile |
| `GET /api/profiles` | List `~/.databrickscfg` profiles |
| `POST /api/profiles/switch` | Switch active Databricks profile |
| `GET /api/marketplace-listing` | Check if Meta CAPI marketplace listing is installed |
| `POST /api/test-connection` | Send a test event to Meta Graph API |
| `POST /api/quick-launch` | Deploy notebook + secrets to workspace |
| `POST /api/create-job` | Create a Databricks job with notebook + mapping |
| `GET /api/default-mapping` | Return the default column mapping YAML |

## Column Mapping

The app uses a YAML-based column mapping to translate your table schema into Meta's CAPI event format. The mapping supports:

- **Server event parameters**: `event_name`, `event_time`, `action_source`, etc.
- **User data** (`user_data`): `em`, `ph`, `fn`, `ln`, `client_ip_address`, `fbc`, `fbp`, etc.
- **Custom data** (`custom_data`): `value`, `currency`, `content_ids`, `content_type`, etc.
- **Transforms**: `sha256`, `normalize` (resolved to `normalize_email`/`normalize_phone`), `to_epoch`, `cast_float`, `cast_int`, `cast_string`

Mandatory transforms (e.g. SHA256 hashing for email/phone) are enforced per [Meta's parameter spec](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters).

## Additional Information

- **Direct connection** — Secure server-to-server connection that reduces signal loss caused by connectivity issues or browser loading errors
- **Deduplication** — Send identical `event_id` values from both the Meta Pixel and the Conversions API to avoid over-reporting
- **Privacy and control** — Supports Limited Data Use (LDU) to assist with CCPA and GDPR compliance
- **Governance** — Running within Databricks ensures all marketing activation is managed through Unity Catalog

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for development setup, testing, and the PR process.

## Security

To report a security vulnerability, please see [`SECURITY.md`](./SECURITY.md).

## License

See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE). This project is licensed under the Databricks License.
