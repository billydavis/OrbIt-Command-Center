<#
.SYNOPSIS
    Example feed publisher: pushes the frame rate of whatever is in the foreground
    to OrbIt Command Center as a feed (docs/feeds-api.md).

.DESCRIPTION
    Runs PresentMon, which reports every frame any program presents, counts the
    foreground program's frames each second, and posts that number to the app's
    local feed endpoint. In the app, set a screen to Gauge and pick the feed
    ("fps" unless you change it) as its value source.

    PresentMon reads Windows' frame events, which takes one of:
      - running this script from an elevated ("Run as administrator") PowerShell, or
      - adding your account to the "Performance Log Users" group once, then
        signing out and back in.

    PresentMon is one file, PresentMon-<version>-x64.exe, from
    https://github.com/GameTechDev/PresentMon/releases - put it next to this
    script or on PATH, or pass its location with -PresentMonPath. (The copy the
    NVIDIA app installs under FrameViewSDK doesn't work on its own.)

.EXAMPLE
    .\fps-feed.ps1

.EXAMPLE
    .\fps-feed.ps1 -Feed game.fps -Max 240
#>
param(
    # The feed to publish.
    [string]$Feed = "fps",

    # Top of the range suggested to the app for a gauge following this feed.
    # 0 means use the display's refresh rate.
    [int]$Max = 0,

    # PresentMon's console executable, if it isn't next to this script or on PATH.
    [string]$PresentMonPath,

    [string]$Endpoint = "http://127.0.0.1:47800"
)

$ErrorActionPreference = "Stop"

function Find-PresentMon {
    if ($PresentMonPath) { return $PresentMonPath }
    $besideScript = Get-ChildItem -Path $PSScriptRoot -Filter "PresentMon*.exe" | Select-Object -First 1
    if ($besideScript) { return $besideScript.FullName }
    $onPath = Get-Command "PresentMon*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($onPath) { return $onPath.Source }
    throw ("PresentMon not found. Download PresentMon-<version>-x64.exe from " +
        "https://github.com/GameTechDev/PresentMon/releases, then put it next to this script or pass -PresentMonPath.")
}

# Which process owns the window in front - that's the one whose frame rate is
# worth showing.
Add-Type -Namespace OrbIt -Name Foreground -MemberDefinition @'
[DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
public static uint ProcessId() {
    uint id;
    GetWindowThreadProcessId(GetForegroundWindow(), out id);
    return id;
}
'@

$script:announcedFailure = $false
$script:sentHints = $false

function Push-Feed([double]$value) {
    $body = @{ value = $value }
    # The label and range are suggestions for the gauge's form; once is enough,
    # the app remembers them.
    if (-not $script:sentHints) {
        $body.label = "FPS"
        $body.min = 0
        $body.max = $Max
    }
    try {
        Invoke-RestMethod -Method Post -Uri "$Endpoint/feeds/$Feed" -ContentType "application/json" `
            -Body ($body | ConvertTo-Json -Compress) -TimeoutSec 2 | Out-Null
        $script:sentHints = $true
        $script:announcedFailure = $false
    } catch {
        # The app may simply not be running yet; keep measuring and say so once.
        if (-not $script:announcedFailure) {
            Write-Warning "Could not push to $Endpoint (is OrbIt Command Center running?): $($_.Exception.Message)"
            $script:announcedFailure = $true
        }
    }
}

$presentMon = Find-PresentMon
if ($Max -le 0) {
    $refresh = Get-CimInstance Win32_VideoController |
        Where-Object { $_.CurrentRefreshRate -gt 0 } |
        Measure-Object -Property CurrentRefreshRate -Maximum
    $Max = if ($refresh.Maximum) { [int]$refresh.Maximum } else { 144 }
}

Write-Host "Publishing foreground frame rate as feed '$Feed' (0-$Max). Ctrl+C to stop."

$invariant = [Globalization.CultureInfo]::InvariantCulture
$clock = [Diagnostics.Stopwatch]::StartNew()
$columns = $null          # column name -> index, from the CSV header
$windowStart = $null      # when the second being counted began
$frames = @{}             # process id -> frames presented this second
$names = @{}              # process id -> program name

# One CSV row per presented frame, for every program on the system. A private
# session name keeps this out of the way of any other PresentMon capture.
& $presentMon --output_stdout --v1_metrics --exclude_dropped --no_console_stats `
    --session_name OrbItFpsFeed --stop_existing_session |
    ForEach-Object {
        $fields = $_.Split(",")
        if ($null -eq $columns) {
            if ($fields[0] -eq "Application") {
                $columns = @{}
                for ($i = 0; $i -lt $fields.Count; $i++) { $columns[$fields[$i]] = $i }
            }
            return
        }
        if ($fields.Count -lt $columns.Count) { return }

        # PresentMon's own timestamps where it gives them: rows arrive in
        # bursts, so the time a row is read says little about its frame.
        $now = if ($columns.ContainsKey("TimeInSeconds")) {
            [double]::Parse($fields[$columns["TimeInSeconds"]], $invariant)
        } else {
            $clock.Elapsed.TotalSeconds
        }
        if ($null -eq $windowStart) { $windowStart = $now }

        $elapsed = $now - $windowStart
        if ($elapsed -ge 1) {
            $front = [string][OrbIt.Foreground]::ProcessId()
            $fps = [math]::Round([int]$frames[$front] / $elapsed)
            Push-Feed $fps
            Write-Host ("{0,4} fps  {1}" -f $fps, $names[$front])
            $frames = @{}
            $windowStart = $now
        }

        $id = $fields[$columns["ProcessID"]]
        $frames[$id] = 1 + [int]$frames[$id]
        $names[$id] = $fields[$columns["Application"]]
    }

if ($null -eq $columns) {
    # PresentMon explains itself on the console (above) when it can't start.
    Write-Error "PresentMon ($presentMon) exited with code $LASTEXITCODE before reporting any frames."
}
