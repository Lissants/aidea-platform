@echo off
rem Installs or updates AIdea in the local IIS. install-local.ps1 asks for
rem administrator rights (UAC) itself. Arguments are passed through, e.g.
rem   deploy\iis\install-local.cmd -IisConfig AppHost
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-local.ps1" %*
set "rc=%errorlevel%"
rem Keep the window open when started by double-click.
echo %cmdcmdline% | find /i "/c" >nul && pause
exit /b %rc%
