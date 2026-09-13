$ws = New-Object -ComObject WScript.Shell
$startup = [Environment]::GetFolderPath('Startup')
$desktop = [Environment]::GetFolderPath('Desktop')
$rootDir = (Get-Item $PSScriptRoot).Parent.FullName

# 1. Startup Shortcut
$lnkStartup = Join-Path $startup "RoadmapBackgroundService.lnk"
$s1 = $ws.CreateShortcut($lnkStartup)
$s1.TargetPath = "wscript.exe"
$s1.Arguments = "`"$rootDir\scripts\start-background.vbs`""
$s1.WorkingDirectory = "$rootDir\server"
$s1.Description = "Roadmap & Habitica 2-Way Sync Background Service"
$s1.Save()

# 2. Desktop Shortcut
$lnkDesktop = Join-Path $desktop "Roadmap App.lnk"
$s2 = $ws.CreateShortcut($lnkDesktop)
$s2.TargetPath = "wscript.exe"
$s2.Arguments = "`"$rootDir\scripts\open-app.vbs`""
$s2.WorkingDirectory = "$rootDir"
$s2.Description = "Launch Roadmap & Habitica Standalone App"
$s2.Save()

Write-Output "Startup shortcut created: $lnkStartup"
Write-Output "Desktop shortcut created: $lnkDesktop"
