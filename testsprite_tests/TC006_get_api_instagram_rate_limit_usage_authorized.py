import requests

def test_get_api_instagram_rate_limit_usage_authorized():
    base_url = "http://localhost:3000"
    endpoint = "/api/instagram/rate-limit-usage"
    workspace_id = "686d91be22c4290df81af016"
    token = ("eyJhbGciOiJSUzI1NiIsImtpZCI6ImVlOTA0NmVhZDJlMDUwMDAxMGVkNTA0M2I0ODNkODRi"
             "MGM1MmM3YzQiLCJ0eXAiOiJKV1QifQ.eyJlbWFpbCI6ImNob3VkaGFyeWFycGl0OTc3QGdtYWls"
             "LmNvbSIsImVtYWlsVmVyaWZpZWQiOnRydWUsImdvb2dsZUlkIjoiMTAzOTAxOTkxMTUxNzg2OTc3"
             "MTQ0Iiwic2Vzc2lvblZlcnNpb24iOjEsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xl"
             "LmNvbS92ZWVmb3JlLTg0MzMiLCJhdWQiOiJ2ZWVmb3JlLTg0MzMiLCJhdXRoX3RpbWUiOjE3ODE2"
             "MjQ1NDQsInVzZXJfaWQiOiI2ODQ0MDI3NDI2Y2FlMDIwMGY4OGI1ZGIiLCJzdWIiOiI2ODQ0MDI3"
             "NDI2Y2FlMDIwMGY4OGI1ZGIiLCJpYXQiOjE3ODE3ODE4MTUsImV4cCI6MTc4MTc4NTQxNSwiZmly"
             "ZWJhc2UiOnsiaWRlbnRpdGllcyI6e30sInNpZ25faW5fcHJvdmlkZXIiOiJjdXN0b20ifX0.G5QC"
             "jpYZEv7g3aU0t9SHUO8I5XQmbUgXRYzoYf1aE9Kh9Fk2TYq5XPolJDq690nkMbmTmw0dYBIBJWja"
             "7M23BNh4Ku55I9_czfNac_QVK96lO9bfcvGYo0kwdLVUOwz-c0JwObGZ95eP9gp9EvJ7tDvrLeZK"
             "KlnQroUKA4p3ruzSYBsQDmtmZgOAJVfmiqnT-m2R9zCxduSwvZO4OciTnDa_yhW3ovCPL9hqYnOM"
             "m0BFoTd5-ruisQOZ1wk2nYRuFctZyz9SARcPyKGzvc9SEX5GXWZeFSC-WyIKW15AgesCTZm0GvOK"
             "T4qqgseBYOmfJyCeQtnSQc0w10GFR6JcNA")

    headers = {
        "Authorization": f"Bearer {token}"
    }
    params = {
        "workspaceId": workspace_id
    }
    try:
        response = requests.get(f"{base_url}{endpoint}", headers=headers, params=params, timeout=30)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    assert response.status_code == 200, f"Expected status code 200 but got {response.status_code}"
    
    try:
        data = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    assert "tier" in data, "Response JSON missing 'tier'"
    assert isinstance(data["tier"], str), "'tier' should be a string"
    assert "percentage" in data, "Response JSON missing 'percentage'"
    assert isinstance(data["percentage"], (int, float)), "'percentage' should be a number"
    assert 0 <= data["percentage"] <= 100, "'percentage' should be between 0 and 100"

test_get_api_instagram_rate_limit_usage_authorized()