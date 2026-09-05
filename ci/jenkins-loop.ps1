# Compatibility entry point. Credentials are loaded from Windows current-user encrypted storage.
& (Join-Path $PSScriptRoot 'jenkins.ps1') poll
exit $LASTEXITCODE
