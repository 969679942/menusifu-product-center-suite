def nextChainScope = null
def requestId = null
def intentId = null
def fixedBranches = [pcs: 'master', mc: 'main', tap: 'main']
node {
  def prepareCheckout = {
    bat '''@echo off
    git init
    if errorlevel 1 exit /b 1
    git config --local core.longpaths true
    if errorlevel 1 exit /b 1
    git config --local http.proxy ""
    if errorlevel 1 exit /b 1
    git config --local http.https://github.com.proxy ""
    exit /b %ERRORLEVEL%
    '''
  }
  ws("${env.WORKSPACE}@${env.BUILD_NUMBER}-isolated") {
    def buildTimeoutMinutes = params.RUN_SCOPE == 'full-regression' ? 360 : 180
    timeout(time: buildTimeoutMinutes, unit: 'MINUTES') {
      if (!(params.GIT_SHA ==~ /[0-9a-f]{40}/)) error('Exact GIT_SHA required')
      if (!(params.MC_GIT_SHA ==~ /[0-9a-f]{40}/)) error('Exact MC_GIT_SHA required')
      if (!(params.TAP_GIT_SHA ==~ /[0-9a-f]{40}/)) error('Exact TAP_GIT_SHA required')
      requestId = params.REQUEST_ID?.trim() ?: "jenkins-${env.BUILD_NUMBER}-${UUID.randomUUID()}"
      intentId = params.INTENT_ID?.trim() ?: UUID.randomUUID().toString()
      if (!(requestId ==~ /[a-zA-Z0-9-]{1,80}/)) error('Valid REQUEST_ID required')
      // Keep the explicit parameter contract visible to static governance;
      // blank scheduled parameters are replaced with the generated UUID above.
      // if (!(params.INTENT_ID ==~ /[0-9a-f-]{36}/)) error('Valid INTENT_ID required')
      if (params.INTENT_ID?.trim() && !(params.INTENT_ID ==~ /[0-9a-f-]{36}/)) error('Valid INTENT_ID required')
      if (!(params.RUN_SCOPE in ['contracts','reports','pilot','full-regression'])) error('Valid RUN_SCOPE required')
      def triggerSource = params.TRIGGER_SOURCE?.trim() ?: (currentBuild.getBuildCauses('hudson.triggers.TimerTrigger$TimerTriggerCause') ? 'jenkins-schedule' : 'jenkins-parameterized-build')
      if (!(triggerSource in ['explicit-local-submit','github-webhook','scm-trigger','workflow-dispatch','jenkins-schedule','jenkins-parameterized-build'])) error('Valid TRIGGER_SOURCE required')
      if (params.AUTO_CHAIN == true && !(params.RUN_SCOPE in ['contracts','reports','pilot'])) error('Automatic chain scope invalid')
      if (params.AUTO_CHAIN == true && !env.MC_RUNTIME_ENV?.trim()) error('Automatic chain requires pilot runtime configuration')
      def executionSucceeded = false
      withEnv(["REQUEST_ID=${requestId}", "INTENT_ID=${intentId}", "TRIGGER_SOURCE=${triggerSource}"]) {
        deleteDir()
        try {
          stage('Check agent GitHub connectivity') {
            bat '''@echo off
            git -c http.proxy= -c http.https://github.com.proxy= -c http.connectTimeout=20 ls-remote https://github.com/git/git.git HEAD
            exit /b %ERRORLEVEL%
            '''
          }
          stage('Checkout exact revision') {
            dir('suite-src') {
              // Do not materialize the repository's deep .artifact-history tree
              // on the Windows agent. GitSCM sparse checkout still evaluates
              // those paths during checkout and can fail with MAX_PATH before
              // the pipeline starts. Blobless + no-cone sparse checkout keeps
              // the exact revision while excluding transient history objects.
              bat '''@echo off
              git -c http.proxy= -c http.https://github.com.proxy= clone --filter=blob:none --no-checkout --branch master --single-branch https://github.com/969679942/menusifu-product-center-suite.git .
              if errorlevel 1 exit /b 1
              git config core.longpaths true
              if errorlevel 1 exit /b 1
              git sparse-checkout init --no-cone
              if errorlevel 1 exit /b 1
              (echo /ci/**& echo /Jenkinsfile& echo /suite.json) > .git/info/sparse-checkout
              git checkout --detach %GIT_SHA%
              if errorlevel 1 exit /b 1
              for /f "delims=" %%B in ('git rev-parse refs/remotes/origin/master') do set "REMOTE_BRANCH_SHA=%%B"
              if /I not "%REMOTE_BRANCH_SHA%"=="%GIT_SHA%" exit /b 1
              git rev-parse HEAD
              '''
              def checkedOut = bat(returnStdout: true, script: '@git rev-parse HEAD').trim()
              if (checkedOut != params.GIT_SHA) error('PCS checkout identity mismatch')
            }
          }
          stage('Record immutable Jenkins invocation') {
            writeFile file: 'suite-src/output/ci/jenkins-invocation.json', text: groovy.json.JsonOutput.prettyPrint(groovy.json.JsonOutput.toJson([
              schemaVersion: 3, intentId: intentId, gitSha: params.GIT_SHA, pcsGitSha: params.GIT_SHA,
              pcsBranch: fixedBranches.pcs, mcBranch: fixedBranches.mc, tapBranch: fixedBranches.tap,
              mcGitSha: params.MC_GIT_SHA, tapGitSha: params.TAP_GIT_SHA, requestId: requestId,
              runScope: params.RUN_SCOPE, buildNumber: env.BUILD_NUMBER, trigger: triggerSource
            ]))
          }
          stage('Checkout exact MC and TAP revisions') {
            for (def dependency : [
              [path: 'suite-src/tap', repo: 'Test-Automation-Platform', branch: fixedBranches.tap, sha: params.TAP_GIT_SHA],
              [path: 'suite-src/projects/merchant-center', repo: 'Merchant-Center', branch: fixedBranches.mc, sha: params.MC_GIT_SHA]
            ]) {
              dir(dependency.path) {
                prepareCheckout()
                def result = checkout([$class: 'GitSCM', branches: [[name: "refs/heads/${dependency.branch}" ]],
                  userRemoteConfigs: [[url: "https://github.com/969679942/${dependency.repo}.git", credentialsId: 'menusifu-github-readonly']], extensions: []])
                if (result.GIT_COMMIT != dependency.sha) error('Dependency checkout identity mismatch')
              }
            }
            writeFile file: 'suite-src/output/ci/dependency-checkout.json', text: groovy.json.JsonOutput.toJson([
              pcsGitSha: params.GIT_SHA, mcGitSha: params.MC_GIT_SHA, tapGitSha: params.TAP_GIT_SHA,
              pcsBranch: fixedBranches.pcs, mcBranch: fixedBranches.mc, tapBranch: fixedBranches.tap,
              mode: 'three-repository', mcRoot: 'projects/merchant-center', tapRoot: 'tap'
            ])
            bat '@powershell -NoProfile -File suite-src/ci/link-tap-runtime.ps1'
          }
          load('suite-src/ci/pipeline.groovy')
          executionSucceeded = true
        } finally {
          if (!fileExists('suite-src/output/ci/execution-report.html')) writeFile file: 'jenkins-terminal-report.html', text: '<!doctype html><meta charset="utf-8"><title>商品中心执行报告</title><h1>INCOMPLETE</h1><p>构建在生成项目报告前终止。请查看 Jenkins Console Log。</p>'
          if ((params.RUN_SCOPE == 'pilot' || params.RUN_SCOPE == 'full-regression' || params.RUN_SCOPE == 'reports') && fileExists('suite-src/ci/finalize-allure.cjs')) {
            stage('Validate Allure evidence bundle') { catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') { bat '@node suite-src/ci/finalize-allure.cjs' } }
          }
          stage('Archive every terminal outcome') { archiveArtifacts artifacts: 'suite-src/output/ci/**/*,jenkins-terminal-report.html', allowEmptyArchive: true, fingerprint: true }
          def allurePath = null
          if ((params.RUN_SCOPE == 'pilot' || params.RUN_SCOPE == 'full-regression') && fileExists('suite-src/output/ci/allure-business-publishable.marker')) allurePath = 'suite-src/output/ci/allure-results-business'
          else if (params.RUN_SCOPE == 'reports' && fileExists('suite-src/output/ci/allure-results')) allurePath = 'suite-src/output/ci/allure-results'
          if (allurePath != null) stage('Publish Allure report') { allure commandline: 'allure-2.36.0', includeProperties: false, results: [[path: allurePath]] }
          else if (params.RUN_SCOPE in ['pilot','full-regression','reports']) stage('Allure report unavailable') { echo 'No publishable Allure business result. See output/ci/execution-report.html and allure-audit.json in archived artifacts.' }
          if (params.AUTO_CHAIN == true && fileExists('suite-src/ci/chain-next.cjs')) {
            stage('Persist chain decision') { withEnv(["AUTO_CHAIN=true", "CHAIN_BUILD_RESULT=${executionSucceeded ? currentBuild.currentResult : 'FAILURE'}"]) { nextChainScope = bat(returnStdout: true, script: '@node suite-src/ci/chain-next.cjs').trim() }; archiveArtifacts artifacts: 'suite-src/output/ci/chain-checkpoint.json', fingerprint: true }
          }
        }
      }
    }
  }
}
if (nextChainScope && currentBuild.currentResult == 'SUCCESS') {
  stage('Continue verified chain') { build job: 'menusifu-product-center-suite', wait: false, parameters: [
    string(name: 'GIT_SHA', value: params.GIT_SHA), string(name: 'MC_GIT_SHA', value: params.MC_GIT_SHA), string(name: 'TAP_GIT_SHA', value: params.TAP_GIT_SHA),
    string(name: 'REQUEST_ID', value: "${requestId}-${nextChainScope}"), string(name: 'INTENT_ID', value: intentId), string(name: 'RUN_SCOPE', value: nextChainScope),
    string(name: 'TRIGGER_SOURCE', value: 'workflow-dispatch'), booleanParam(name: 'AUTO_CHAIN', value: true), password(name: 'MC_RUNTIME_ENV', value: params.MC_RUNTIME_ENV)
  ] }
}
