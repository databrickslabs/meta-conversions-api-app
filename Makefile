.PHONY: all clean dev lint fmt test coverage build deploy

all: clean lint fmt test

clean:
	rm -rf .venv htmlcov .mypy_cache .pytest_cache .ruff_cache .coverage coverage.xml
	rm -rf app/frontend/dist app/frontend/node_modules/.vite
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

dev:
	uv sync --extra dev
	cd app/frontend && npm install

lint:
	uv run ruff check app/ tests/
	cd app/frontend && npm run lint

fmt:
	uv run ruff format app/ tests/
	uv run ruff check --fix app/ tests/

test:
	uv run pytest tests/ -v

coverage:
	uv run pytest tests/ --cov=app/server --cov-report=html --cov-report=term
	@echo "Coverage report: htmlcov/index.html"

build:
	cd app/frontend && npm run build

deploy: build
	@echo "Deploying conversions-api-app..."
	databricks apps deploy conversions-api-app \
		--source-code-path $${SOURCE_PATH:-/Workspace/Users/$${USER}/conversions-api-app/app}
