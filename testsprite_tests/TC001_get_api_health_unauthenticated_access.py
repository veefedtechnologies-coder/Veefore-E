import requests

BASE_URL = "http://localhost:3000"

def test_tc001_get_api_health_unauthenticated_access():
    url = f"{BASE_URL}/api/health"
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
    except requests.RequestException as e:
        assert False, f"Request to {url} failed: {e}"
    else:
        assert response.status_code == 200, f"Expected 200 OK, got {response.status_code}"
        json_data = response.json()
        assert isinstance(json_data, dict), "Response is not a JSON object"
        assert "status" in json_data, "'status' field missing in response"
        assert isinstance(json_data["status"], str), "'status' field is not a string"
        assert "timestamp" in json_data, "'timestamp' field missing in response"
        assert isinstance(json_data["timestamp"], str), "'timestamp' field is not a string"

test_tc001_get_api_health_unauthenticated_access()