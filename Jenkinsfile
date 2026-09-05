node {
  ws("${env.WORKSPACE}-isolated") {
    timeout(time: 30, unit: 'MINUTES') {
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
        stage('Archive every terminal outcome') {
          archiveArtifacts artifacts: 'suite-src/output/ci/**/*', allowEmptyArchive: true, fingerprint: true
        }
      }
    }
  }
}
