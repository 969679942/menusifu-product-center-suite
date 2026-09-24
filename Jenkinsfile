def nextChainScope = null
def requestId = null
def intentId = null
def bundle = null
def jsonString = { value ->
  def text = value == null ? '' : value.toString()
  '"' + text.replace('\\', '\\\\').replace('"', '\\"').replace('\r', '\\r').replace('\n', '\\n').replace('\t', '\\t') + '"'
}
def safePhaseReason = { value ->
  value.toString().replaceAll(/(?i)(password|token|secret|authorization|cookie)=[^\s&]+/, '$1=<redacted>').replaceAll(/[\r\n]+/, ' ').take(1000)
}
node {
  def shortWorkspaceRoot = env.WINDOWS_SHORT_WORKSPACE_ROOT?.trim() ?: 'C:\\w\\pcs'
  if (!(shortWorkspaceRoot ==~ /^[A-Za-z]:\\[^<>:"|?*]+$/) || shortWorkspaceRoot.contains('..') || shortWorkspaceRoot.length() > 40) error('WINDOWS_SHORT_WORKSPACE_ROOT must be an absolute short Windows path')
  def safeJobName = (env.JOB_NAME ?: 'menusifu-product-center-suite').replaceAll(/[^A-Za-z0-9._-]+/, '_').take(48)
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
  ws("${shortWorkspaceRoot}\\${safeJobName}\\${env.BUILD_NUMBER}") {
    def buildTimeoutMinutes = params.RUN_SCOPE == 'full-regression' ? 360 : 180
    timeout(time: buildTimeoutMinutes, unit: 'MINUTES') {
      if (!params.BUNDLE_JSON?.trim()) error('Immutable BUNDLE_JSON required')
      if (params.GIT_SHA?.trim() || params.MC_GIT_SHA?.trim() || params.TAP_GIT_SHA?.trim()) error('Free SHA parameters are forbidden; submit one immutable bundle')
      writeFile file: 'bundle.json', text: params.BUNDLE_JSON
      writeFile file: 'bundle-validator.cjs', text: '''const fs = require('node:fs');
const crypto = require('node:crypto');
const bundle = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const canonical = (value) => Array.isArray(value)
  ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const fingerprint = (value) => {
  const copy = { ...value };
  delete copy.bundleId;
  return crypto.createHash('sha256').update(canonical(copy)).digest('hex');
};
const errors = [];
if (bundle.schemaVersion !== 1 || bundle.projectId !== 'merchant-center') errors.push('bundle-schema-or-project-invalid');
if (!/^[0-9a-f]{64}$/i.test(String(bundle.bundleId || '')) || bundle.bundleId !== fingerprint(bundle)) errors.push('bundle-fingerprint-invalid');
if (bundle.contract?.publicContractVersion !== '1.0.0' || bundle.contract?.runnerContractVersion !== '1.0.0' || bundle.contract?.adapterContracts?.tap !== '1.0.0' || bundle.contract?.adapterContracts?.merchantCenter !== '1.0.0') errors.push('bundle-contract-versions-invalid');
if (JSON.stringify(bundle.contract?.phases) !== JSON.stringify(['preflight', 'contract', 'pilot', 'full-regression'])) errors.push('bundle-phases-invalid');
for (const key of ['pcs', 'mc', 'tap']) {
  const repository = bundle.repositories?.[key] || {};
  if (!/^[0-9a-f]{40}$/i.test(String(repository.revision || ''))) errors.push(`bundle-${key}-revision-invalid`);
  if (repository.branch !== 'main') errors.push(`bundle-${key}-branch-invalid`);
  if (repository.sourceRef !== 'refs/heads/main' || repository.sourceKind !== 'remote-main') errors.push(`bundle-${key}-source-invalid`);
  const checkout = String(repository.checkout || '');
  if (!checkout || checkout.startsWith('/') || checkout.includes('..') || checkout.includes(':') || checkout.includes('\\\\')) errors.push(`bundle-${key}-checkout-invalid`);
}
if (errors.length) { console.error(errors.join(',')); process.exit(2); }
const fields = {
  bundleId: bundle.bundleId,
  pcsRevision: bundle.repositories.pcs.revision,
  pcsBranch: bundle.repositories.pcs.branch,
  mcRevision: bundle.repositories.mc.revision,
  mcBranch: bundle.repositories.mc.branch,
  tapRevision: bundle.repositories.tap.revision,
  tapBranch: bundle.repositories.tap.branch,
  publicContractVersion: bundle.contract.publicContractVersion,
  runnerContractVersion: bundle.contract.runnerContractVersion,
  tapAdapterContractVersion: bundle.contract.adapterContracts.tap,
  merchantCenterAdapterContractVersion: bundle.contract.adapterContracts.merchantCenter,
};
process.stdout.write(Object.entries(fields).map(([key, value]) => `${key}=${value}`).join('\\n'));
'''
      def bundleMetadata = bat(returnStdout: true, script: '@node bundle-validator.cjs bundle.json').trim()
      def bundleFields = [:]
      bundleMetadata.readLines().each { line ->
        def pair = line.split('=', 2)
        if (pair.size() == 2) bundleFields[pair[0]] = pair[1]
      }
      if (!bundleFields.bundleId) error('BUNDLE_JSON must be valid JSON')
      bundle = [
        schemaVersion: 1, projectId: 'merchant-center', bundleId: bundleFields.bundleId,
        repositories: [
          pcs: [revision: bundleFields.pcsRevision, branch: bundleFields.pcsBranch],
          mc: [revision: bundleFields.mcRevision, branch: bundleFields.mcBranch],
          tap: [revision: bundleFields.tapRevision, branch: bundleFields.tapBranch],
        ],
        contract: [
          publicContractVersion: bundleFields.publicContractVersion,
          runnerContractVersion: bundleFields.runnerContractVersion,
          adapterContracts: [tap: bundleFields.tapAdapterContractVersion, merchantCenter: bundleFields.merchantCenterAdapterContractVersion],
          phases: ['preflight', 'contract', 'pilot', 'full-regression'],
        ],
      ]
      def bundleRepositories = bundle.repositories ?: [:]
      if (bundle.schemaVersion != 1 || bundle.projectId != 'merchant-center') error('Bundle schema or project invalid')
      if (bundle.contract?.publicContractVersion != '1.0.0' || bundle.contract?.runnerContractVersion != '1.0.0' || bundle.contract?.adapterContracts?.tap != '1.0.0' || bundle.contract?.adapterContracts?.merchantCenter != '1.0.0') error('Bundle contract versions invalid')
      if (bundle.contract?.phases != ['preflight','contract','pilot','full-regression']) error('Bundle phases invalid')
      for (def key : ['pcs', 'mc', 'tap']) {
        def revision = bundleRepositories[key]?.revision?.toString()
        if (!(revision ==~ /[0-9a-f]{40}/)) error("Bundle ${key} exact revision required")
        if (bundleRepositories[key]?.branch != 'main') error("Bundle ${key} must use main")
        if (!bundleRepositories[key]?.checkout) bundleRepositories[key].checkout = key == 'pcs' ? 'suite-src' : (key == 'mc' ? 'suite-src/projects/merchant-center' : 'suite-src/tap')
        def checkout = bundleRepositories[key].checkout.toString()
        if (checkout.startsWith('/') || checkout.contains('..') || checkout.contains(':') || checkout.contains('\\')) error("Bundle ${key} checkout path invalid")
      }
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
      def runtimeEnv = params.MC_RUNTIME_ENV?.toString() ?: ''
      if (params.AUTO_CHAIN == true && !runtimeEnv.trim()) error('Automatic chain requires pilot runtime configuration')
      def executionSucceeded = false
      withEnv(["REQUEST_ID=${requestId}", "INTENT_ID=${intentId}", "TRIGGER_SOURCE=${triggerSource}", "BUNDLE_PCS_SHA=${bundle.repositories.pcs.revision}", "MC_RUNTIME_ENV=${runtimeEnv}"]) {
        deleteDir()
        writeFile file: 'bundle.json', text: params.BUNDLE_JSON
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
              git -c http.proxy= -c http.https://github.com.proxy= clone --filter=blob:none --no-checkout --branch main --single-branch https://github.com/969679942/menusifu-product-center-suite.git .
              if errorlevel 1 exit /b 1
              git config core.longpaths true
              if errorlevel 1 exit /b 1
              for /f "delims=" %%L in ('git config --get core.longpaths') do if /I not "%%L"=="true" exit /b 1
              git config --local http.proxy ""
              if errorlevel 1 exit /b 1
              git config --local http.https://github.com.proxy ""
              if errorlevel 1 exit /b 1
              git sparse-checkout init --no-cone
              if errorlevel 1 exit /b 1
              (echo /ci/**& echo /Jenkinsfile& echo /suite.json) > .git/info/sparse-checkout
              git cat-file -e %BUNDLE_PCS_SHA%
              if errorlevel 1 exit /b 1
              git checkout --detach %BUNDLE_PCS_SHA%
              if errorlevel 1 exit /b 1
              git rev-parse HEAD
              '''
              def checkedOut = bat(returnStdout: true, script: '@git rev-parse HEAD').trim()
              if (checkedOut != bundle.repositories.pcs.revision) error('PCS checkout identity mismatch')
              bat '@node ci/clean-bundle-transients.cjs --root .'
              bat '@node ci/release-bundle.cjs validate --file ..\\bundle.json --pcs-root .'
            }
          }
          stage('Record immutable Jenkins invocation') {
            writeFile file: 'suite-src/output/ci/jenkins-invocation.json', text: """{
  \"schemaVersion\":4,
  \"intentId\":${jsonString(intentId)},
  \"bundleId\":${jsonString(bundle.bundleId)},
  \"gitSha\":${jsonString(bundle.repositories.pcs.revision)},
  \"pcsGitSha\":${jsonString(bundle.repositories.pcs.revision)},
  \"pcsBranch\":${jsonString(bundle.repositories.pcs.branch)},
  \"mcBranch\":${jsonString(bundle.repositories.mc.branch)},
  \"tapBranch\":${jsonString(bundle.repositories.tap.branch)},
  \"mcGitSha\":${jsonString(bundle.repositories.mc.revision)},
  \"tapGitSha\":${jsonString(bundle.repositories.tap.revision)},
  \"requestId\":${jsonString(requestId)},
  \"publicContractVersion\":${jsonString(bundle.contract.publicContractVersion)},
  \"runnerContractVersion\":${jsonString(bundle.contract.runnerContractVersion)},
  \"adapterContracts\":{\"tap\":${jsonString(bundle.contract.adapterContracts.tap)},\"merchantCenter\":${jsonString(bundle.contract.adapterContracts.merchantCenter)}},
  \"runScope\":${jsonString(params.RUN_SCOPE)},
  \"buildNumber\":${jsonString(env.BUILD_NUMBER)},
  \"trigger\":${jsonString(triggerSource)}
}"""
          }
          stage('Checkout exact MC and TAP revisions') {
            for (def dependency : [
              [path: 'suite-src/tap', repo: 'Test-Automation-Platform', branch: bundle.repositories.tap.branch, revision: bundle.repositories.tap.revision],
              [path: 'suite-src/projects/merchant-center', repo: 'Merchant-Center', branch: bundle.repositories.mc.branch, revision: bundle.repositories.mc.revision]
            ]) {
              dir(dependency.path) {
                prepareCheckout()
                 def result = checkout([$class: 'GitSCM', branches: [[name: "refs/heads/main" ]],
                   userRemoteConfigs: [[url: "https://github.com/969679942/${dependency.repo}.git", credentialsId: 'menusifu-github-readonly']], extensions: [[$class: 'CloneOption', noTags: true, shallow: true, depth: 1]]])
                 if (result.GIT_COMMIT != dependency.revision) error('Dependency checkout identity mismatch with remote main')
              }
            }
            writeFile file: 'suite-src/output/ci/dependency-checkout.json', text: """{
  \"bundleId\":${jsonString(bundle.bundleId)},
  \"pcsGitSha\":${jsonString(bundle.repositories.pcs.revision)},
  \"mcGitSha\":${jsonString(bundle.repositories.mc.revision)},
  \"tapGitSha\":${jsonString(bundle.repositories.tap.revision)},
  \"pcsBranch\":${jsonString(bundle.repositories.pcs.branch)},
  \"mcBranch\":${jsonString(bundle.repositories.mc.branch)},
  \"tapBranch\":${jsonString(bundle.repositories.tap.branch)},
  \"publicContractVersion\":${jsonString(bundle.contract.publicContractVersion)},
  \"runnerContractVersion\":${jsonString(bundle.contract.runnerContractVersion)},
  \"adapterContracts\":{\"tap\":${jsonString(bundle.contract.adapterContracts.tap)},\"merchantCenter\":${jsonString(bundle.contract.adapterContracts.merchantCenter)}},
  \"mode\":\"three-repository\",
  \"mcRoot\":\"projects/merchant-center\",
  \"tapRoot\":\"tap\"
}"""
            bat '@powershell -NoProfile -File suite-src/ci/link-tap-runtime.ps1'
          }
          def pipelineStartedAt = new Date().getTime().toString()
          try {
            load('suite-src/ci/pipeline.groovy')
            executionSucceeded = true
          } catch (Throwable phaseError) {
            def phaseName = (env.STAGE_NAME ?: 'jenkins-pipeline').replaceAll(/[^A-Za-z0-9._-]+/, '-').toLowerCase()
            writeFile file: 'suite-src/output/ci/phase-failure.json', text: """{
  \"schemaVersion\":1,
  \"phase\":${jsonString(phaseName)},
  \"category\":\"technical-blocked\",
  \"reason\":${jsonString(safePhaseReason(phaseError))},
  \"technicalDetails\":${jsonString(safePhaseReason(phaseError))},
  \"startedAt\":${jsonString(pipelineStartedAt)},
  \"finishedAt\":${jsonString(new Date().getTime().toString())},
  \"bundleId\":${jsonString(bundle.bundleId)}
}"""
            throw phaseError
          }
        } finally {
          if (!fileExists('suite-src/output/ci/execution-report.html')) writeFile file: 'jenkins-terminal-report.html', text: '<!doctype html><meta charset="utf-8"><title>商品中心执行报告</title><h1>INCOMPLETE</h1><p>构建在生成项目报告前终止。请查看 Jenkins Console Log。</p>'
          if ((params.RUN_SCOPE == 'pilot' || params.RUN_SCOPE == 'full-regression' || params.RUN_SCOPE == 'reports') && fileExists('suite-src/ci/finalize-allure.cjs')) {
            stage('Validate Allure evidence bundle') { catchError(buildResult: 'UNSTABLE', stageResult: 'UNSTABLE') { bat '@node suite-src/ci/finalize-allure.cjs' } }
          }
          if ((params.RUN_SCOPE == 'pilot' || params.RUN_SCOPE == 'full-regression') &&
              !fileExists('suite-src/output/ci/allure-business-publishable.marker') &&
              !fileExists('suite-src/output/ci/allure-technical-publishable.marker')) {
            writeFile file: 'jenkins-allure-results/technical-terminal-result.json', text: """{
  \"uuid\":${jsonString("technical-${env.BUILD_NUMBER}-${intentId}")},
  \"name\":${jsonString("技术阻断诊断｜${params.RUN_SCOPE}｜构建 #${env.BUILD_NUMBER}")},
  \"fullName\":${jsonString("商品中心.技术诊断.${params.RUN_SCOPE}.构建-${env.BUILD_NUMBER}")},
  \"status\":\"broken\",
  \"stage\":\"finished\",
  \"statusDetails\":{\"message\":${jsonString('构建在公共 Allure finalizer 生成结果前终止；请查看 Jenkins Console Log。')}},
  \"labels\":[{\"name\":\"parentSuite\",\"value\":\"商品中心\"},{\"name\":\"suite\",\"value\":\"技术诊断\"},{\"name\":\"subSuite\",\"value\":\"执行基础设施\"},{\"name\":\"severity\",\"value\":\"blocker\"},{\"name\":\"executionDisposition\",\"value\":\"technical-blocked\"}],
  \"steps\":[{\"name\":\"[技术阶段] 公共 finalizer 前终止\",\"status\":\"broken\",\"stage\":\"finished\"},{\"name\":\"[业务执行资格] 未授权\",\"status\":\"skipped\",\"stage\":\"finished\"}],
  \"attachments\":[]
}"""
            writeFile file: 'jenkins-allure-results/environment.properties', text: 'Execution disposition=TECHNICAL_BLOCKED\nBusiness pass authority=FALSE\n'
          }
          stage('Archive every terminal outcome') { archiveArtifacts artifacts: 'suite-src/output/ci/**/*,jenkins-terminal-report.html,jenkins-allure-results/**/*', allowEmptyArchive: true, fingerprint: true }
          def allurePath = null
          if ((params.RUN_SCOPE == 'pilot' || params.RUN_SCOPE == 'full-regression') && fileExists('suite-src/output/ci/allure-business-publishable.marker')) allurePath = 'suite-src/output/ci/allure-results-business'
          else if ((params.RUN_SCOPE == 'pilot' || params.RUN_SCOPE == 'full-regression') && fileExists('suite-src/output/ci/allure-technical-publishable.marker')) allurePath = 'suite-src/output/ci/allure-results-technical'
          else if (params.RUN_SCOPE == 'reports' && fileExists('suite-src/output/ci/allure-results')) allurePath = 'suite-src/output/ci/allure-results'
          else if ((params.RUN_SCOPE == 'pilot' || params.RUN_SCOPE == 'full-regression') && fileExists('jenkins-allure-results/technical-terminal-result.json')) allurePath = 'jenkins-allure-results'
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
    string(name: 'BUNDLE_JSON', value: params.BUNDLE_JSON),
    string(name: 'REQUEST_ID', value: "${requestId}-${nextChainScope}"), string(name: 'INTENT_ID', value: intentId), string(name: 'RUN_SCOPE', value: nextChainScope),
    string(name: 'TRIGGER_SOURCE', value: 'workflow-dispatch'), booleanParam(name: 'AUTO_CHAIN', value: true), password(name: 'MC_RUNTIME_ENV', value: params.MC_RUNTIME_ENV)
  ] }
}
