# feeds-api specification

A **feed** is a named live number held by OrbIt Command Center. A screen can follow one — today, a `gauge`'s value — and the app keeps the orb showing its latest reading. This is the local HTTP endpoint other programs use to publish feeds of their own.

A program pushing a feed doesn't need to know the orb's address, which screen (if any) shows its number, or how that gauge is styled. It posts a value under a name; what happens to it is decided in the app.

## Base URL

```
http://127.0.0.1:47800
```

The endpoint is up whenever the app is running, including from the tray and with no orb connected. It listens on the loopback address only, so only programs on the same PC can reach it. There is no authentication.

If port `47800` is already in use when the app starts, the endpoint doesn't come up; the Feeds panel says so.

## Feed ids

1-64 characters from `A-Z a-z 0-9 . _ -`. Dots are just a naming convention (`build.progress`, `claude.tokens`).

Ids starting with `sys.` are the app's own feeds and can't be written or deleted here:

| id | reading |
|----|---------|
| `sys.cpu` | CPU use, percent |
| `sys.ram` | RAM use, percent |
| `sys.gpu` | GPU use, percent (NVIDIA only) |
| `sys.gpuTemp` | GPU temperature, °C (NVIDIA only) |

`sys.cpu` and `sys.ram` update every 5 seconds. The GPU feeds exist only on machines where `nvidia-smi` works, and only update while a screen is showing them (a gauge following one, or a `sysMonitor` screen).

## Endpoints

### `POST /feeds/{id}`

Creates the feed, or updates it. `Content-Type: application/json` is required.

The body is either a bare number:

```
42
```

or an object:

```json
{ "value": 42, "label": "Build", "min": 0, "max": 200 }
```

| field | meaning |
|-------|---------|
| `value` | Required. A finite number. |
| `label` | Optional, up to 64 characters. A name to show for the feed. |
| `min`, `max` | Optional numbers. The range the value moves in. |

`label`, `min` and `max` are **hints**. They pre-fill a gauge's form when someone picks the feed as its source, and nothing more: once a gauge is set up, its own label and range are what the orb shows, whatever later pushes say. A hint left out of a push keeps its earlier value, so a program can describe its feed once and send bare numbers after that. Unknown fields are ignored.

The response is the feed as stored:

```json
{ "id": "build.progress", "value": 42.0, "label": "Build", "min": 0.0, "max": 200.0, "source": "external", "updatedAt": 1790000000000 }
```

`updatedAt` is wall-clock milliseconds since the Unix epoch.

### `GET /feeds`

Every feed, built in and external, sorted by id:

```json
{ "feeds": [ { "id": "build.progress", "value": 42.0, "source": "external", "updatedAt": 1790000000000 } ] }
```

### `GET /feeds/{id}`

One feed, same shape as an entry above. `404` if there's no such feed.

### `DELETE /feeds/{id}`

Removes an external feed. `204` with no body. A screen that was following it keeps its last value and stays bound, so it picks the feed up again if it's pushed once more.

## Errors

Same shape as the orb's own API:

```json
{ "error": "'value' must be a finite number" }
```

| status | when |
|--------|------|
| `400` | Bad id, missing or non-numeric `value`, wrong type for a hint, malformed JSON, or a missing `Content-Type: application/json` |
| `403` | Writing or deleting a `sys.` feed |
| `404` | Reading or deleting a feed that doesn't exist |
| `507` | Creating a feed when 200 already exist |

## How a value reaches a screen

1. In the app, set a screen to `gauge`, choose the feed as its **Value source**, and Apply.
2. Once a second the app compares each bound screen with its feed and, if the value changed, writes it to the orb. Pushing faster than that is harmless but won't be seen.
3. If the feed goes quiet, the gauge keeps its last value. The Feeds panel shows each feed's age and dims one that hasn't been published for a minute.

The gauge shows whole numbers, with a `%` after them only when its range is exactly 0-100.

Feeds live in memory: after the app restarts, an external feed is gone until its program pushes again. Which screen follows which feed is saved, and is part of a saved profile.

## Examples

The one to start from: [`examples/random-feed.ps1`](../examples/random-feed.ps1) publishes a made-up number that drifts smoothly up and down, as `demo.random`. It needs nothing but Windows PowerShell, and is everything a publisher has to do in about forty lines — swap its "next value" step for a real reading.

A real one: [`examples/fps-feed.ps1`](../examples/fps-feed.ps1) pushes the frame rate of whatever program is in the foreground as the `fps` feed, once a second. It needs PresentMon (a single downloaded exe) and an elevated PowerShell; the comment at the top of the script has the details.

One-off pushes:

curl (in PowerShell, use `curl.exe`):

```
curl -H "Content-Type: application/json" -d 42 http://127.0.0.1:47800/feeds/build.progress
```

PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:47800/feeds/build.progress `
  -ContentType "application/json" -Body '{"value": 42, "label": "Build"}'
```

Python:

```python
import json, urllib.request

def push(feed, value, **hints):
    body = json.dumps({"value": value, **hints}).encode()
    req = urllib.request.Request(
        f"http://127.0.0.1:47800/feeds/{feed}", data=body, method="POST",
        headers={"Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=2).close()

push("build.progress", 42, label="Build")
```
