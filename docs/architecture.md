# Architecture

## CUJ framing

Before this app, a customer installing the CAPI Marketplace listing landed on a sample notebook and had to manually configure a Pixel ID, create and reference a Databricks Secret, wire the access token into a UDTF call, re-run cells, then separately stand up a Databricks Job for production use — roughly 10 steps across 5 surfaces (notebook editor, Secrets UI/CLI, SQL, Jobs UI, Meta Events Manager). Marketers and ad-ops couldn't complete this without engineering help.

This app reduces Quick Start to ~5 clicks inside a single Databricks App.

## System architecture

```mermaid
graph LR
    subgraph Customer["Meta's Customer — Databricks Workspace"]
        subgraph App["conversions-api-app (Databricks App)"]
            FE[React Frontend<br/>Wizard • Quick Start • Jobs]
            BE[FastAPI Backend]
            FE --> BE
        end
        SQL[SQL Warehouse]
        SEC[Databricks Secrets]
        JOB[Jobs]
        WS[Workspace Files]
    end

    BE -->|SQL Statement API| SQL
    BE -->|Secrets API| SEC
    BE -->|Jobs API| JOB
    BE -->|Workspace API| WS
    SQL -->|temp UDTF → HTTPS| META[Meta Graph API<br/>CAPI Events]
```

## Quick Start runtime flow

```mermaid
sequenceDiagram
    actor User as Marketer
    participant App as conversions-api-app
    participant DB as Databricks
    participant Meta as Meta Graph API

    User->>App: Enter Pixel ID + Access Token
    App->>DB: POST /store-secret
    DB-->>App: Secret created
    User->>App: Click Quick Start
    App->>DB: BEGIN...END with temp UDTF + SELECT
    DB->>Meta: POST events (batches of 1000)
    Meta-->>DB: events_received, fbtrace_id
    DB-->>App: UDTF result rows
    App-->>User: Sent N events in M batches
```

## CUJ reduction

```mermaid
flowchart LR
    subgraph Before["Before — ~10 steps, 5 tools"]
        direction TB
        B1[Install listing] --> B2[Open notebook]
        B2 --> B3[Edit Pixel ID / table]
        B3 --> B4[Create secret via CLI]
        B4 --> B5[Wire secret into SQL]
        B5 --> B6[Run cells]
        B6 --> B7[Validate in Meta]
        B7 --> B8[Create Job]
        B8 --> B9[Parameterize]
        B9 --> B10[Schedule]
    end
    subgraph After["After — ~5 clicks, 1 UI"]
        direction TB
        A1[Install listing] --> A2[Launch companion app]
        A2 --> A3[Wizard: Pixel + token + test]
        A3 --> A4[Click Quick Start]
        A4 --> A5[Optional: Set Up Job]
    end
```

## Key design decisions

### Temp UDTF inside `BEGIN...END`

Quick Start creates a session-scoped `TEMPORARY FUNCTION` with the UDTF source inlined, rather than depending on a pre-registered UC function. This removes any requirement for the user to have DDL permissions on a specific catalog or for a specific function to be pre-deployed.

The entire `CREATE TEMPORARY FUNCTION` + `DECLARE` variables + `SELECT` call goes in a single `BEGIN...END` compound statement because the SQL Statement Execution API accepts only one statement per call, and the function must live in the same session as the query that calls it.

Inside `BEGIN...END`:
- `DECLARE` (not `DECLARE OR REPLACE`) is required
- `SET` (not `SET VAR`) is required
- All `DECLARE` statements must come before any other statements

### Secrets-first, never plaintext

The access token is stored in a Databricks Secret scope during the Wizard flow. Subsequent SQL calls resolve the token via the `secret('scope', 'key')` SQL function — the Python layer never handles the plaintext value after the initial store.

### Dual-mode auth

`server/config.py` detects whether it's running inside a Databricks App (via the `DATABRICKS_APP_NAME` env var) or locally. Locally it reads from `~/.databrickscfg` profiles; in-app it uses the app's service principal, with optional forwarding of the user's identity via the `x-forwarded-access-token` header.

### Frontend build committed

`frontend/dist/` is committed to the repo so the Databricks App runtime can serve it without a build step at deploy time. This avoids needing Node installed inside the app container.

## Major alternatives considered

### Ship only the existing notebook (status quo)
Rejected. Telemetry shows 11 of ~19 install starts failing or abandoning. The notebook alone cannot serve Meta's advertiser audience.

### Build into the Marketplace listing itself (native UI)
Rejected for now. Marketplace doesn't support shipping a companion app as a first-class primitive. Labs is the correct incubator to prove the pattern before asking Product to productize.

### Rely on a Meta-built tool
Rejected. Meta's official CAPI SDKs require per-customer engineering work and don't cover the Databricks path. Databricks hosts the Marketplace listing on Meta's behalf and is best positioned to close the loop.

## Uncertainties and dependencies

- SQL Statement Execution API max `wait_timeout` is 50s; longer UDTF runs require the app to poll for statement completion (implemented).
- Databricks Apps runtime grants user API scopes only after `databricks apps update` — `create` + `deploy` alone are insufficient. See [Deployment](./deployment.md).
- Meta Graph API version (currently `v24.0`) will need periodic bumps as Meta deprecates versions. Single source of truth in `server/config.py` (`META_API_VERSION`).
- Depends on the upstream [`pyspark-udtf`](https://github.com/allisonwang-db/pyspark-udtf) OSS package for UDTF logic. The source is currently inlined into the temp function to avoid environment-install cold starts.
