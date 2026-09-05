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
