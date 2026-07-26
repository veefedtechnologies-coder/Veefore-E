import requests

def test_post_api_instagram_start_polling_authorized():
    base_url = "http://localhost:3000"
    endpoint = "/api/instagram/start-polling"
    token = ("eyJhbGciOiJSUzI1NiIsImtpZCI6ImVlOTA0NmVhZDJlMDUwMDAxMGVkNTA0M2I0ODNkODRiMGM1MmM3"
             "YzQiLCJ0eXAiOiJKV1QifQ.eyJlbWFpbCI6ImNob3VkaGFyeWFycGl0OTc3QGdtYWlsLmNvbSIs"
             "ImVtYWlsVmVyaWZpZWQiOnRydWUsImdvb2dsZUlkIjoiMTAzOTAxOTkxMTUxNzg2OTc3MTQ0Iiwic2Vzc2lvblZlcnNpb24iOjEsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS92ZWVmb3JlLTg0MzMiLCJhdWQiOiJ2ZWVmb3JlLTg0MzMiLCJhdXRoX3RpbWUiOjE3ODE2MjQ1NDQsInVzZXJfaWQiOiI2ODQ0MDI3NDI2Y2FlMDIwMGY4OGI1ZGIiLCJzdWIiOiI2ODQ0MDI3NDI2Y2FlMDIwMGY4OGI1ZGIiLCJpYXQiOjE3ODE3ODE4MTUsImV4cCI6MTc4MTc4NTQxNSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6e30sInNpZ25faW5fcHJvdmlkZXIiOiJjdXN0b20ifX0.G5QCjpYZEv7g3aU0t9SHUO8I5XQmbUgXRYzoYf1aE9Kh9Fk2TYq5XPolJDq690nkMbmTmw0dYBIBJWja7M23BNh4Ku55I9_czfNac_QVK96lO9bfcvGYo0kwdLVUOwz-c0JwObGZ95eP9gp9EvJ7tDvrLeZKKlnQroUKA4p3ruzSYBsQDmtmZgOAJVfmiqnT-m2R9zCxduSwvZO4OciTnDa_yhW3ovCPL9hqYnOMm0BFoTd5-ruisQOZ1wk2nYRuFctZyz9SARcPyKGzvc9SEX5GXWZeFSC-WyIKW15AgesCTZm0GvOKT4qqgseBYOmfJyCeQtnSQc0w10GFR6JcNA")
    workspace_id = "686d91be22c4290df81af016"

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    json_data = {
        "workspaceId": workspace_id
    }

    # POST to start polling
    response = requests.post(
        base_url + endpoint,
        headers=headers,
        json=json_data,
        timeout=30
    )

    assert response.status_code == 200, f"Expected status 200 but got {response.status_code}"
    body = response.json()
    assert isinstance(body, dict), "Response is not JSON object"
    assert body.get("success") is True, "Response 'success' field is not True"

    # Verify polling timers updated by GET polling-status
    get_endpoint = "/api/instagram/polling-status"
    params = {"workspaceId": workspace_id}
    get_response = requests.get(
        base_url + get_endpoint,
        headers={"Authorization": f"Bearer {token}"},
        params=params,
        timeout=30
    )
    assert get_response.status_code == 200, f"Expected status 200 but got {get_response.status_code}"
    get_body = get_response.json()
    assert isinstance(get_body, dict), "Polling status response is not JSON object"
    assert "timers" in get_body and isinstance(get_body["timers"], dict), "Missing or invalid 'timers' in polling status"
    assert "metricsInterval" in get_body and isinstance(get_body["metricsInterval"], (int, float)), "Missing or invalid 'metricsInterval' in polling status"

test_post_api_instagram_start_polling_authorized()