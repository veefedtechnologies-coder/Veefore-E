#!/usr/bin/env bash
#
# fix-dev.sh — recover the dev environment when the browser shows
# "App failed to load" with 404s on /node_modules/.vite/deps/chunk-*.js
#
# Root cause this fixes: Vite's optimized dependency cache got out of sync with
# what the browser/edge cached (e.g. after running tests or a production build
# in the same tree), so the app requests dependency chunks that no longer exist.
#
# What it does:
#   1. Stops any running dev server on port 3000.
#   2. Deletes the stale Vite optimize caches (root + client).
#   3. Restarts the dev server (which re-optimizes deps cleanly).
#
# After running this, clear the BROWSER side once by visiting:
#   https://app.veefore.com/reset.html   (or http://localhost:3000/reset.html)
# which unregisters service workers and wipes caches, then reloads fresh.
#
# Usage:  bash scripts/fix-dev.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "▶ Stopping any dev server (tsx watch / port 3000)…"
pkill -f "tsx watch" 2>/dev/null || true
pkill -f "cross-env NODE_ENV=development tsx" 2>/dev/null || true
# Free port 3000 if something is still holding it.
if lsof -ti:3000 >/dev/null 2>&1; then
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
fi
sleep 2

echo "▶ Clearing stale Vite dependency caches…"
rm -rf node_modules/.vite client/node_modules/.vite 2>/dev/null || true

echo "▶ Restarting dev server (re-optimizing deps)…"
echo "  Run this in its own terminal if you want to keep it in the foreground:"
echo "    npm run dev"
echo ""
echo "✅ Caches cleared and old server stopped."
echo "   1) Start the server:   npm run dev"
echo "   2) In the browser open: /reset.html  (once) to clear SW + caches."
