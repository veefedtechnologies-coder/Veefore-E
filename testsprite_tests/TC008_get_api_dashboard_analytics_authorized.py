import requests

def test_tc008_get_api_dashboard_analytics_authorized():
    base_url = "http://localhost:3000"
    endpoint = "/api/dashboard/analytics"
    workspace_id = "686d91be22c4290df81af016"
    token = ("eyJhbGciOiJSUzI1NiIsImtpZCI6ImVlOTA0NmVhZDJlMDUwMDAxMGVkNTA0M2I0ODNkODRiMGM1MmM3YzQiLCJ0eXAiOiJKV1QifQ."
             "eyJlbWFpbCI6ImNob3VkaGFyeWFycGl0OTc3QGdtYWlsLmNvbSIsImVtYWlsVmVyaWZpZWQiOnRydWUsImdvb2dsZUlkIjoiMTAz"
             "OTAxOTkxMTUxNzg2OTc3MTQ0Iiwic2Vzc2lvblZlcnNpb24iOjEsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNv"
             "bS92ZWVmb3JlLTg0MzMiLCJhdWQiOiJ2ZWVmb3JlLTg0MzMiLCJhdXRoX3RpbWUiOjE3ODE2MjQ1NDQsInVzZXJfaWQiOiI2ODQ0"
             "MDI3NDI2Y2FlMDIwMGY4OGI1ZGIiLCJzdWIiOiI2ODQ0MDI3NDI2Y2FlMDIwMGY4OGI1ZGIiLCJpYXQiOjE3ODE3ODE4MTUsImV4"
             "cCI6MTc4MTc4NTQxNSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6e30sInNpZ25faW5fcHJvdmlkZXIiOiJjdXN0b20ifX0.G5QCjp"
             "YZEv7g3aU0t9SHUO8I5XQmbUgXRYzoYf1aE9Kh9Fk2TYq5XPolJDq690nkMbmTmw0dYBIBJWja7M23BNh4Ku55I9_czfNac_QVK96"
             "lO9bfcvGYo0kwdLVUOwz-c0JwObGZ95eP9gp9EvJ7tDvrLeZKKlnQroUKA4p3ruzSYBsQDmtmZgOAJVfmiqnT-m2R9zCxduSwvZO4"
             "OciTnDa_yhW3ovCPL9hqYnOMm0BFoTd5-ruisQOZ1wk2nYRuFctZyz9SARcPyKGzvc9SEX5GXWZeFSC-WyIKW15AgesCTZm0GvOKT4q"
             "qgseBYOmfJyCeQtnSQc0w10GFR6JcNA")

    headers = {
        "Authorization": f"Bearer {token}"
    }
    params = {
        "workspaceId": workspace_id
    }
    try:
        response = requests.get(f"{base_url}{endpoint}", headers=headers, params=params, timeout=30)
        assert response.status_code == 200, f"Expected status 200 but got {response.status_code}"
        response_json = response.json()

        # Validate presence of keys
        assert "followers" in response_json, "Response JSON missing 'followers'"
        assert "posts" in response_json, "Response JSON missing 'posts'"
        assert "engagement" in response_json, "Response JSON missing 'engagement'"

        # Validate types are numeric
        assert isinstance(response_json["followers"], (int, float)), "'followers' is not a number"
        assert isinstance(response_json["posts"], (int, float)), "'posts' is not a number"
        assert isinstance(response_json["engagement"], (int, float)), "'engagement' is not a number"
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

test_tc008_get_api_dashboard_analytics_authorized()