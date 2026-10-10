@echo off
rem Deploys or updates AIdea on the production IIS server. deploy-production.ps1
rem asks for administrator rights (UAC) itself. Arguments are passed through, e.g.
rem   deploy-production.cmd -Package D:\drop\aidea-iis-20261009-1700.zip
rem   deploy-production.cmd -Rollback
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-production.ps1" %*
set "rc=%errorlevel%"
rem Keep the window open when started by double-click.
echo %cmdcmdline% | find /i "/c" >nul && pause
exit /b %rc%
