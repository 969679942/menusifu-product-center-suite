stage('Prepare TAP runtime') {
  bat '''@echo off
  node suite-src\\ci\\validate-suite-config.cjs
  if errorlevel 1 exit /b 1
  if not exist "suite-src\\tap\\package.json" exit /b 1
  cd /d "suite-src\\tap"
  call npm ci --ignore-scripts --no-audit
  if errorlevel 1 exit /b 1
  cd /d "..\\projects\\merchant-center\\Merchant Center UITest"
  call npm ci --ignore-scripts --no-audit
  exit /b %ERRORLEVEL%
  '''
}
if (params.AUTO_CHAIN == true || params.RUN_SCOPE == 'pilot') {
  stage('Compile pilot selection without business execution') {
    bat '@node "suite-src/projects/merchant-center/Merchant Center UITest/node_modules/tsx/dist/cli.mjs" suite-src/ci/run-pilot.ts --plan-only'
  }
}
stage('Fixed contract selection') {
  bat '@node suite-src/ci/run-contracts.cjs'
}
stage('CI transport and reporting contracts') {
  bat '@node --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=suite-src/output/ci/ci-contracts.xml suite-src/tap/tests/ci-transport.test.cjs suite-src/tap/tests/build-watch.test.cjs suite-src/tap/tests/result-bundle.test.cjs suite-src/ci/tests/finalize-allure.test.cjs suite-src/ci/tests/pilot-concurrency.test.cjs suite-src/ci/tests/full-regression-intent.test.cjs suite-src/ci/tests/jenkinsfile.contract.test.cjs suite-src/ci/tests/chain-next.test.cjs'
}
if (params.RUN_SCOPE == 'pilot') {
  stage('Ten governed MC business cases') {
    bat '''@echo off
    cd /d "suite-src\\projects\\merchant-center\\Merchant Center UITest"
    node node_modules/tsx/dist/cli.mjs ../../../ci/run-pilot.ts
    exit /b %ERRORLEVEL%
    '''
  }
}
if (params.RUN_SCOPE == 'full-regression') {
  stage('Full Merchant Center product-center regression') {
    bat '''@echo off
    cd /d "suite-src\\projects\\merchant-center\\Merchant Center UITest"
    node node_modules/tsx/dist/cli.mjs ../../../ci/run-product-center-full.ts
    exit /b %ERRORLEVEL%
    '''
  }
}
if (params.RUN_SCOPE == 'reports') {
  stage('Isolated report integration - no business execution') {
    bat '''@echo off
    cd /d "suite-src"
    node "projects/merchant-center/Merchant Center UITest/node_modules/@playwright/test/cli.js" test --config=ci/reporting-smoke.config.ts
    exit /b %ERRORLEVEL%
    '''
  }
}
