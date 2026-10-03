<#
.SYNOPSIS
    The simplest feed publisher: a made-up number that drifts up and down,
    pushed to OrbIt Command Center once a second (docs/feeds-api.md).

.DESCRIPTION
    A starting point for a feed app of your own. Everything a publisher has to
    do is here: come up with a number, POST it to the app under a name, repeat.
    Replace the "next value" part with a real reading and you have a real feed.

    To see it on the orb: run this, then in the app set a screen to Gauge, pick
    "demo.random" as its value source, and Apply.

.EXAMPLE
    .\random-feed.ps1

.EXAMPLE
    .\random-feed.ps1 -Feed demo.load -Max 500 -IntervalSeconds 2
#>
param(
    # The feed to publish. Letters, digits, '.', '_' and '-'.
    [string]$Feed = "demo.random",

    [double]$Min = 0,
    [double]$Max = 100,

    # The app passes a value on to the orb at most once a second, so pushing
    # faster than that isn't seen.
    [double]$IntervalSeconds = 1
)

$url = "http://127.0.0.1:47800/feeds/$Feed"
$random = New-Object System.Random

# The value drifts toward a target, covering a fraction of the remaining
# distance each step - quick at first, easing in as it arrives - and picks a
# new random target once it gets there. That's what makes it move smoothly
# rather than jump around.
$value = ($Min + $Max) / 2
$target = $value

Write-Host "Publishing feed '$Feed' ($Min-$Max) to $url. Ctrl+C to stop."

# The first push describes the feed: a label and range the app offers when
# someone picks it for a gauge. After that, the number alone is enough.
$body = @{ value = $value; label = "Demo"; min = $Min; max = $Max }

while ($true) {
    try {
        Invoke-RestMethod -Method Post -Uri $url -ContentType "application/json" `
            -Body ($body | ConvertTo-Json -Compress) -TimeoutSec 2 | Out-Null
        Write-Host ("{0,8:N1}" -f $value)
    } catch {
        # Most likely the app isn't running. Keep going; it may start later.
        Write-Warning "Push failed: $($_.Exception.Message)"
    }

    Start-Sleep -Milliseconds ($IntervalSeconds * 1000)

    # Next value.
    if ([math]::Abs($target - $value) -lt ($Max - $Min) * 0.02) {
        $target = $Min + $random.NextDouble() * ($Max - $Min)
    }
    $value += ($target - $value) * 0.2
    $body = @{ value = [math]::Round($value, 1) }
}
