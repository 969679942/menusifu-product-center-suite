node {
  ws("${env.WORKSPACE}-isolated") {
    // Full regression runs the source-governed suite and the two seasoning
    // contexts in one executor.  Keep the job-local ceiling high enough for
    // the complete audit; individual runners still enforce their own limits.
    def buildTimeoutMinutes = 180
    timeout(time: buildTimeoutMinutes, unit: 'MINUTES') {
      if (!(params.GIT_SHA ==~ /[0-9a-f]{40}/)) error('Exact GIT_SHA required')
      if (!(params.REQUEST_ID ==~ /[a-zA-Z0-9-]{1,80}/)) error('Valid REQUEST_ID required')
      if (!(params.INTENT_ID ==~ /[0-9a-f-]{36}/)) error('Valid INTENT_ID required')
      if (!(params.RUN_SCOPE in ['contracts','reports','pilot','full-regression'])) error('Valid RUN_SCOPE required')
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
        stage('Record immutable Jenkins invocation') {
          // Runners generate their own execution-intent.json after resolving
          // selections. Keep the parameter identity in a separate immutable
          // invocation record so it cannot be overwritten by that process.
          writeFile file: 'suite-src/output/ci/jenkins-invocation.json', text: groovy.json.JsonOutput.prettyPrint(groovy.json.JsonOutput.toJson([
            schemaVersion: 1, intentId: params.INTENT_ID, gitSha: params.GIT_SHA,
            requestId: params.REQUEST_ID, runScope: params.RUN_SCOPE, buildNumber: env.BUILD_NUMBER,
            trigger: 'jenkins-parameterized-build'
          ]))
        }
        load('suite-src/ci/pipeline.groovy')
      } finally {
        if (!fileExists('suite-src/output/ci/execution-report.html')) {
          writeFile file: 'jenkins-terminal-report.html', text: '<!doctype html><meta charset="utf-8"><title>商品中心执行报告</title><h1>INCOMPLETE</h1><p>构建在生成项目报告前终止。请查看 Jenkins Console Log。</p>'
        }
        if ((params.RUN_SCOPE == 'pilot' || params.RUN_SCOPE == 'full-regression' || params.RUN_SCOPE == 'reports') && fileExists('suite-src/ci/finalize-allure.cjs')) {
          stage('Validate Allure evidence bundle') {
            catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
              bat '@node suite-src/ci/finalize-allure.cjs'
            }
          }
        }
        stage('Archive every terminal outcome') {
          archiveArtifacts artifacts: 'suite-src/output/ci/**/*,jenkins-terminal-report.html', allowEmptyArchive: true, fingerprint: true
        }
        def allurePath = null
        if ((params.RUN_SCOPE == 'pilot' || params.RUN_SCOPE == 'full-regression') && fileExists('suite-src/output/ci/allure-business-publishable.marker')) {
          allurePath = 'suite-src/output/ci/allure-results-business'
        } else if (params.RUN_SCOPE == 'reports' && fileExists('suite-src/output/ci/allure-results')) {
          allurePath = 'suite-src/output/ci/allure-results'
        }
        if (allurePath != null) {
          stage('Publish Allure report') {
            allure commandline: 'allure-2.36.0', includeProperties: false, results: [[path: allurePath]]
          }
        } else if (params.RUN_SCOPE == 'pilot' || params.RUN_SCOPE == 'full-regression' || params.RUN_SCOPE == 'reports') {
          stage('Allure report unavailable') {
            echo 'No publishable Allure business result. See output/ci/execution-report.html and allure-audit.json in archived artifacts.'
          }
        }
      }
    }
  }
}
