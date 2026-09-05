@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push-trigger-analyze.ps1" -Scope pilot
exit /b %ERRORLEVEL%
