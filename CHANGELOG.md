# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the project is in Databricks Labs, versions stay below `1.0.0`.

## [Unreleased]

## [0.1.0] — 2026-04-17

Initial Labs release.

### Added
- **Setup Wizard** — guided flow to configure Meta Pixel ID, access token, and optional test event code; tests the connection against the Meta Graph API before saving.
- **Quick Start** — runs Meta CAPI events in-app via the Databricks SQL Statement Execution API. Creates a session-scoped temporary UDTF inside a `BEGIN...END` compound statement with inlined Python source; reads the access token from Databricks Secrets via `secret()` and the column mapping YAML from a Unity Catalog Volume.
- **Deploy Notebook** — drops a ready-to-run Meta CAPI UDTF notebook into the user's workspace alongside the bundled mapping YAML.
- **Job Setup** — visual column-mapping UI that builds a Databricks Job with a configurable cron schedule.
- **Connection management** — persist connections in browser `localStorage` with links to review and edit saved config, including re-setting the access token secret.
- **Settings panel** — lists `~/.databrickscfg` profiles for local development, lets users switch workspaces, and surfaces Marketplace listing status.
- **Databricks Secrets integration** — access tokens are stored in a scope during the Wizard flow via `POST /store-secret`; subsequent API calls resolve tokens via `secret('scope', 'key')` in SQL rather than passing plaintext.
- **Dual-mode auth** — detects Databricks Apps runtime via `DATABRICKS_APP_NAME`; local dev reads from `~/.databrickscfg`.
- **Databricks Labs scaffolding** — `LICENSE`, `NOTICE`, `CONTRIBUTING.md`, `SECURITY.md`, `CODEOWNERS.txt`, `Makefile`, pre-commit config, CLAUDE.md.
- **CI** — GitHub Actions workflow for backend tests + frontend type-check and build; CodeQL security scanning on push, PR, and weekly schedule; Dependabot for pip, npm, and GitHub Actions ecosystems.
- **Telemetry** — `meta-conversions-api-app/<version>` prefix registered with the Databricks SDK user-agent and propagated to direct REST calls from the app.
- **Test coverage** — `pytest-cov` reporting with Codecov integration; baseline 30% (target 80%, informational while we build up the suite).

### Infrastructure
- Backend: FastAPI, Databricks SDK, Databricks REST APIs.
- Frontend: React + TypeScript + Vite + React Bootstrap.
- Python 3.11+, Node 20+.

[Unreleased]: https://github.com/databrickslabs/meta-conversions-api-app/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/databrickslabs/meta-conversions-api-app/releases/tag/v0.1.0
