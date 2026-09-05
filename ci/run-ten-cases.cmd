@echo off
set NODE_PATH=
set HTTP_PROXY=
set HTTPS_PROXY=
set ALL_PROXY=
set http_proxy=
set https_proxy=
set all_proxy=
cd /d "%~dp0..\tap"
if errorlevel 1 exit /b 1
call npm ci --include=dev --legacy-peer-deps
call npm test -- tests/api/acceptance-core.contract.spec.ts tests/api/acceptance-route-scanner.contract.spec.ts tests/api/acceptance-orchestrator.contract.spec.ts tests/api/process-governance.contract.spec.ts tests/api/migration-closure.contract.spec.ts tests/api/business-rule-coverage.contract.spec.ts tests/api/business-rule-change-trigger.contract.spec.ts tests/api/business-rule-lifecycle.contract.spec.ts tests/api/business-rule-change-event.contract.spec.ts tests/api/audit-reference.contract.spec.ts --project=api --workers=1 --reporter=line
exit /b %ERRORLEVEL%
