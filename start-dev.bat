@echo off
echo Starting VeeFore Development Environment (Unified Architecture)...

echo.
echo [1/3] Starting Unified Server (Frontend + Backend on port 5000)...
start "VeeFore Unified Server" cmd /k "cd /d %~dp0 && echo Starting VeeFore Unified Server... && npx tsx server/index.ts"

echo.
echo [2/3] Waiting for server to start...
timeout /t 10 /nobreak > nul

echo.
echo [3/3] Starting Cloudflare Tunnel...
start "Cloudflare Tunnel" cmd /k "cd /d %~dp0 && echo Starting Cloudflare Tunnel... && cloudflared tunnel --config tunnel-config.yml run"

echo.
echo ✅ Development environment started!
echo.
echo Unified Server: http://localhost:5000
echo Tunnel: https://veefore-webhook.veefore.com
echo.
echo Press any key to exit...
pause > nul
