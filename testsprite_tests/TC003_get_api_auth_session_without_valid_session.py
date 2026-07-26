import requests

def test_get_api_auth_session_without_valid_session():
    base_url = "http://localhost:3000"
    url = f"{base_url}/api/auth/session"
    # Do not send Authorization header to simulate no valid session
    try:
        response = requests.get(url, timeout=30)
        assert response.status_code == 200, f"Expected status 200 but got {response.status_code}"
        json_response = response.json()
        # The response should contain a user key with an unauthenticated or empty payload
        assert "user" in json_response, "Response missing 'user' key"
        user = json_response["user"]
        # User payload should be empty or unauthenticated (e.g. empty dict)
        assert user == {} or user is None, f"Expected empty or unauthenticated user payload but got {user}"
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

test_get_api_auth_session_without_valid_session()