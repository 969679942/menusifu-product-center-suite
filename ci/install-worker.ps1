$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$directory=Join-Path $root 'output/worker'
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$node=(Get-Command node.exe).Source
$python=(Get-Command python.exe).Source
$codexCommand=(Get-Command codex).Source
$entry=Join-Path (Split-Path $codexCommand -Parent) 'node_modules/@openai/codex/bin/codex.js'
if(-not (Test-Path -LiteralPath $entry)){throw 'Installed Codex CLI entry not found'}
@{python=$python;node=$node;codexEntry=$entry;root=$root} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $directory 'runtime.json') -Encoding UTF8
$name='Menusifu-ProductCenter-AI-Worker'
$user=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+(Join-Path $PSScriptRoot 'worker.ps1')+'" serve') -WorkingDirectory $root
$triggers=@((New-ScheduledTaskTrigger -AtLogOn -User $user),(New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)))
$principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$existing=Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
if($existing -and $existing.Actions.Arguments -notlike ('*'+(Join-Path $PSScriptRoot 'worker.ps1')+'*')){throw 'Task name belongs to a different installation'}
Register-ScheduledTask -TaskName $name -Action $action -Trigger $triggers -Principal $principal -Settings $settings -Description 'Dedicated local Jenkins evidence and Codex worker; no dependency on the Codex desktop window.' -Force | Out-Null
Start-ScheduledTask -TaskName $name
Write-Output ('Registered and started '+$name+' under '+$user+'. Windows user session must remain signed in; locking the screen is supported.')
