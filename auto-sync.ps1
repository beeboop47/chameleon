$ErrorActionPreference = 'Stop'
$repo = $PSScriptRoot
Set-Location -LiteralPath $repo
$log = Join-Path $repo '.git\auto-sync.log'
$mutex = New-Object System.Threading.Mutex($false, 'Local\ChameleonGitAutoSync')
if (-not $mutex.WaitOne(0)) { exit }
$notification = $null
try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $notification = New-Object System.Windows.Forms.NotifyIcon
    $notification.Icon = [System.Drawing.SystemIcons]::Information
    $notification.Text = 'Chameleon GitHub sync'
    $notification.Visible = $true
} catch {
    Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) Desktop notifications unavailable."
}
function Show-SyncNotification {
    param([string]$Title, [string]$Message)
    if ($null -eq $notification) { return }
    try {
        $notification.ShowBalloonTip(8000, $Title, $Message, [System.Windows.Forms.ToolTipIcon]::Info)
        [System.Windows.Forms.Application]::DoEvents()
    } catch {
        Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) Could not display notification."
    }
}
function Git-Run {
    param([string[]]$Arguments)
    $ErrorActionPreference = 'Continue'
    $output = & git @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw ($output -join "`n") }
    return ($output -join "`n")
}
$pagesStatePath = Join-Path $repo '.git\pages-notification.json'
$pagesNotifiedRevision = ''
if (Test-Path -LiteralPath $pagesStatePath) {
    try { $pagesNotifiedRevision = (Get-Content -LiteralPath $pagesStatePath -Raw | ConvertFrom-Json).revision } catch { }
}
function Check-PagesDeployment {
    param([string]$Revision)
    if (-not $Revision -or $Revision -eq $script:pagesNotifiedRevision) { return }
    $headers = @{ 'User-Agent' = 'Chameleon-Sync'; 'Accept' = 'application/vnd.github+json' }
    $uri = "https://api.github.com/repos/beeboop47/chameleon/actions/runs?head_sha=$Revision&per_page=10"
    $response = Invoke-RestMethod -Uri $uri -Headers $headers -TimeoutSec 20
    $run = $response.workflow_runs | Where-Object { $_.name -eq 'pages build and deployment' -and $_.head_sha -eq $Revision -and $_.head_branch -eq 'main' } | Sort-Object run_number -Descending | Select-Object -First 1
    if ($null -eq $run -or $run.status -ne 'completed') { return }
    if ($run.conclusion -eq 'success') {
        Show-SyncNotification 'Chameleon is live on GitHub Pages' 'Deployment succeeded. Your updated game is ready at https://beeboop47.github.io/chameleon/'
    } elseif ($run.conclusion -in @('failure', 'timed_out', 'action_required', 'startup_failure')) {
        Show-SyncNotification 'Chameleon deployment failed' 'The files reached GitHub, but GitHub Pages did not deploy them. Check the repository Actions page.'
    } else {
        # Cancelled runs may be replaced by a newer deployment attempt.
        return
    }
    $script:pagesNotifiedRevision = $Revision
    @{ revision = $Revision; conclusion = $run.conclusion } | ConvertTo-Json | Set-Content -LiteralPath $pagesStatePath
    Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) Pages deployment $($run.conclusion): $Revision"
}
try {
    $lastState = ''
    $lastChange = Get-Date
    $retryAfter = Get-Date
    $failureNotified = $false
    $nextPagesCheck = Get-Date
    while ($true) {
        try {
            $state = Git-Run @('status', '--porcelain')
            if ($state -ne $lastState) {
                $lastState = $state
                $lastChange = Get-Date
            }
            if ((Get-Date) -ge $retryAfter) {
                if ($state -and ((Get-Date) - $lastChange).TotalSeconds -ge 5) {
                    if ((Test-Path '.git\MERGE_HEAD') -or (Test-Path '.git\rebase-merge') -or (Test-Path '.git\rebase-apply')) {
                        throw 'Merge or rebase in progress; automatic upload paused.'
                    }
                    Git-Run @('add', '--all') | Out-Null
                    $staged = Git-Run @('diff', '--cached', '--name-only')
                    if ($staged) {
                        Git-Run @('commit', '-m', ('Auto-save ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))) | Out-Null
                        Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) Changes committed."
                    }
                    $lastState = ''
                }
                $ahead = Git-Run @('rev-list', '--count', '@{upstream}..HEAD')
                if ([int]$ahead -gt 0) {
                    Git-Run @('push', 'origin', 'main') | Out-Null
                    Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) Uploaded to GitHub."
                    $nextPagesCheck = Get-Date
                    $failureNotified = $false
                }
                $retryAfter = (Get-Date).AddSeconds(15)
            }
        } catch {
            Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) $($_.Exception.Message)"
            if (-not $failureNotified) {
                Show-SyncNotification 'Chameleon upload delayed' 'Your changes have not reached GitHub. Sync will retry automatically; see .git/auto-sync.log for details.'
                $failureNotified = $true
            }
            $retryAfter = (Get-Date).AddSeconds(60)
        }
        if ((Get-Date) -ge $nextPagesCheck) {
            try {
                Check-PagesDeployment (Git-Run @('rev-parse', 'origin/main'))
            } catch {
                Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) Could not check Pages deployment; will retry. $($_.Exception.Message)"
            }
            $nextPagesCheck = (Get-Date).AddSeconds(90)
        }
        Start-Sleep -Seconds 2
        if ($null -ne $notification) { [System.Windows.Forms.Application]::DoEvents() }
    }
} finally {
    if ($null -ne $notification) { $notification.Dispose() }
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
