<#
.SYNOPSIS
    A Claude Code status line that also publishes your Claude plan usage to
    OrbIt Command Center, for a Claude Usage screen to show (docs/feeds-api.md).

.DESCRIPTION
    Claude Code runs its status line command after each reply and hands it the
    session's details as JSON on stdin. For Pro, Max and Ultra plans that
    includes rate_limits: how much of the rolling 5-hour session limit and
    of the weekly limit is used, and when each resets. This script pushes
    those as four feeds:

        claude.session            5-hour window, percent used (0-100)
        claude.week               weekly window, percent used (0-100)
        claude.sessionResetsAt    when the 5-hour window resets, Unix seconds
        claude.weekResetsAt       when the weekly window resets, Unix seconds

    then prints a one-line status: the folder, git branch, model, context
    used and both limits.

    rate_limits only appears after the session's first reply, and a window
    Claude Code doesn't report is simply not pushed: the feed keeps its last
    value, and once its reset time passes the orb shows that window as 0%.

    If the app isn't running, the pushes fail quietly and the status line
    still prints.

    To use it, add this to %USERPROFILE%\.claude\settings.json (with the path
    to wherever this script is). Use forward slashes in the path: Claude Code
    may run the command through bash, which drops unquoted backslashes.

        "statusLine": {
          "type": "command",
          "command": "powershell -NoProfile -ExecutionPolicy Bypass -File C:/path/to/claude-usage-statusline.ps1"
        }

    Then in the app set a screen to Claude Usage: it always follows these
    four feeds.

.EXAMPLE
    '{"rate_limits":{"five_hour":{"used_percentage":42,"resets_at":1795535998}}}' | .\claude-usage-statusline.ps1
#>
param(
    # Where OrbIt Command Center listens for feeds.
    [string]$FeedsUrl = "http://127.0.0.1:47800/feeds"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
    $data = [Console]::In.ReadToEnd() | ConvertFrom-Json
} catch {
    $data = $null
}

# ---- publish the usage ----------------------------------------------------

# A WebClient with no proxy: Windows PowerShell's Invoke-RestMethod looks for
# a proxy on its first call, which can stall a status line for seconds.
$client = New-Object System.Net.WebClient
$client.Proxy = $null

function Push-Feed([string]$id, $body) {
    try {
        $client.Headers["Content-Type"] = "application/json"
        $client.UploadString("$FeedsUrl/$id", "POST", ($body | ConvertTo-Json -Compress)) | Out-Null
    } catch {
        # Most likely the app isn't running; the status line matters more.
    }
}

$limits = if ($data) { $data.rate_limits } else { $null }
$windows = @(
    @{ key = "five_hour"; name = "session"; label = "Claude session" },
    @{ key = "seven_day"; name = "week"; label = "Claude week" }
)
foreach ($w in $windows) {
    $window = if ($limits) { $limits.($w.key) } else { $null }
    if (-not $window) { continue }
    if ($null -ne $window.used_percentage) {
        Push-Feed "claude.$($w.name)" @{
            value = [math]::Round([double]$window.used_percentage, 1)
            label = $w.label; min = 0; max = 100
        }
    }
    if ($null -ne $window.resets_at) {
        # Whole seconds: the orb takes reset times only as integers.
        Push-Feed "claude.$($w.name)ResetsAt" @{ value = [int64][math]::Floor([double]$window.resets_at) }
    }
}

# ---- print the status line -------------------------------------------------

$esc = [char]27
$parts = @()

$cwd = if ($data -and $data.workspace -and $data.workspace.current_dir) { $data.workspace.current_dir }
       elseif ($data -and $data.cwd) { $data.cwd } else { $null }
if ($cwd) {
    $line = "$esc[32m$cwd$esc[0m"
    $branch = git -C $cwd --no-optional-locks branch --show-current 2>$null
    if ($branch) { $line += " $esc[33m($branch)$esc[0m" }
    $parts += $line
}
if ($data -and $data.model -and $data.model.display_name) { $parts += $data.model.display_name }
if ($data -and $data.context_window -and $null -ne $data.context_window.used_percentage) {
    $parts += "ctx {0:N0}%" -f [double]$data.context_window.used_percentage
}
foreach ($w in @(@{ key = "five_hour"; short = "5h" }, @{ key = "seven_day"; short = "7d" })) {
    $window = if ($limits) { $limits.($w.key) } else { $null }
    if ($window -and $null -ne $window.used_percentage) {
        $parts += "$($w.short) {0:N0}%" -f [double]$window.used_percentage
    }
}

Write-Output ($parts -join "  |  ")
