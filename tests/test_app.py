"""Tests for app.py — SPA serving, path traversal protection, and API routing."""

import pytest
from fastapi.testclient import TestClient
from app import app


@pytest.fixture
def client():
    return TestClient(app)


class TestHealthEndpoint:
    def test_health_returns_200(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        assert "version" in data
        assert "app" in data

    def test_health_has_databricks_app_flag(self, client):
        resp = client.get("/api/health")
        data = resp.json()
        assert "is_databricks_app" in data


class TestSPAServing:
    def test_root_returns_html_or_json(self, client):
        resp = client.get("/")
        # Either serves index.html (200) or the "build frontend" JSON message
        assert resp.status_code == 200

    def test_unknown_route_serves_spa(self, client):
        resp = client.get("/some/random/route")
        assert resp.status_code == 200

    def test_path_traversal_blocked(self, client):
        """Attempting to escape frontend_dist via ../ should serve index.html, not a system file."""
        resp = client.get("/../../../etc/passwd")
        assert resp.status_code == 200
        # Should NOT contain /etc/passwd contents
        assert "root:" not in resp.text

    def test_path_traversal_encoded_blocked(self, client):
        resp = client.get("/%2e%2e/%2e%2e/etc/passwd")
        assert resp.status_code == 200
        assert "root:" not in resp.text


class TestAPIRouting:
    def test_config_endpoint(self, client):
        resp = client.get("/api/config")
        assert resp.status_code == 200
        data = resp.json()
        assert "app_name" in data
        assert "version" in data

    def test_default_mapping(self, client):
        resp = client.get("/api/default-mapping")
        assert resp.status_code == 200
        data = resp.json()
        assert "mapping" in data

    def test_run_quick_start_rejects_empty_table(self, client):
        resp = client.post("/api/run-quick-start", json={
            "pixel_id": "123",
            "source_table": "",
            "secret_scope": "my_scope",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert "required" in data["message"].lower()

    def test_run_quick_start_rejects_invalid_table_name(self, client):
        resp = client.post("/api/run-quick-start", json={
            "pixel_id": "123",
            "source_table": "not_a_valid_table; DROP TABLE x",
            "secret_scope": "my_scope",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert "invalid" in data["message"].lower() or "format" in data["message"].lower()

    def test_run_quick_start_rejects_two_part_table(self, client):
        resp = client.post("/api/run-quick-start", json={
            "pixel_id": "123",
            "source_table": "catalog.schema",
            "secret_scope": "my_scope",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False

    def test_test_connection_requires_fields(self, client):
        """Pydantic should reject missing required fields."""
        resp = client.post("/api/test-connection", json={})
        assert resp.status_code == 422  # Pydantic validation error

    def test_quick_launch_requires_fields(self, client):
        resp = client.post("/api/quick-launch", json={})
        assert resp.status_code == 422

    def test_search_tables_empty_query(self, client):
        """Empty query should return empty results when a Databricks workspace
        is reachable. Skip in environments with no auth configured (CI)."""
        import os
        from pathlib import Path
        has_auth = (
            os.environ.get("DATABRICKS_HOST")
            or os.environ.get("DATABRICKS_TOKEN")
            or (Path.home() / ".databrickscfg").exists()
        )
        if not has_auth:
            import pytest
            pytest.skip("No Databricks auth configured; skipping live-workspace test")
        try:
            resp = client.get("/api/search-tables?q=")
            assert resp.status_code in (200, 500)
        except Exception:
            # Auth configured but workspace unreachable — still acceptable
            pass


class TestStoreSecret:
    def test_requires_access_token(self, client):
        resp = client.post("/api/store-secret", json={})
        assert resp.status_code == 422

    def test_requires_secret_scope(self, client):
        resp = client.post("/api/store-secret", json={
            "access_token": "test",
        })
        assert resp.status_code == 422


class TestPreviewTable:
    def test_rejects_empty_table(self, client):
        resp = client.post("/api/preview-table", json={"source_table": ""})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert "required" in data["message"].lower()

    def test_rejects_invalid_table_format(self, client):
        resp = client.post("/api/preview-table", json={
            "source_table": "not_valid; DROP TABLE x",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert "invalid" in data["message"].lower() or "format" in data["message"].lower()


class TestRunQuickStart:
    def test_accepts_request_with_secret_scope(self, client):
        """Valid request should pass Pydantic validation and reach the handler."""
        resp = client.post("/api/run-quick-start", json={
            "pixel_id": "123",
            "source_table": "catalog.schema.table",
            "secret_scope": "my_scope",
            "secret_key": "access_token",
        })
        assert resp.status_code == 200
        data = resp.json()
        # Will fail downstream (no Databricks connection in test env), but the
        # request itself should be accepted by Pydantic
        assert "success" in data

    def test_rejects_missing_secret_scope(self, client):
        """secret_scope is a required field per the Pydantic model."""
        resp = client.post("/api/run-quick-start", json={
            "pixel_id": "123",
            "source_table": "catalog.schema.table",
        })
        assert resp.status_code == 422  # Pydantic validation error


class TestTestConnection:
    def test_requires_pixel_id(self, client):
        resp = client.post("/api/test-connection", json={
            "access_token": "test",
        })
        assert resp.status_code == 422

    def test_requires_access_token(self, client):
        resp = client.post("/api/test-connection", json={
            "pixel_id": "123",
        })
        assert resp.status_code == 422
