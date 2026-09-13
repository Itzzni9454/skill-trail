@echo off
setlocal
echo ========================================================
echo   Stopping Roadmap ^& Habitica Background Server...
echo ========================================================

set FOUND=0
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":4177" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    set FOUND=1
)

if "%FOUND%"=="1" (
    echo [OK] Background server on port 4177 was stopped.
) else (
    echo [*] No running server found on port 4177.
)

echo.
pause
