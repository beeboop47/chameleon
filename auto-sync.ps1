$ErrorActionPreference = 'Stop'
$repo = $PSScriptRoot
Set-Location -LiteralPath $repo
$log = Join-Path $repo '.git\auto-sync.log'
$mutex = New-Object System.Threading.Mutex($false, 'Local\ChameleonGitAutoSync')
if (-not $mutex.WaitOne(0)) { exit }
function Git-Run {
    param([string[]]$Arguments)
    $ErrorActionPreference = 'Continue'
    $output = & git @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw ($output -join "`n") }
    return ($output -join "`n")
}
try {
    $lastState = ''
    $lastChange = Get-Date
    $retryAfter = Get-Date
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
                }
                $retryAfter = (Get-Date).AddSeconds(15)
            }
        } catch {
            Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) $($_.Exception.Message)"
            $retryAfter = (Get-Date).AddSeconds(60)
        }
        Start-Sleep -Seconds 2
    }
} finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
