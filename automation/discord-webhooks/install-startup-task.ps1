param(
  [string]$TaskName = 'SportsTips Discord Webhooks'
)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$command = "cd /d `"$repoRoot`" && npm run discord:daemon"
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c $command"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -StartWhenAvailable

Register-ScheduledTask \
  -TaskName $TaskName \
  -Action $action \
  -Trigger $trigger \
  -Settings $settings \
  -Description 'Runs the SportsTips Discord webhook daemon at logon.' \
  -Force | Out-Null

Write-Host "Installed scheduled task: $TaskName"