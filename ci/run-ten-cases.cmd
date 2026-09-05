@echo off
set NODE_PATH=
set HTTP_PROXY=
set HTTPS_PROXY=
set ALL_PROXY=
echo WORKDIR=%CD%
echo SCRIPT=%~dp0
if not exist "%~dp0..\tap\package.json" exit /b 2
cd /d "%~dp0..\tap"
call npm ci --include=dev --legacy-peer-deps
call npm test -- tests/api/acceptance-core.contract.spec.ts --project=api --workers=1 --reporter=line
exit /b %ERRORLEVEL%
