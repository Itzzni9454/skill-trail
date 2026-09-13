@echo off
setlocal
echo ========================================================
echo   Uninstalling Roadmap Autostart Shortcuts...
echo ========================================================

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if exist "%STARTUP_FOLDER%\RoadmapBackgroundService.lnk" (
    del "%STARTUP_FOLDER%\RoadmapBackgroundService.lnk"
    echo [OK] Removed startup shortcut: %STARTUP_FOLDER%\RoadmapBackgroundService.lnk
) else (
    echo [*] No startup shortcut found.
)

if exist "%USERPROFILE%\Desktop\Roadmap App.lnk" (
    del "%USERPROFILE%\Desktop\Roadmap App.lnk"
    echo [OK] Removed Desktop shortcut: %USERPROFILE%\Desktop\Roadmap App.lnk
) else (
    echo [*] No Desktop shortcut found.
)

echo.
echo Autostart uninstalled successfully.
pause
