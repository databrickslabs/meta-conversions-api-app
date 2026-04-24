# Contributing to meta-conversions-api-app

We happily welcome contributions to *meta-conversions-api-app*. We use GitHub Issues to track community reported issues and GitHub Pull Requests for accepting changes.

## Reporting Issues

Please file bugs, feature requests, and questions as [GitHub Issues](https://github.com/databrickslabs/meta-conversions-api-app/issues). Before filing, search existing issues to avoid duplicates.

## Development Setup

### Prerequisites

- Python 3.10+
- Node.js 20+
- A Databricks workspace with the [Meta Conversions API marketplace listing](https://marketplace.databricks.com/details/8a8f4ead-db28-45e9-b39b-aabbbe1dbe08/Meta_Meta-Conversions-API) installed
- [`uv`](https://github.com/astral-sh/uv) for Python dependency management

### Install

```bash
# Backend (from repo root)
uv sync --extra dev

# Frontend
cd app/frontend
npm install
```

### Run locally

```bash
# Terminal 1: Backend (port 8000) — must run from app/ for import resolution
cd app && uv run python app.py

# Terminal 2: Frontend dev server (port 5173, proxies /api to backend)
cd app/frontend
npm run dev
```

Open http://localhost:5173

### Run tests

```bash
make test
```

## Pull Request Process

1. Fork the repository and create your branch from `main`.
2. Make your changes with clear commits.
3. Ensure `make lint` and `make test` pass.
4. Update documentation (`README.md`) if you've changed behavior.
5. Open a pull request with a clear description of the change and its motivation.

## Code Style

- **Python:** follows [ruff](https://docs.astral.sh/ruff/) formatting and linting. Run `make fmt`.
- **TypeScript/React:** follows the project's ESLint + Prettier config. Run `npm run lint` in `app/frontend/`.

## Commit Messages

Use clear, descriptive messages that explain *why* a change was made. For bug fixes, reference the issue number (e.g. `Fix secret scope lookup (#42)`).
