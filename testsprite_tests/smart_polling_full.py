#!/usr/bin/env python3
"""
Complete smart-polling HTTP-surface verification (TestSprite-style, stdlib only).

Validates not just status codes but the ACTUAL cadence values returned by
/api/instagram/polling-status against the smart-polling design:
  - newPosts detection : 3h   (10800000 ms)
  - reach / views      : 4h   (14400000 ms)
  - followers          : 5h   (18000000 ms)
  - likes/shares/saves : 48h  (172800000 ms)  [post insights]
Also checks start-polling and rate-limit-usage.

Usage: python3 smart_polling_full.py <FIREBASE_BEARER_TOKEN>
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

HOUR = 3600000
EXPECTED = {
    "newPosts": 3 * HOUR,
    "reach": 4 * HOUR,
    "views": 4 * HOUR,
    "profile_views": 4 * HOUR,
    "followers": 5 * HOUR,
    "likes": 48 * HOUR,
    "shares": 48 * HOUR,
    "saves": 48 * HOUR,
}
results = []


def _req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE_URL}{path}", data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


def check(name, cond, detail=""):
    results.append((name, cond))
    print(f"{'✅ PASS' if cond else '❌ FAIL'}  {name}" + (f"  — {detail}" if detail else ""))


# 1) polling-status authorized + shape
status, body = _req("GET", f"/api/instagram/polling-status?workspaceId={WORKSPACE_ID}")
check("polling-status 200 + success", status == 200 and body.get("success") is True, f"http={status}")
accounts = body.get("accounts", [])
check("polling-status returns >=1 account", len(accounts) >= 1, f"accounts={len(accounts)}")

mi = accounts[0].get("metricsInterval", {}) if accounts else {}

# 2) cadence values match the smart-polling design
for metric, expected_ms in EXPECTED.items():
    actual = mi.get(metric)
    check(f"cadence[{metric}] == {expected_ms}ms ({expected_ms//HOUR}h)",
          actual == expected_ms,
          f"actual={actual}")

# 3) tiering sanity: post insights (48h) > followers (5h) > reach (4h) > newPosts (3h)
ok_order = (mi.get("likes", 0) > mi.get("followers", 0) > mi.get("reach", 0) > mi.get("newPosts", 0))
check("cadence ordering: postInsights > followers > reach > newPosts", ok_order,
      f"likes={mi.get('likes')}, followers={mi.get('followers')}, reach={mi.get('reach')}, newPosts={mi.get('newPosts')}")

# 4) metricsPollIn present (live countdown) for each metric
mp = accounts[0].get("metricsPollIn", {}) if accounts else {}
check("metricsPollIn present for all metrics", set(EXPECTED).issubset(set(mp.keys())),
      f"keys={sorted(mp.keys())}")

# 5) rate-limit-usage authorized
status, body = _req("GET", f"/api/instagram/rate-limit-usage?workspaceId={WORKSPACE_ID}")
check("rate-limit-usage 200", status == 200, f"http={status}")

# 6) start-polling authorized (idempotent schedule)
status, body = _req("POST", "/api/instagram/start-polling",
                    {"workspaceId": WORKSPACE_ID, "instagramAccountId": ACCOUNT_ID})
check("start-polling 200", status == 200, f"http={status}")

# 7) unauthenticated polling-status is rejected
req = urllib.request.Request(f"{BASE_URL}/api/instagram/polling-status?workspaceId={WORKSPACE_ID}", method="GET")
try:
    with urllib.request.urlopen(req, timeout=15) as r:
        code = r.status
except urllib.error.HTTPError as e:
    code = e.code
check("polling-status without token -> 401", code == 401, f"http={code}")

passed = sum(1 for _, c in results if c)
print(f"\n=== {passed}/{len(results)} smart-polling HTTP checks passed ===")
sys.exit(0 if passed == len(results) else 1)
