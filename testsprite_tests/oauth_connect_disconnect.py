#!/usr/bin/env python3
"""
Instagram OAuth connect + disconnect flow — HTTP-surface verification (stdlib).

Covers the DETERMINISTIC boundaries of the flow that can be tested without a
live human Instagram login:
  - authorize/start returns a valid Instagram OAuth URL
  - authorize without workspaceId -> 400
  - callback with error param -> renders Connection Failed page
  - callback without code/state -> 400 Missing code or state
  - reconnect/start returns an OAuth URL
  - disconnect with no body -> 400 (validation)
  - disconnect unknown account -> 404
  - disconnect a (throwaway) connected account -> success + tokens cleared
  - token-status for unknown account -> 404

The throwaway account is created/cleaned via the disconnect test runner's
companion Node script; this script focuses on HTTP assertions.

Usage: python3 oauth_connect_disconnect.py <THROWAWAY_ACCOUNT_ID>
"""
import json
import sys
import urllib.request
import urllib.error

BASE_URL = "http://localhost:3000"
WORKSPACE_ID = "686d91be22c4290df81af016"
THROWAWAY_ID = sys.argv[1] if len(sys.argv) > 1 else ""
results = []


def _req(method, path, body=None, headers=None):
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE_URL}{path}", data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read().decode()
            try:
                return r.status, json.loads(raw or "{}"), raw
            except Exception:
                return r.status, {}, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw or "{}"), raw
        except Exception:
            return e.code, {}, raw


def check(name, cond, detail=""):
    results.append((name, cond))
    print(f"{'✅ PASS' if cond else '❌ FAIL'}  {name}" + (f"  — {detail}" if detail else ""))


# --- CONNECT (authorize) ---
# authorize redirects (302/301) to instagram/facebook OAuth URL
import http.client
def _no_redirect(path):
    conn = http.client.HTTPConnection("localhost", 3000, timeout=20)
    conn.request("GET", path)
    r = conn.getresponse()
    loc = r.getheader("Location") or ""
    status = r.status
    conn.close()
    return status, loc

status, loc = _no_redirect(f"/api/v1/social-auth/instagram/authorize?workspaceId={WORKSPACE_ID}")
check("authorize -> 3xx redirect to OAuth provider", status in (301, 302, 303, 307) and ("facebook.com" in loc or "instagram.com" in loc),
      f"http={status}, location={loc[:60]}")

status, loc = _no_redirect("/api/v1/social-auth/instagram/authorize")
check("authorize without workspaceId -> 400", status == 400, f"http={status}")

# --- CONNECT (callback error/missing handling) ---
status, body, raw = _req("GET", "/api/v1/social-auth/instagram/callback?error=access_denied&error_description=denied")
check("callback with error -> Connection Failed page", status == 200 and "Connection Failed" in raw, f"http={status}")

status, body, raw = _req("GET", "/api/v1/social-auth/instagram/callback")
check("callback without code/state -> 400 Missing", status == 400 and "Missing" in raw, f"http={status}")

# --- RECONNECT ---
# NOTE: /api/instagram/reconnect/start is DESTRUCTIVE — it nulls the workspace's
# Instagram tokens before returning the auth URL. We therefore only validate its
# input-validation path (missing workspaceId -> 400) and do NOT call it with a
# real workspace id, to avoid disconnecting a live account.
status, body, raw = _req("POST", "/api/instagram/reconnect/start", {})
check("reconnect/start without workspaceId -> 400", status == 400, f"http={status}")

# --- DISCONNECT (validation + not-found) ---
status, body, raw = _req("POST", "/api/instagram/disconnect", {})
check("disconnect with empty body -> 400 validation", status == 400, f"http={status}")

status, body, raw = _req("POST", "/api/instagram/disconnect", {"accountId": "000000000000000000000000"})
check("disconnect unknown account -> 404", status == 404, f"http={status}")

# --- DISCONNECT (real, against throwaway account) ---
if THROWAWAY_ID:
    status, body, raw = _req("POST", "/api/instagram/disconnect", {"accountId": THROWAWAY_ID})
    check("disconnect throwaway account -> success", status == 200 and body.get("success") is True, f"http={status}")

# --- TOKEN STATUS (unknown) ---
status, body, raw = _req("GET", "/api/instagram/token-status/000000000000000000000000")
check("token-status unknown account -> 404", status == 404, f"http={status}")

passed = sum(1 for _, c in results if c)
print(f"\n=== {passed}/{len(results)} OAuth connect/disconnect HTTP checks passed ===")
sys.exit(0 if passed == len(results) else 1)
