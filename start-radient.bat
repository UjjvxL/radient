@echo off
title Radient Music v2
cd /d "%~dp0"

echo ════════════════════════════════════════════
echo   Radient v2 — Spotify Import Engine
echo ════════════════════════════════════════════

:: Check Redis
redis-cli ping >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Redis is not running.
    echo     Install: winget install Memurai.MemuraiDeveloper
    echo     Or download: https://github.com/microsoftarchive/redis/releases
    echo     Then run this script again.
    echo.
    echo     Starting without Redis (queues disabled)...
    echo.
)

echo Starting JioSaavn API (Port 3001)...
start "JioSaavn API" /min cmd /c "cd jiosaavn-api-local && npx tsx --tsconfig tsconfig.json run.ts"

timeout /t 3 /nobreak >nul

echo Starting Radient v2 (Port 3000)...
start "Radient Server" cmd /c "npx tsx src/bootstrap.ts"

timeout /t 5 /nobreak >nul

echo Opening Radient...
start http://localhost:3000

echo.
echo ════════════════════════════════════════════
echo   Radient is running!
echo   App:      http://localhost:3000
echo   JioSaavn: http://localhost:3001
echo ════════════════════════════════════════════
