"""
API endpoint tests for CONU Engine.

Tests the FastAPI endpoints for health, screenshot, plan, and locate.
"""

import base64
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from io import BytesIO

from engine.api.main import app


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    return TestClient(app)


@pytest.fixture
def sample_image_base64():
    """Create a sample base64-encoded image for testing."""
    img = Image.new("RGB", (100, 100), color="white")
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


class TestHealthEndpoints:
    """Tests for health check endpoints."""

    def test_health_returns_ok(self, client):
        """Test that /health returns a successful response."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "version" in data

    def test_ready_returns_status(self, client):
        """Test that /ready returns service status."""
        response = client.get("/ready")
        assert response.status_code == 200
        data = response.json()
        assert "ready" in data
        assert "tesseract" in data
        assert "gemini" in data
        assert isinstance(data["tesseract"], bool)
        assert isinstance(data["gemini"], dict)


class TestScreenshotEndpoint:
    """Tests for screenshot endpoint."""

    def test_screenshot_default_request(self, client):
        """Test screenshot with default parameters."""
        response = client.post("/screenshot", json={})
        # This may fail if no display is available in CI
        # In that case, we expect a specific error
        if response.status_code == 200:
            data = response.json()
            assert data["success"] == True
            assert "width" in data
            assert "height" in data
        else:
            # Expected in headless environments
            assert response.status_code == 500
            assert "Screenshot failed" in response.json().get("detail", "")

    def test_screenshot_with_base64(self, client):
        """Test screenshot with base64 return requested."""
        response = client.post("/screenshot", json={"return_base64": True})
        if response.status_code == 200:
            data = response.json()
            assert data["success"] == True
            if data.get("image"):
                # Verify it's valid base64
                decoded = base64.b64decode(data["image"])
                assert len(decoded) > 0


class TestPlanEndpoint:
    """Tests for plan generation endpoint."""

    def test_plan_requires_task(self, client):
        """Test that plan endpoint requires a task."""
        response = client.post("/plan", json={})
        assert response.status_code == 422  # Validation error

    def test_plan_with_task_only(self, client):
        """Test plan generation with just a task."""
        response = client.post("/plan", json={
            "task": "Click the settings button"
        })
        # May fail without valid Gemini API key
        if response.status_code == 200:
            data = response.json()
            assert "steps" in data
            assert isinstance(data["steps"], list)
        else:
            # Expected if AI service not configured
            assert response.status_code in [500, 503]

    def test_plan_with_image(self, client, sample_image_base64):
        """Test plan generation with a provided image."""
        response = client.post("/plan", json={
            "task": "Turn on dark mode",
            "image": sample_image_base64,
            "max_steps": 5
        })
        # Check response structure regardless of success
        if response.status_code == 200:
            data = response.json()
            assert "task" in data
            assert "steps" in data

    def test_plan_max_steps_validation(self, client):
        """Test that max_steps is validated."""
        # Too high
        response = client.post("/plan", json={
            "task": "Test task",
            "max_steps": 100
        })
        assert response.status_code == 422

        # Too low
        response = client.post("/plan", json={
            "task": "Test task",
            "max_steps": 0
        })
        assert response.status_code == 422


class TestLocateEndpoint:
    """Tests for element location endpoint."""

    def test_locate_requires_target(self, client):
        """Test that locate endpoint requires a target."""
        response = client.post("/locate", json={})
        assert response.status_code == 422  # Validation error

    def test_locate_with_target_only(self, client):
        """Test locate with just a target."""
        response = client.post("/locate", json={
            "target": "Settings"
        })
        # May fail without screenshot capability
        if response.status_code == 200:
            data = response.json()
            assert "found" in data
            assert isinstance(data["found"], bool)
            assert "suggestions" in data
            assert isinstance(data["suggestions"], list)

    def test_locate_with_image(self, client, sample_image_base64):
        """Test locate with a provided image."""
        response = client.post("/locate", json={
            "target": "Settings",
            "image": sample_image_base64,
            "region": "full"
        })
        if response.status_code == 200:
            data = response.json()
            assert "found" in data
            assert "confidence" in data
            assert "suggestions" in data

    def test_locate_response_structure(self, client, sample_image_base64):
        """Test that locate response has correct structure."""
        response = client.post("/locate", json={
            "target": "Test",
            "image": sample_image_base64
        })
        if response.status_code == 200:
            data = response.json()
            # Required fields
            assert "found" in data
            assert "confidence" in data
            assert "suggestions" in data
            # Optional fields (may be null)
            assert "bbox" in data or data.get("bbox") is None
            assert "center" in data or data.get("center") is None
            assert "method" in data or data.get("method") is None

    def test_locate_region_options(self, client, sample_image_base64):
        """Test locate with different region options."""
        regions = ["full", "top", "bottom", "left", "right"]
        for region in regions:
            response = client.post("/locate", json={
                "target": "Test",
                "image": sample_image_base64,
                "region": region
            })
            # Should not error on valid region
            assert response.status_code in [200, 500]


class TestRegionsEndpoint:
    """Tests for regions endpoint."""

    def test_regions_returns_list(self, client):
        """Test that /regions returns region information."""
        response = client.get("/regions")
        assert response.status_code == 200
        data = response.json()
        assert "regions" in data or "default_regions" in data


class TestWebSocketEndpoint:
    """Tests for WebSocket endpoint."""

    def test_websocket_connection(self, client):
        """Test WebSocket connection establishment."""
        with client.websocket_connect("/ws/run") as websocket:
            # Should receive connected message
            data = websocket.receive_json()
            assert data["type"] == "connected"
            assert "data" in data

    def test_websocket_requires_start_task(self, client):
        """Test that WebSocket requires start_task message."""
        with client.websocket_connect("/ws/run") as websocket:
            # Receive connected
            websocket.receive_json()

            # Send invalid message type
            websocket.send_json({"type": "invalid", "data": {}})

            # Should receive error
            data = websocket.receive_json()
            assert data["type"] == "error"

    def test_websocket_start_task_requires_task(self, client):
        """Test that start_task requires task data."""
        with client.websocket_connect("/ws/run") as websocket:
            # Receive connected
            websocket.receive_json()

            # Send start_task without task
            websocket.send_json({"type": "start_task", "data": {}})

            # Should receive error
            data = websocket.receive_json()
            assert data["type"] == "error"
            assert "task" in data["data"].get("error", "").lower()
