stage('Prepare TAP runtime') {
  bat '''@echo off
  xcopy /e /i /q "suite-src\\tap" "suite-src\\projects\\Test Automation Platform"
  if errorlevel 1 exit /b 1
  cd /d "suite-src\\projects\\Test Automation Platform"
  call npm ci --ignore-scripts --no-audit
  if errorlevel 1 exit /b 1
  cd /d "..\\project-a\\Merchant Center UITest"
  call npm ci --ignore-scripts --no-audit
  exit /b %ERRORLEVEL%
  '''
}
stage('Fixed contract selection') {
  bat '@node suite-src/ci/run-contracts.cjs'
}
if (params.RUN_SCOPE == 'pilot') {
  stage('Ten governed MC business cases') {
    bat '''@echo off
    cd /d "suite-src\\projects\\project-a\\Merchant Center UITest"
    node node_modules/tsx/dist/cli.mjs ../../../ci/run-pilot.ts
    exit /b %ERRORLEVEL%
    '''
  }
}
if (params.RUN_SCOPE == 'reports') {
  stage('Isolated report integration - no business execution') {
    bat '''@echo off
    cd /d "suite-src"
    node "projects/project-a/Merchant Center UITest/node_modules/@playwright/test/cli.js" test --config=ci/reporting-smoke.config.ts
    exit /b %ERRORLEVEL%
    '''
  }
}
