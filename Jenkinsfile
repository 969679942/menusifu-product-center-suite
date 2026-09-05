pipeline {
  agent any
  parameters {
    choice(name: 'TARGET', choices: ['both','project-a','project-b'], description: '执行项目')
    choice(name: 'RUN_MODE', choices: ['full-regression','incremental','repair'], description: '执行模式')
  }
  stages {
    stage('Checkout and Validate') { steps {
      powershell 'git rev-parse HEAD'
      powershell 'npm --prefix tap ci'
    } }
    stage('Project A') { steps { powershell 'npm --prefix projects/project-a ci --ignore-scripts' } }
    stage('Project B') { steps { powershell 'npm --prefix projects/project-b ci --ignore-scripts' } }
  }
  post { always { archiveArtifacts artifacts: 'projects/**/deliverables/**/*,projects/**/test-results/**/*', allowEmptyArchive: true } }
}
