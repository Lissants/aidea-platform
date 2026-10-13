@echo off
rem Rebuilds AIdea and copies it to the production server (C:\aidea\drop), ready
rem to deploy there with DEPLOY-LATEST.cmd. Arguments are passed through, e.g.
rem   deploy\iis\publish-to-server.cmd -SkipChecks
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish-to-server.ps1" %*
set "rc=%errorlevel%"
rem Keep the window open when started by double-click.
echo %cmdcmdline% | find /i "/c" >nul && pause
exit /b %rc%
