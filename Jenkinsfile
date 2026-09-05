node {
  ws("${env.WORKSPACE}-isolated") {
    // Full regression runs the source-governed suite and the two seasoning
    // contexts in one executor.  Keep the job-local ceiling high enough for
    // the complete audit; individual runners still enforce their own limits.
    def buildTimeoutMinutes = 180
    timeout(time: buildTimeoutMinutes, unit: 'MINUTES') {
      if (!(params.GIT_SHA ==~ /[0-9a-f]{40}/)) error('Exact GIT_SHA required')
      if (!(params.REQUEST_ID ==~ /[a-zA-Z0-9-]{1,80}/)) error('Valid REQUEST_ID required')
      deleteDir()
      try {
        stage('Checkout exact revision') {
          withEnv(["SUITE_GIT_SHA=${params.GIT_SHA}"]) {
            bat '''@echo off
            git -c http.proxy= -c https.proxy= clone --no-checkout https://github.com/969679942/menusifu-product-center-suite.git suite-src
            if errorlevel 1 exit /b 1
            git -C suite-src checkout --detach %SUITE_GIT_SHA%
            if errorlevel 1 exit /b 1
            git -C suite-src rev-parse HEAD
            '''
          }
        }
        load('suite-src/ci/pipeline.groovy')
      } finally {
        if ((params.RUN_SCOPE == 'pilot' || params.RUN_SCOPE == 'full-regression' || params.RUN_SCOPE == 'reports') && fileExists('suite-src/ci/finalize-allure.cjs')) {
          stage('Validate Allure evidence bundle') {
            catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
              bat '@node suite-src/ci/finalize-allure.cjs'
            }
          }
        }
        stage('Archive every terminal outcome') {
          archiveArtifacts artifacts: 'suite-src/output/ci/**/*', allowEmptyArchive: true, fingerprint: true
        }
        if (fileExists('suite-src/output/ci/allure-results')) {
          stage('Publish Allure report') {
            allure commandline: 'allure-2.36.0', includeProperties: false, results: [[path: 'suite-src/output/ci/allure-results']]
          }
        }
      }
    }
  }
}
