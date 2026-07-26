import requests

def test_post_api_auth_logout_active_session():
    base_url = "http://localhost:3000"
    token = "eyJhbGciOiJSUzI1NiIsImtpZCI6ImVlOTA0NmVhZDJlMDUwMDAxMGVkNTA0M2I0ODNkODRiMGM1MmM3YzQiLCJ0eXAiOiJKV1QifQ.eyJlbWFpbCI6ImNob3VkaGFyeWFycGl0OTc3QGdtYWlsLmNvbSIsImVtYWlsVmVyaWZpZWQiOnRydWUsImdvb2dsZUlkIjoiMTAzOTAxOTkxMTUxNzg2OTc3MTQ0Iiwic2Vzc2lvblZlcnNpb24iOjEsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS92ZWVmb3JlLTg0MzMiLCJhdWQiOiJ2ZWVmb3JlLTg0MzMiLCJhdXRoX3RpbWUiOjE3ODE2MjQ1NDQsInVzZXJfaWQiOiI2ODQ0MDI3NDI2Y2FlMDIwMGY4OGI1ZGIiLCJzdWIiOiI2ODQ0MDI3NDI2Y2FlMDIwMGY4OGI1ZGIiLCJpYXQiOjE3ODE3ODE4MTUsImV4cCI6MTc4MTc4NTQxNSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6e30sInNpZ25faW5fcHJvdmlkZXIiOiJjdXN0b20ifX0.G5QCjpYZEv7g3aU0t9SHUO8I5XQmbUgXRYzoYf1aE9Kh9Fk2TYq5XPolJDq690nkMbmTmw0dYBIBJWja7M23BNh4Ku55I9_czfNac_QVK96lO9bfcvGYo0kwdLVUOwz-c0JwObGZ95eP9gp9EvJ7tDvrLeZKKlnQroUKA4p3ruzSYBsQDmtmZgOAJVfmiqnT-m2R9zCxduSwvZO4OciTnDa_yhW3ovCPL9hqYnOMm0BFoTd5-ruisQOZ1wk2nYRuFctZyz9SARcPyKGzvc9SEX5GXWZeFSC-WyIKW15AgesCTZm0GvOKT4qqgseBYOmfJyCeQtnSQc0w10GFR6JcNA"
    headers_with_auth = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    headers_without_auth = {
        "Content-Type": "application/json"
    }
    timeout = 30

    # POST /api/auth/logout without Authorization header (per PRD, logout does not require auth)
    try:
        logout_response = requests.post(f"{base_url}/api/auth/logout", headers=headers_without_auth, timeout=timeout)
    except requests.RequestException as e:
        assert False, f"POST /api/auth/logout request failed: {e}"

    assert logout_response.status_code == 200, f"Expected status code 200, got {logout_response.status_code}"
    try:
        logout_json = logout_response.json()
    except ValueError:
        assert False, "Response from /api/auth/logout is not valid JSON"

    assert isinstance(logout_json, dict), "Response JSON from /api/auth/logout is not an object"
    assert "success" in logout_json, "Response JSON missing 'success' field"
    assert logout_json["success"] is True, "Logout success field is not True"

    # Subsequent GET /api/auth/session should return unauthenticated session state with Authorization header
    try:
        session_response = requests.get(f"{base_url}/api/auth/session", headers=headers_with_auth, timeout=timeout)
    except requests.RequestException as e:
        assert False, f"GET /api/auth/session request failed: {e}"

    assert session_response.status_code == 200, f"Expected status code 200, got {session_response.status_code}"
    try:
        session_json = session_response.json()
    except ValueError:
        assert False, "Response from /api/auth/session is not valid JSON"

    assert isinstance(session_json, dict), "Response JSON from /api/auth/session is not an object"
    # Per PRD: unauthenticated session state means empty or unauthenticated user payload
    user = session_json.get("user")
    # user could be empty dict or None or otherwise indicate unauthenticated
    if user is None:
        pass
    elif isinstance(user, dict):
        # Check if user object is empty or missing identifying fields
        assert len(user) == 0 or "email" not in user, "User object in session is not unauthenticated"
    else:
        assert False, "User field in session response is not null or an object"

test_post_api_auth_logout_active_session()
