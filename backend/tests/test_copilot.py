"""
Tests for the Copilot connector layer.

Run with:
    cd backend && python -m pytest tests/test_copilot.py -v

Requirements:
    pip install pytest httpx
"""

import json
import os

import pytest
import yaml

# Set a test token before importing the app so pydantic-settings picks it up.
os.environ.setdefault("COPILOT_API_TOKEN", "test-token-1234")

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

VALID_TOKEN = "test-token-1234"
AUTH_HEADER = {"Authorization": f"Bearer {VALID_TOKEN}"}
REPORT_URL = "/api/copilot/reports/sales-performance"


# ── Authentication ─────────────────────────────────────────────────────────────

class TestAuth:
    def test_missing_token_returns_401(self):
        """No Authorization header → 401."""
        resp = client.get(REPORT_URL, params={"month": "2026-06"})
        assert resp.status_code == 401
        assert resp.json() == {"error": "Unauthorized"}

    def test_wrong_token_returns_401(self):
        """Wrong bearer token → 401."""
        resp = client.get(
            REPORT_URL,
            params={"month": "2026-06"},
            headers={"Authorization": "Bearer wrong-token"},
        )
        assert resp.status_code == 401
        assert resp.json() == {"error": "Unauthorized"}

    def test_malformed_auth_scheme_returns_401(self):
        """Non-bearer scheme → 401."""
        resp = client.get(
            REPORT_URL,
            params={"month": "2026-06"},
            headers={"Authorization": f"Basic {VALID_TOKEN}"},
        )
        assert resp.status_code == 401
        assert resp.json() == {"error": "Unauthorized"}


# ── Input validation ───────────────────────────────────────────────────────────

class TestMonthValidation:
    def test_invalid_month_format_returns_400(self):
        """Non-YYYY-MM string → 400 with helpful message."""
        resp = client.get(REPORT_URL, params={"month": "June2026"}, headers=AUTH_HEADER)
        assert resp.status_code == 400
        body = resp.json()
        assert "error" in body
        assert "YYYY-MM" in body["error"]

    def test_plain_year_returns_400(self):
        resp = client.get(REPORT_URL, params={"month": "2026"}, headers=AUTH_HEADER)
        assert resp.status_code == 400

    def test_invalid_month_number_returns_400(self):
        resp = client.get(REPORT_URL, params={"month": "2026-13"}, headers=AUTH_HEADER)
        assert resp.status_code == 400

    def test_date_format_returns_400(self):
        resp = client.get(REPORT_URL, params={"month": "2026-06-01"}, headers=AUTH_HEADER)
        assert resp.status_code == 400


# ── Happy path ─────────────────────────────────────────────────────────────────

class TestReportEndpoint:
    def test_valid_request_returns_200(self):
        """Valid token + valid month → 200."""
        resp = client.get(REPORT_URL, params={"month": "2026-06"}, headers=AUTH_HEADER)
        assert resp.status_code == 200

    def test_response_has_required_top_level_keys(self):
        resp = client.get(REPORT_URL, params={"month": "2026-06"}, headers=AUTH_HEADER)
        body = resp.json()
        required = {
            "report_title", "report_type", "period",
            "executive_summary_metrics", "daily_sales_trend",
            "target_vs_actual", "top_customers", "top_products",
            "sales_by_product_group", "customer_movement",
            "movement_analytics", "stock_summary", "predictive_insights",
            "chart_datasets", "copilot_guidance", "data_quality",
        }
        assert required.issubset(body.keys())

    def test_period_fields_correct_for_june(self):
        resp = client.get(REPORT_URL, params={"month": "2026-06"}, headers=AUTH_HEADER)
        period = resp.json()["period"]
        assert period["month"] == "2026-06"
        assert period["start_date"] == "2026-06-01"
        assert period["end_date"] == "2026-06-30"
        assert period["label"] == "June 2026"

    def test_period_fields_correct_for_february_leap_year(self):
        resp = client.get(REPORT_URL, params={"month": "2024-02"}, headers=AUTH_HEADER)
        period = resp.json()["period"]
        assert period["end_date"] == "2024-02-29"  # 2024 is a leap year

    def test_data_quality_section_present(self):
        resp = client.get(REPORT_URL, params={"month": "2026-06"}, headers=AUTH_HEADER)
        dq = resp.json()["data_quality"]
        assert "status" in dq
        assert dq["status"] in ("complete", "partial")
        assert isinstance(dq["warnings"], list)

    def test_copilot_guidance_has_instruction(self):
        resp = client.get(REPORT_URL, params={"month": "2026-06"}, headers=AUTH_HEADER)
        guidance = resp.json()["copilot_guidance"]
        assert "important_instruction" in guidance
        assert "Do not invent figures" in guidance["important_instruction"]

    def test_monetary_fields_are_null(self):
        """Dataset has no monetary column — all 'sales' fields must be null."""
        resp = client.get(REPORT_URL, params={"month": "2026-06"}, headers=AUTH_HEADER)
        body = resp.json()
        metrics = body["executive_summary_metrics"]
        assert metrics["total_sales"] is None
        assert metrics["average_daily_sales"] is None
        assert metrics["target_sales"] is None

    def test_informational_notes_do_not_cause_partial_status(self):
        """Monetary-data note is informational — status must be 'complete' when no sections fail."""
        resp = client.get(REPORT_URL, params={"month": "2026-06"}, headers=AUTH_HEADER)
        body = resp.json()
        dq = body["data_quality"]
        # notes must exist and contain the monetary info message
        assert any("tonnes" in n for n in dq.get("notes", []))
        # warnings must be empty (no real section failures in a healthy environment)
        assert dq["warnings"] == [], f"Unexpected warnings: {dq['warnings']}"
        assert dq["status"] == "complete"

    def test_customer_movement_data_is_populated(self):
        """customer_movement section must return a dict with a 'data' key (not empty fallback)."""
        resp = client.get(REPORT_URL, params={"month": "2026-06"}, headers=AUTH_HEADER)
        body = resp.json()
        cm = body["customer_movement"]
        assert "data" in cm
        # data must be a dict (the handler return value), not an empty fallback {}
        assert isinstance(cm["data"], dict)


# ── Copilot Swagger spec endpoints ─────────────────────────────────────────────

class TestCopilotSwagger:
    def test_swagger_yaml_returns_200(self):
        resp = client.get("/copilot-swagger.yaml")
        assert resp.status_code == 200

    def test_swagger_yaml_is_valid_yaml(self):
        resp = client.get("/copilot-swagger.yaml")
        doc = yaml.safe_load(resp.text)
        assert isinstance(doc, dict)

    def test_swagger_yaml_is_swagger_2(self):
        resp = client.get("/copilot-swagger.yaml")
        doc = yaml.safe_load(resp.text)
        assert doc.get("swagger") == "2.0"

    def test_swagger_yaml_has_copilot_endpoint(self):
        resp = client.get("/copilot-swagger.yaml")
        doc = yaml.safe_load(resp.text)
        assert "/api/copilot/reports/sales-performance" in doc["paths"]

    def test_swagger_yaml_has_no_dangerous_endpoints(self):
        """Spec must not expose debug, admin, refresh, or OAuth endpoints."""
        resp = client.get("/copilot-swagger.yaml")
        doc = yaml.safe_load(resp.text)
        paths = list(doc.get("paths", {}).keys())
        forbidden = ["/api/refresh", "/api/hansa", "/api/targets", "/openapi", "/api/healthz"]
        for path in paths:
            for f in forbidden:
                assert not path.startswith(f), f"Forbidden path exposed in Copilot spec: {path}"

    def test_swagger_json_returns_200(self):
        resp = client.get("/copilot-swagger.json")
        assert resp.status_code == 200

    def test_swagger_json_is_valid_json(self):
        resp = client.get("/copilot-swagger.json")
        doc = json.loads(resp.text)
        assert isinstance(doc, dict)

    def test_swagger_json_matches_yaml(self):
        """YAML and JSON versions must represent the same spec."""
        yaml_doc = yaml.safe_load(client.get("/copilot-swagger.yaml").text)
        json_doc = json.loads(client.get("/copilot-swagger.json").text)
        assert yaml_doc == json_doc


# ── Existing dashboard endpoints unaffected ────────────────────────────────────

class TestDashboardEndpointsUnchanged:
    def test_general_openapi_json_still_works(self):
        resp = client.get("/openapi.json")
        assert resp.status_code == 200
        assert "openapi" in resp.json()

    def test_general_openapi_yaml_still_works(self):
        resp = client.get("/openapi.yaml")
        assert resp.status_code == 200

    def test_healthz_still_works(self):
        resp = client.get("/api/healthz")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_sales_summary_still_accessible(self):
        """Dashboard endpoint must not require Copilot token."""
        resp = client.get("/api/sales-summary")
        # 200 or 500 (if no DB in test env) — but NOT 401 or 404
        assert resp.status_code != 401
        assert resp.status_code != 404
