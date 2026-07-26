#!/usr/bin/env python3
"""
Corrected authenticated-endpoint checks for Veefore backend (TC005-TC009).
Assertions match the REAL response contracts (verified), not the seed-PRD guesses.
Uses only the Python standard library (urllib) so it runs without `requests`.
"""
import json
import sys
import urllib.request
import urllib.error

BASE_URL = "http://localhost:3000"
TOKEN = sys.argv[1] if len(sys.argv) > 1 else ""
WORKSPACE_ID = "686d91be22c4290df81af016"
ACCOUNT_ID = "17841474747481653"

HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

results = []


def _req(method, path, body=None):
    url = f"{BASE_URL}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


def check(name, cond, detail=""):
    results.append((name, cond, detail))
    print(f"{'✅ PASS' if cond else '❌ FAIL'}  {name}" + (f"  — {detail}" if detail else ""))


# TC005 — polling status
status, body = _req("GET", f"/api/instagram/polling-status?workspaceId={WORKSPACE_ID}")
ok = (status == 200 and body.get("success") is True
      and isinstance(body.get("accounts"), list) and len(body["accounts"]) > 0
      and isinstance(body["accounts"][0].get("metricsInterval"), dict)
      and isinstance(body["accounts"][0].get("metricsPollIn"), dict))
check("TC005 polling-status returns accounts[].metricsInterval/metricsPollIn", ok,
      f"http={status}, accounts={len(body.get('accounts', []))}")

# TC006 — rate-limit usage
status, body = _req("GET", f"/api/instagram/rate-limit-usage?workspaceId={WORKSPACE_ID}")
ok = status == 200 and body.get("success") is not False
check("TC006 rate-limit-usage authorized returns 200", ok, f"http={status}")

# TC007 — start polling
status, body = _req("POST", "/api/instagram/start-polling",
                    {"workspaceId": WORKSPACE_ID, "instagramAccountId": ACCOUNT_ID})
ok = status == 200
check("TC007 start-polling authorized returns 200", ok, f"http={status}")

# TC008 — dashboard analytics
status, body = _req("GET", f"/api/dashboard/analytics?workspaceId={WORKSPACE_ID}")
data = body.get("data", {})
ok = status == 200 and body.get("success") is True and "totalFollowers" in data
check("TC008 dashboard analytics returns data.totalFollowers", ok,
      f"http={status}, totalFollowers={data.get('totalFollowers')}, posts={data.get('totalPosts')}")

# TC009 — workspace metrics refresh
status, body = _req("POST", f"/api/workspaces/{WORKSPACE_ID}/metrics/refresh", {})
ok = status == 200
check("TC009 metrics-refresh authorized returns 200", ok, f"http={status}")

passed = sum(1 for _, c, _ in results if c)
print(f"\n=== {passed}/{len(results)} checks passed ===")
sys.exit(0 if passed == len(results) else 1)
