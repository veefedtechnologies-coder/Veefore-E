import requests

def test_post_api_instagram_disconnect_valid_request():
    base_url = "http://localhost:3000"
    endpoint = "/api/instagram/disconnect"
    url = f"{base_url}{endpoint}"

    # Sample valid accountId and workspaceId for testing
    # In real scenarios, these should be valid existing resources in the test environment.
    account_id = "validAccountId123"
    workspace_id = "validWorkspaceId123"

    headers = {
        "Content-Type": "application/json"
    }
    payload = {
        "accountId": account_id,
        "workspaceId": workspace_id
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        assert False, f"Request to {url} failed with exception: {e}"

    try:
        json_resp = response.json()
    except ValueError:
        assert False, "Response is not a valid JSON"

    assert response.status_code == 200, f"Expected status code 200, got {response.status_code}"
    assert "success" in json_resp, "Response JSON does not contain 'success' key"
    assert isinstance(json_resp["success"], bool), "'success' key is not boolean"
    assert json_resp["success"] is True, "Expected 'success' to be True"
    
test_post_api_instagram_disconnect_valid_request()