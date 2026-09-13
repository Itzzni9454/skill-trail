@echo off
setlocal enabledelayedexpansion
pushd "%~dp0"

:: ============================================================
::  Skill Trail - Launcher
:: ============================================================

:menu
cls
echo ================================================
echo   Skill Trail - Launcher
echo ================================================
echo.
echo   [1]  Setup        Install all dependencies
echo   [2]  Build        Build the frontend
echo   [3]  Start        Start server (production) [Default]
echo   [4]  Dev          Start dev mode (with hot reload)
echo   [5]  Update       Check for roadmap updates
echo   [6]  Download     Download new/updated roadmaps
echo   [7]  Open         Open app in browser
echo   [8]  Stop         Stop all servers (ports 4177/5180)
echo   [0]  Exit
echo.
echo ================================================
set "choice="
set /p choice="Select an option (0-8, press Enter for [3] Start): "
if not defined choice set "choice=3"

if "!choice!"=="1" goto setup
if "!choice!"=="2" goto build
if "!choice!"=="3" goto start
if "!choice!"=="4" goto dev
if "!choice!"=="5" goto update
if "!choice!"=="6" goto download
if "!choice!"=="7" goto open
if "!choice!"=="8" goto stop
if "!choice!"=="0" goto quit

echo.
echo Invalid option '!choice!'. Press any key to try again...
pause >nul
goto menu

:quit
popd
exit /b 0

:setup
echo.
echo [1/1] Running npm run setup...
call npm run setup
echo.
echo Done. Press any key to return to menu...
pause >nul
goto menu

:build
echo.
echo [1/1] Running npm run app:build...
call npm run app:build
echo.
echo Done. Press any key to return to menu...
pause >nul
goto menu

:start
echo.
echo Freeing ports 4177/5180 if occupied...
call :killports

if not exist "%~dp0app\dist\index.html" (
    echo.
    echo [Info] App build not found. Building frontend first...
    call npm run app:build
    if errorlevel 1 (
        echo.
        echo [Error] Build failed. Please run Setup first.
        pause
        goto menu
    )
)

echo Starting server on http://localhost:4177 ...
echo Press Ctrl+C in this window to stop the server.
echo.
call npm start
if errorlevel 1 (
    echo.
    echo [Error] Server stopped with an error.
    pause
)
goto menu

:dev
echo.
echo Freeing ports 4177/5180 if occupied...
call :killports
echo Starting in development mode...
echo.
echo [Terminal 1] Starting API server on :4177 ...
start "Roadmap Server" /d "%~dp0server" cmd /k "npm run dev"
echo [Terminal 2] Starting Vite dev server on :5180 ...
start "Vite Dev Server" /d "%~dp0app" cmd /k "npm run dev"
echo.
echo Both servers running. Open http://localhost:5180 in your browser.
echo Close the two server windows to stop them (or use menu option 8).
echo.
echo Press any key to return to menu (servers keep running)...
pause >nul
goto menu

:update
echo.
echo Checking for roadmap updates...
call npm run update
echo.
echo Done. Press any key to return to menu...
pause >nul
goto menu

:download
echo.
echo Downloading new/updated roadmaps...
call npm run update:download
echo.
echo Done. Press any key to return to menu...
pause >nul
goto menu

:open
start http://localhost:4177
echo Opened http://localhost:4177 in browser.
echo.
echo Press any key to return to menu...
pause >nul
goto menu

:stop
echo.
echo Stopping any servers on :4177 and :5180 ...
call :killports
echo Done.
echo.
echo Press any key to return to menu...
pause >nul
goto menu

:: ------------------------------------------------------------
:: Kill any process listening on ports 4177 or 5180
:: ------------------------------------------------------------
:killports
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4177 ^| findstr LISTENING 2^>nul') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5180 ^| findstr LISTENING 2^>nul') do taskkill /F /PID %%a >nul 2>&1
goto :eof
