pipeline {
  agent any
  parameters {
    choice(name: 'TARGET', choices: ['ten-smoke','project-a','project-b'], description: '执行范围')
  }
  stages {
    stage('Checkout and Validate') { steps { powershell 'git rev-parse HEAD' } }
    stage('Ten Case Pilot') { steps {
      powershell 'npm --prefix "projects/project-b" ci --ignore-scripts'
      powershell 'npm --prefix "projects/project-b" exec playwright test tests/api/auth.smoke.spec.ts tests/api/catalog-contract.spec.ts tests/api/api-lifecycle-registry.contract.spec.ts tests/api/audit-identity.contract.spec.ts tests/api/operation-client.contract.spec.ts tests/api/playwright-project-scope.contract.spec.ts tests/api/merchant-center-account-context.contract.spec.ts tests/api/allure-step-policy.contract.spec.ts tests/api/checkpointed-pipeline.contract.spec.ts tests/api/api-test-concurrency.contract.spec.ts --project=api --workers=1 --reporter=line'
    } }
  }
  post { always { archiveArtifacts artifacts: 'projects/project-b/test-results/**/*,projects/project-b/deliverables/**/*', allowEmptyArchive: true } }
}
