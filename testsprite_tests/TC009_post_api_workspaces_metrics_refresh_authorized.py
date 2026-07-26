import requests

BASE_URL = "http://localhost:3000"
WORKSPACE_ID = "686d91be22c4290df81af016"
BEARER_TOKEN = "eyJhbGciOiJSUzI1NiIsImtpZCI6ImVlOTA0NmVhZDJlMDUwMDAxMGVkNTA0M2I0ODNkODRiMGM1MmM3YzQiLCJ0eXAiOiJKV1QifQ.eyJlbWFpbCI6ImNob3VkaGFyeWFycGl0OTc3QGdtYWlsLmNvbSIsImVtYWlsVmVyaWZpZWQiOnRydWUsImdvb2dsZUlkIjoiMTAzOTAxOTkxMTUxNzg2OTc3MTQ0Iiwic2Vzc2lvblZlcnNpb24iOjEsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS92ZWVmb3JlLTg0MzMiLCJhdWQiOiJ2ZWVmb3JlLTg0MzMiLCJhdXRoX3RpbWUiOjE3ODE2MjQ1NDQsInVzZXJfaWQiOiI2ODQ0MDI3NDI2Y2FlMDIwMGY4OGI1ZGIiLCJzdWIiOiI2ODQ0MDI3NDI2Y2FlMDIwMGY4OGI1ZGIiLCJpYXQiOjE3ODE3ODE4MTUsImV4cCI6MTc4MTc4NTQxNSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6e30sInNpZ25faW5fcHJvdmlkZXIiOiJjdXN0b20ifX0.G5QCjpYZEv7g3aU0t9SHUO8I5XQmbUgXRYzoYf1aE9Kh9Fk2TYq5XPolJDq690nkMbmTmw0dYBIBJWja7M23BNh4Ku55I9_czfNac_QVK96lO9bfcvGYo0kwdLVUOwz-c0JwObGZ95eP9gp9EvJ7tDvrLeZKKlnQroUKA4p3ruzSYBsQDmtmZgOAJVfmiqnT-m2R9zCxduSwvZO4OciTnDa_yhW3ovCPL9hqYnOMm0BFoTd5-ruisQOZ1wk2nYRuFctZyz9SARcPyKGzvc9SEX5GXWZeFSC-WyIKW15AgesCTZm0GvOKT4qqgseBYOmfJyCeQtnSQc0w10GFR6JcNA"

HEADERS = {
    "Authorization": f"Bearer {BEARER_TOKEN}",
    "Content-Type": "application/json"
}

def test_post_workspace_metrics_refresh_authorized():
    # POST /api/workspaces/:workspaceId/metrics/refresh
    refresh_url = f"{BASE_URL}/api/workspaces/{WORKSPACE_ID}/metrics/refresh"
    try:
        refresh_resp = requests.post(refresh_url, headers=HEADERS, timeout=30)
        assert refresh_resp.status_code == 200, f"Expected 200, got {refresh_resp.status_code}"
        json_refresh = refresh_resp.json()
        assert isinstance(json_refresh, dict), "Response is not a JSON object"
        assert "success" in json_refresh, "'success' key not in response"
        assert json_refresh["success"] is True, "Success is not True in refresh response"

        # GET /api/workspaces/:workspaceId/metrics
        metrics_url = f"{BASE_URL}/api/workspaces/{WORKSPACE_ID}/metrics"
        get_resp = requests.get(metrics_url, headers=HEADERS, timeout=30)
        assert get_resp.status_code == 200, f"Expected 200, got {get_resp.status_code}"
        json_metrics = get_resp.json()
        assert isinstance(json_metrics, dict), "Metrics response is not JSON object"
        assert "metrics" in json_metrics, "'metrics' key missing in metrics response"
        assert isinstance(json_metrics["metrics"], dict), "'metrics' value is not an object"

    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

test_post_workspace_metrics_refresh_authorized()