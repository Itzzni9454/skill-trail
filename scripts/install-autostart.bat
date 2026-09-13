@echo off
setlocal enabledelayedexpansion
title Setup Roadmap Desktop & Autostart

echo ========================================================
echo   Roadmap, Habitica ^& Google Calendar Desktop Setup
echo ========================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."

echo [1/3] Verifying frontend production build...
if not exist "%ROOT_DIR%\app\dist\index.html" (
    echo Building latest frontend bundle...
    cd /d "%ROOT_DIR%\app"
    call npm run build
    if %errorlevel% neq 0 (
        echo [ERROR] Frontend build failed.
        pause
        exit /b 1
    )
) else (
    echo Frontend build found in app\dist.
)

echo.
echo [2/3] Installing Windows Autostart and Desktop Shortcuts...
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%create-shortcuts.ps1"

echo.
echo ========================================================
echo   SETUP COMPLETE!
echo.
echo   - Background Service will auto-start every time PC boots.
echo   - Click 'Roadmap App' on your Desktop to open anytime.
echo   - Starting the background service now...
echo ========================================================

wscript "%VBS_STARTUP%"

echo.
echo Done! You can now launch Roadmap App from your Desktop.
timeout /t 5 >nul
