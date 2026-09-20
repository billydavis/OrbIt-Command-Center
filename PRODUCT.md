# Product

## Register

product

## Users

Owner-operators of an `info-orbs`-derived hardware device (`OrbItWidget`): five
physical round screens they want to assign content to and keep live. They run
this desktop app (Tauri, Windows/macOS/Linux) while at their own desk, often
alongside other work, dipping in to change a screen's control, tweak a form
field, or flip to a saved profile. Technical enough to run `npm run tauri dev`
and read a device's DHCP-assigned IP from a router page; comfortable with
forms, JSON, and status/error states, not a general consumer audience.

## Product Purpose

A single-pane control surface for the 5-screen `OrbItWidget` device: assign a
control per screen (clock, weather, gauge, sysMonitor, ticker, countdown,
custom, etc.), edit its params, see what's dirty vs. applied, and push the
whole layout in one action. Also manages named local profiles and a
background sysMonitor push loop that keeps running from the tray. Success
looks like: the operator always knows the live device state at a glance,
never loses unsaved edits silently, and can recover cleanly when the device
drops off the network.

## Brand Personality

Precise and technical. An instrument panel, not an admin dashboard: dense,
legible, honest about live device/connection state, minimal ornamentation.
Confidence comes from clarity and correctness, not visual flourish.

## Anti-references

Not a generic SaaS dashboard (no hero-metric tiles, gradient accents,
glassmorphism, cheerful corporate admin-panel polish). Not a toylike
consumer smart-home app (no rounded-bubbly cartoonish IoT aesthetic). This
drives physical hardware; it should read as a control surface, not a
marketing-flavored settings screen.

## Design Principles

- Reflect live device truth, not cached assumptions: state (connected,
  dirty, applied, error) is always visible and always correct, since a
  fresh `GET /screens` is the app's own source of truth.
- Instrument-panel density over dashboard whitespace: prioritize legibility
  and information density appropriate to a technical operator, not
  marketing-style breathing room.
- No silent failure: connection loss, dropped requests, and unsaved edits
  are always surfaced, never allowed to go stale quietly.
- Round screens are the product's visual anchor: the five circular tiles
  are the one deliberate physical/playful element in an otherwise precise,
  technical interface — don't compete with them decoratively elsewhere.
- Function over flourish: forms, statuses, and controls should feel like a
  well-made technical tool, not a consumer app performing simplicity.

## Accessibility & Inclusion

Standard best-effort: WCAG AA contrast, respect `prefers-reduced-motion`,
full keyboard navigability for forms and controls. No specific additional
requirement stated.
