def jsonString = { value ->
  def text = value == null ? '' : value.toString()
  '"' + text.replace('\\', '\\\\').replace('"', '\\"').replace('\r', '\\r').replace('\n', '\\n').replace('\t', '\\t') + '"'
}

def redacted = { value ->
  value.toString()
    .replaceAll(/(?i)(password|token|secret|authorization|cookie)=[^\s&]+/, '$1=<redacted>')
    .replaceAll(/[\r\n]+/, ' ')
    .take(2000)
}

properties([parameters([
  string(name: 'MC_GIT_SHA', defaultValue: '', description: 'Merchant Center remote main exact commit SHA'),
  choice(name: 'RUN_SCOPE', choices: ['pilot', 'full-regression'], description: 'MC business execution scope'),
  string(name: 'REQUEST_ID', defaultValue: '', description: 'Idempotent request identity'),
  string(name: 'INTENT_ID', defaultValue: '', description: 'Execution intent UUID'),
  choice(name: 'TRIGGER_SOURCE', choices: ['explicit-local-submit', 'github-webhook', 'scm-trigger', 'workflow-dispatch', 'jenkins-schedule'], description: 'Trigger source identity'),
  password(name: 'MC_RUNTIME_ENV', description: 'Optional secured runtime configuration content'),
  string(name: 'MC_RUNTIME_ENV_PATH', defaultValue: 'D:\\Menusifu\\Merchant Center\\.secrets\\runtime.env', description: 'Secured runtime configuration path on the agent'),
])])

node {
  def shortWorkspaceRoot = env.WINDOWS_SHORT_WORKSPACE_ROOT?.trim() ?: 'C:\\w\\pcs'
  if (!(shortWorkspaceRoot ==~ /^[A-Za-z]:\\[^<>:"|?*]+$/) || shortWorkspaceRoot.contains('..') || shortWorkspaceRoot.length() > 40) {
    error('WINDOWS_SHORT_WORKSPACE_ROOT must be an absolute short Windows path')
  }

  def safeJobName = (env.JOB_NAME ?: 'menusifu-product-center-suite')
    .replaceAll(/[^A-Za-z0-9._-]+/, '_')
    .take(48)

  ws("${shortWorkspaceRoot}\\${safeJobName}\\${env.BUILD_NUMBER}") {
    timeout(time: params.RUN_SCOPE == 'full-regression' ? 480 : 180, unit: 'MINUTES') {
      if (params.BUNDLE_JSON?.trim()) error('PCS_BUNDLE_DEPRECATED_USE_MC_ONLY_PIPELINE')
      if (params.GIT_SHA?.trim() || params.PCS_GIT_SHA?.trim() || params.MC_TAP_GIT_SHA?.trim()) {
        error('LEGACY_MULTI_REPOSITORY_SHA_PARAMETERS_FORBIDDEN')
      }

      def mcRevision = params.MC_GIT_SHA?.trim()
      if (!(mcRevision ==~ /[0-9a-fA-F]{40}/)) error('MC_GIT_SHA_REQUIRED')
      if (!(params.RUN_SCOPE in ['pilot', 'full-regression'])) error('MC_ONLY_PIPELINE_SCOPE_INVALID')

      def requestId = params.REQUEST_ID?.trim() ?: "jenkins-${env.BUILD_NUMBER}-${UUID.randomUUID()}"
      def intentId = params.INTENT_ID?.trim() ?: UUID.randomUUID().toString()
      def triggerSource = params.TRIGGER_SOURCE?.trim() ?: 'explicit-local-submit'
      if (!(requestId ==~ /[A-Za-z0-9-]{1,80}/)) error('REQUEST_ID_INVALID')
      if (!(intentId ==~ /[0-9a-fA-F-]{36}/)) error('INTENT_ID_INVALID')
      if (!(triggerSource in ['explicit-local-submit', 'github-webhook', 'scm-trigger', 'workflow-dispatch', 'jenkins-schedule'])) error('TRIGGER_SOURCE_INVALID')

      def runtimeEnv = params.MC_RUNTIME_ENV?.toString() ?: ''
      def runtimeEnvPath = params.MC_RUNTIME_ENV_PATH?.trim() ?: (env.MC_RUNTIME_ENV_PATH?.trim() ?: 'D:\\Menusifu\\Merchant Center\\.secrets\\runtime.env')
      if (!runtimeEnv.trim() && !fileExists(runtimeEnvPath)) error('MC_RUNTIME_CONFIGURATION_UNAVAILABLE')

      deleteDir()
      def sourceRoot = 'merchant-center'
      def businessExitCode = 0
      try {
        stage('Checkout MC main') {
          timeout(time: 15, unit: 'MINUTES') {
            retry(2) {
              dir(sourceRoot) {
                deleteDir()
                bat '''@echo off
                git init
                if errorlevel 1 exit /b 1
                git config --local core.longpaths true
                if errorlevel 1 exit /b 1
                git config --local core.autocrlf false
                if errorlevel 1 exit /b 1
                git config --local http.proxy ""
                if errorlevel 1 exit /b 1
                git config --local http.https://github.com.proxy ""
                if errorlevel 1 exit /b 1
                '''
                def checkoutResult = withEnv([
                  'GIT_CONFIG_COUNT=2',
                  'GIT_CONFIG_KEY_0=core.longpaths',
                  'GIT_CONFIG_VALUE_0=true',
                  'GIT_CONFIG_KEY_1=core.autocrlf',
                  'GIT_CONFIG_VALUE_1=false',
                  'GIT_TERMINAL_PROMPT=0',
                ]) {
                  checkout([$class: 'GitSCM',
                    branches: [[name: 'refs/heads/main']],
                    userRemoteConfigs: [[url: 'https://github.com/969679942/Merchant-Center.git', credentialsId: 'menusifu-github-readonly']],
                    extensions: [[$class: 'CloneOption', noTags: true, shallow: true, depth: 1, timeout: 5]]])
                }
                def checkedOut = bat(returnStdout: true, script: '@git rev-parse HEAD').trim()
                if (checkedOut != mcRevision || checkoutResult.GIT_COMMIT != mcRevision) error('MC_CHECKOUT_IDENTITY_MISMATCH')
              }
            }
          }
        }

        writeFile file: 'execution-context.json', text: """{
  \"schemaVersion\":1,
  \"executionModel\":\"mc-single-project\",
  \"mcGitSha\":${jsonString(mcRevision)},
  \"runScope\":${jsonString(params.RUN_SCOPE)},
  \"triggerSource\":${jsonString(triggerSource)},
  \"requestId\":${jsonString(requestId)},
  \"intentId\":${jsonString(intentId)},
  \"tapContractPackage\":\"@menusifu/tap-contract@1.1.3\"
}"""

        stage('Install and preflight contract') {
          dir("${sourceRoot}\\Merchant Center UITest") {
            bat 'npm ci'
            withEnv([
              "TAP_EXECUTION_ROLE=preflight-contract-and-post-run-analysis",
              "RUN_SCOPE=${params.RUN_SCOPE}",
              "SYSTEM_TEST_APPLICATION_ID=merchant-center",
              "SYSTEM_TEST_BUSINESS_DOMAIN_ID=product-center",
            ]) {
              bat 'npm run contract:product-center:preflight'
            }
          }
        }

        stage('Run MC UI automation') {
          dir("${sourceRoot}\\Merchant Center UITest") {
            withEnv([
              "SYSTEM_TEST_RUN_ID=jenkins-${env.BUILD_TAG}",
              "PC_SOURCE_GOVERNED_RUN_ID=jenkins-${env.BUILD_TAG}",
              "REQUEST_ID=${requestId}",
              "INTENT_ID=${intentId}",
              "SYSTEM_TEST_LOGICAL_RUN_ID=jenkins-${env.JOB_NAME}",
              "SYSTEM_TEST_TRIGGER_SOURCE=Jenkins/${env.JOB_NAME}",
              "SYSTEM_TEST_TRIGGER_TYPE=Jenkins 构建触发",
              "SYSTEM_TEST_TRIGGER_ACTOR=Jenkins",
              "SYSTEM_TEST_AUDIT_EVENT_LOG=${env.WORKSPACE}\\${sourceRoot}\\Merchant Center UITest\\output\\audit\\jenkins-${env.BUILD_TAG}-events.jsonl",
              "MC_RUNTIME_ENV=${runtimeEnv}",
              "MC_SECRET_ENV_PATH=${runtimeEnvPath}",
              "PRODUCT_CENTER_CI_MODE=ui-only",
              "RUN_SCOPE=${params.RUN_SCOPE}",
            ]) {
              businessExitCode = bat(returnStatus: true, script: 'npm run ci:product-center')
            }
          }
        }

        stage('TAP post-run analysis') {
          dir("${sourceRoot}\\Merchant Center UITest") {
            catchError(buildResult: 'UNSTABLE', stageResult: 'UNSTABLE') {
              withEnv(["RUN_SCOPE=${params.RUN_SCOPE}", "PC_SOURCE_GOVERNED_RUN_ID=jenkins-${env.BUILD_TAG}"]) {
                bat 'npm run analyze:product-center:result'
              }
            }
          }
        }

        stage('Archive independent outcomes') {
          archiveArtifacts artifacts: "${sourceRoot}/Merchant Center UITest/output/**/*,${sourceRoot}/deliverables/product-center-source-governance/execution-result.json,${sourceRoot}/deliverables/product-center-source-governance/runs/**/*.json,execution-context.json", allowEmptyArchive: true, fingerprint: true
        }
        if (businessExitCode != 0) error("MC_RUN_EXIT_CODE:${businessExitCode}")
      } catch (Throwable failure) {
        if (!fileExists("${sourceRoot}\\Merchant Center UITest\\output\\ci\\product-center-ci-summary.json")) {
          writeFile file: 'technical-terminal-result.json', text: """{
  \"schemaVersion\":1,
  \"status\":\"technical-blocked\",
  \"businessExecutionStatus\":\"not-started\",
  \"analysisStatus\":\"not-run\",
  \"phase\":${jsonString(env.STAGE_NAME ?: 'jenkins')},
  \"reason\":${jsonString(redacted(failure))}
}"""
        }
        archiveArtifacts artifacts: 'technical-terminal-result.json,execution-context.json', allowEmptyArchive: true, fingerprint: true
        throw failure
      }
    }
  }
}
