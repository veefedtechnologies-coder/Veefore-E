import requests

def test_post_api_auth_refresh_valid_token():
    base_url = "http://localhost:3000"
    endpoint = "/api/auth/refresh"
    token = ("eyJhbGciOiJSUzI1NiIsImtpZCI6ImVlOTA0NmVhZDJlMDUwMDAxMGVkNTA0M2I0ODNkODRiMGM1MmM3YzQiLCJ0eXAiOiJKV1QifQ."
             "eyJlbWFpbCI6ImNob3VkaGFyeWFycGl0OTc3QGdtYWlsLmNvbSIsImVtYWlsVmVyaWZpZWQiOnRydWUsImdvb2dsZUlkIjoiMTAzOTAxOTkxMTUxNzg2OTc3"
             "MTQ0Iiwic2Vzc2lvblZlcnNpb24iOjEsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS92ZWVmb3JlLTg0MzMiLCJhdWQiOiJ2ZWVmb3Jl"
             "LTg0MzMiLCJhdXRoX3RpbWUiOjE3ODE2MjQ1NDQsInVzZXJfaWQiOiI2ODQ0MDI3NDI2Y2FlMDIwMGY4OGI1ZGIiLCJzdWIiOiI2ODQ0MDI3NDI2Y2FlMDIwM"
             "GY4OGI1ZGIiLCJpYXQiOjE3ODE3ODE4MTUsImV4cCI6MTc4MTc4NTQxNSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6e30sInNpZ25faW5fcHJvdmlkZXIiOiJj"
             "dXN0b20ifX0.G5QCjpYZEv7g3aU0t9SHUO8I5XQmbUgXRYzoYf1aE9Kh9Fk2TYq5XPolJDq690nkMbmTmw0dYBIBJWja7M23BNh4Ku55I9_czfNac_QVK96lO"
             "9bfcvGYo0kwdLVUOwz-c0JwObGZ95eP9gp9EvJ7tDvrLeZKKlnQroUKA4p3ruzSYBsQDmtmZgOAJVfmiqnT-m2R9zCxduSwvZO4OciTnDa_yhW3ovCPL9hqYnOM"
             "m0BFoTd5-ruisQOZ1wk2nYRuFctZyz9SARcPyKGzvc9SEX5GXWZeFSC-WyIKW15AgesCTZm0GvOKT4qqgseBYOmfJyCeQtnSQc0w10GFR6JcNA")

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(
            url=f"{base_url}{endpoint}",
            headers=headers,
            timeout=30
        )
        # Validate status code
        assert response.status_code == 200, f"Expected status 200, got {response.status_code}"
        # Validate response body has 'token' key and token is a non-empty string
        json_data = response.json()
        assert "token" in json_data, "Response JSON does not contain 'token' field"
        refreshed_token = json_data["token"]
        assert isinstance(refreshed_token, str) and len(refreshed_token) > 0, "Token is not a valid non-empty string"
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

test_post_api_auth_refresh_valid_token()