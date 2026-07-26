import requests

def test_get_api_instagram_polling_status_authorized():
    base_url = "http://localhost:3000"
    endpoint = "/api/instagram/polling-status"
    workspace_id = "686d91be22c4290df81af016"
    token = "eyJhbGciOiJSUzI1NiIsImtpZCI6ImVlOTA0NmVhZDJlMDUwMDAxMGVkNTA0M2I0ODNkODRiMGM1MmM3YzQiLCJ0eXAiOiJKV1QifQ.eyJlbWFpbCI6ImNob3VkaGFyeWFycGl0OTc3QGdtYWlsLmNvbSIsImVtYWlsVmVyaWZpZWQiOnRydWUsImdvb2dsZUlkIjoiMTAzOTAxOTkxMTUxNzg2OTc3MTQ0Iiwic2Vzc2lvblZlcnNpb24iOjEsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS92ZWVmb3JlLTg0MzMiLCJhdWQiOiJ2ZWVmb3JlLTg0MzMiLCJhdXRoX3RpbWUiOjE3ODE2MjQ1NDQsInVzZXJfaWQiOiI2ODQ0MDI3NDI2Y2FlMDIwMGY4OGI1ZGIiLCJzdWIiOiI2ODQ0MDI3NDI2Y2FlMDIwMGY4OGI1ZGIiLCJpYXQiOjE3ODE3ODI5NTgsImV4cCI6MTc4MTc4NjU1OCwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6e30sInNpZ25faW5fcHJvdmlkZXIiOiJjdXN0b20ifX0.q_B3O9sSQpENJlfiQuzo1kmYqUlnRlFiloHxzWfO0od1Eb5KL6fZzil7X-e2F9CRqHuPxJUxjlaN9AgqnRYjY3LGhBx3XFlN9XPjxg77ZsDjrr4RcXdEfbddVmQLvk_A9e16jAD21EvQ-y4vnipFJFk0f3FVbyATLsJoBXAbPJ7fB9oMWb6J7b7-6IxgbuPalvvIpbu_frEKDbWSjIvpux8jEbO-ksbAieOVI4Wqdtm7Cm5IPE3Wm5zHPh43QsiHrXwYad8FVmCpSSfT217WALENivtPr2PVH-XQ1rkrTxkrc0b4fyFEbz4y4hELKZ-RKlkUBrakVz1_tpLpluYAOQ"

    headers = {
        "Authorization": f"Bearer {token}"
    }
    params = {
        "workspaceId": workspace_id
    }

    try:
        response = requests.get(
            url=f"{base_url}{endpoint}",
            headers=headers,
            params=params,
            timeout=30
        )
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    assert response.status_code == 200, f"Expected status 200, got {response.status_code}"
    try:
        data = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    assert "timers" in data, "Response JSON missing 'timers'"
    assert isinstance(data["timers"], dict), "'timers' is not a dict"
    assert "metricsInterval" in data, "Response JSON missing 'metricsInterval'"
    assert isinstance(data["metricsInterval"], (int, float)), "'metricsInterval' is not a number"

test_get_api_instagram_polling_status_authorized()