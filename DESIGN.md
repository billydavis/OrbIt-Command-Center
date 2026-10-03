---
name: OrbIt Command Center
description: Desktop control surface for a 5-screen info-orbs hardware device
colors:
  ink: "oklch(20% 0.006 230)"
  paper: "oklch(97% 0.004 230)"
  surface: "oklch(99% 0.002 230)"
  ink-dark-bg: "oklch(23% 0.008 230)"
  paper-dark-text: "oklch(93% 0.004 230)"
  signal-cyan: "oklch(58% 0.12 205)"
  live-green: "oklch(56% 0.13 148)"
  pending-amber: "oklch(68% 0.15 70)"
  alert-red: "oklch(55% 0.19 25)"
  surface-tint: "oklch(55% 0.006 230 / 10%)"
  divider: "oklch(55% 0.006 230 / 22%)"
typography:
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  heading:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.005em"
  subheading:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "normal"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "24px"
    letterSpacing: "normal"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: "normal"
    letterSpacing: "normal"
  nameplate:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "normal"
    letterSpacing: "0.06em"
  mono:
    fontFamily: "ui-monospace, 'Cascadia Code', Consolas, 'SFMono-Regular', monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: "normal"
    letterSpacing: "0.02em"
rounded:
  sm: "8px"
  circle: "50%"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.6em 1.2em"
  screen-tile-circle:
    rounded: "{rounded.circle}"
    width: "96px"
    height: "96px"
  profile-card:
    backgroundColor: "{colors.surface-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.6rem 0.8rem"
---

# Design System: OrbIt Command Center

## 1. Overview

**Creative North Star: "The Control Panel"**

Colors moved from the unmodified Tauri/Vite starter (one saturated
corporate blue, flat `rgba(0,0,0,…)` shadows) to a deliberate instrument-
panel vocabulary: OKLCH neutrals tinted toward a single cool hue (230°) so
every grey reads as one family, and four single-purpose signal colors
borrowed from literal panel indicator lights rather than SaaS convention —
cyan for the thing you're pointed at, green for "the device is live", amber
for "unapplied", red for "wrong". Typography moved from an unstyled webfont
claim (`Inter`, never actually loaded, silently falling back per-OS) to a
native system-font stack at a real fixed scale, plus a mono/tabular-nums
treatment reserved for the numbers a technical operator actually reads off
this thing: screen index, countdown remaining-seconds. Layout is the
"Workbench": a left rail holding profiles and feeds, always in view, beside
the row of five screens and the selected screen's editor (see section 5).

Every surface exists to answer one question at a glance ("is this screen's
config live, dirty, or in error?"), not to look designed. This explicitly
rejects generic SaaS dashboard polish (hero-metric tiles, gradient accents,
glassmorphism) and toylike consumer smart-home styling (rounded-bubbly
cartoonish IoT chrome), per PRODUCT.md's anti-references. It also
deliberately avoids the two reflex answers for "hardware control tool":
generic corporate blue-as-brand, and terminal-green-on-black hacker
aesthetics. The signal colors here are borrowed from physical instrument
panels, not software convention.

**Key Characteristics:**
- One neutral hue family (230°, cool blue-grey) carries nearly the whole
  surface, in OKLCH so light and dark mode share one recipe.
- Four signal colors, each with exactly one meaning, never decorative:
  cyan (selection/primary), green (connected), amber (unapplied), red
  (error).
- A native system-font stack at a fixed six-step rem scale (12/13/16/18/22/28px);
  no webfont, no fluid `clamp()`, no fabricated Inter dependency.
- A dedicated mono/tabular-nums treatment (`.mono-num`) for the numbers an
  operator actually reads: screen index, countdown seconds remaining.
- Flat by default: shadow is reserved for objects that read as physical
  (buttons, the five round screen tiles), never for panels or sections.
- The five round screen tiles are the one deliberate physical element in an
  otherwise plain, forms-and-status interface.

## 2. Colors

Restrained by strategy: one cool neutral family plus four semantic signal
colors, each reserved for exactly one meaning. Nothing here is decorative.

### Primary
- **Signal Cyan** (`oklch(58% 0.12 205)`, dark mode `oklch(72% 0.11 205)`):
  the pointer, not the brand. Marks the selected screen tile's border,
  button/input hover and focus-visible, and active-state borders. Reads as
  an oscilloscope trace rather than a corporate accent, deliberately
  avoiding the saturated indigo-blue that "tech tool" defaults to.

### Status
- **Live Green** (`oklch(56% 0.13 148)`, dark `oklch(72% 0.13 148)`): the
  connection-status dot next to "Connected to `{host}`" only. Means "the
  device answered," nothing else.
- **Pending Amber** (`oklch(68% 0.15 70)`, dark `oklch(76% 0.15 70)`): the
  screen-tile dirty dot only. Means "this screen has unapplied edits."
- **Alert Red** (`oklch(55% 0.19 25)`, dark `oklch(70% 0.17 25)`): form
  validation errors, connection errors, and the background-error banner.

### Neutral
- **Ink** (`oklch(20% 0.006 230)`, dark-mode text `oklch(93% 0.004 230)`):
  primary text, and inverted, the screen-tile circle background in light
  mode.
- **Paper** (`oklch(97% 0.004 230)`, dark-mode background
  `oklch(23% 0.008 230)`): page background; inverted, the screen-tile
  circle's fill in dark mode.
- **Surface** (`oklch(99% 0.002 230)`, dark `oklch(28% 0.01 230)`): buttons
  and inputs, one step off the page background so controls read as
  distinct objects without a border.
- **Surface Tint** (`oklch(55% 0.006 230 / 10%)`): the only "raised"
  surface in the system, used solely for profile cards and the pressed
  button state.
- **Divider** (`oklch(55% 0.006 230 / 22%)`): the top-border rule
  separating the screen editor and profiles sections from the grid above.

### Named Rules
**The One Meaning Rule.** Each signal color (cyan, green, amber, red) means
exactly one thing everywhere it appears, and appears nowhere else. Reusing
amber for anything but "unapplied," for instance, is a spec violation, not
a style choice.
**The Panel-Light Rule.** Signal colors are chosen the way physical
instrument-panel indicator lights are chosen (cyan/green/amber/red), not
the way software brand palettes are chosen. If a color could be swapped for
"whatever the brand guide says," it doesn't belong here.

## 3. Typography

**Body Font:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` — one native OS stack carries every role; no webfont is loaded.
**Mono Font:** `ui-monospace, "Cascadia Code", Consolas, "SFMono-Regular", monospace` — the raw-JSON editor and every `.mono-num` numeric readout.

**Character:** System-native by design, per the product register's
permission to use familiar sans defaults rather than a claimed-but-never-
loaded webfont. A fixed rem scale, six steps at a tight ~1.15-1.2 ratio
between neighbors: this is a dense control surface, not a page that needs
room to breathe. Weight and letter-spacing carry as much hierarchy as size
does — see the Named Rules below.

### Hierarchy
- **Title** (700, 1.75rem/28px, line-height 1.15, letter-spacing -0.01em):
  the app's single `<h1>`, "OrbIt Command Center."
- **Heading** (600, 1.375rem/22px, line-height 1.2): the screen-editor's
  "Screen `N`" heading.
- **Subheading** (600, 1.125rem/18px): the profiles-section "Profiles"
  heading.
- **Body** (400, 1rem/16px, 24px line-height): form inputs, button labels,
  connection status text. Never smaller than 16px, regardless of what
  ancestor label wraps it (see the Never-Shrink-Input Rule).
- **Label** (500, 0.8125rem/13px): field captions, hints, error text.
- **Nameplate** (500, 0.75rem/12px, letter-spacing 0.06em, uppercase): the
  screen tile's own name tag ("SCREEN 0") beneath each circle.
- **Mono** (400, 0.8125rem/13px, letter-spacing 0.02em, tabular-nums): the
  `custom` control's raw JSON editor, and via `.mono-num`, live numeric
  readouts (screen index inside the tile, countdown seconds remaining).

### Named Rules
**The Never-Shrink-Input Rule.** A `<label>`'s caption text may run at
`--text-sm` (13px), but the `<input>`/`<select>` it wraps is always reset
back to `--text-base` (16px). Inheriting the caption's smaller size into
what the user types is an accessibility regression, not a style choice.
**The One Mono Rule.** Monospace only ever means "this is data the device
will parse literally" (raw JSON) or "this is a live number worth reading
precisely" (index, countdown). It never appears for decoration.

## 4. Elevation

Flat by default. The system does not use panel or section elevation at
all: the screen editor and profiles sections are separated from the grid
above by a 1px divider, not a shadow or raised surface. Shadow is reserved
for objects that read as physical, discrete controls: buttons
(`box-shadow: 0 2px 2px oklch(20% 0.01 230 / 18%)`) and the round screen
tiles (`box-shadow: 0 2px 6px oklch(20% 0.01 230 / 18%)`). The shadow color
is tinted to the same neutral hue as everything else, not a flat black.

### Shadow Vocabulary
- **Control shadow** (`box-shadow: 0 2px 2px var(--color-shadow)`): buttons
  and inputs, signaling "this is a pressable/editable object."
- **Tile shadow** (`box-shadow: 0 2px 6px var(--color-shadow)`): the five
  round screen tiles, the system's one deliberately physical element.

### Named Rules
**The Flat Panel Rule.** No panel, card grouping, or section ever gets a
shadow. Shadow is earned only by objects meant to read as physical controls.

## 5. Components

Blunt and legible: nothing calls attention to itself except live state
(the dirty dot, error text, connection status). No decorative treatment on
any component.

### Buttons
- **Shape:** 8px corner radius (`border-radius: 8px`)
- **Primary:** Surface background / ink text at rest; border shifts to
  Signal Cyan on hover/focus-visible — no separate "primary" vs.
  "secondary" button style exists yet.
- **Hover / Focus:** `border-color: var(--color-signal)`; active state
  darkens the border to `var(--color-signal-active)` and fills with
  Surface Tint.

### Cards (Profile Card)
- **Corner Style:** 8px radius
- **Background:** Surface Tint (`rgba(128, 128, 128, 0.12)`), the system's
  only raised-looking surface
- **Shadow Strategy:** none — flat, per the Flat Panel Rule
- **Internal Padding:** `0.6rem 0.8rem`

### Inputs / Fields
- **Style:** 8px radius, transparent border, paper/ink-98 background,
  matching the Control shadow
- **Error:** `#d33` text below the field, 0.85em
- **Hint:** ink/paper text at 0.7 opacity, 0.85em

### Screen Tile (signature component)
The five round tiles are the product's visual anchor. Each is a 96px
circle showing a drawing of what that screen shows on the orb
(`ScreenPreview`): the real time, a gauge following its feed, the
sysMonitor readings, and a likeness for what only the device fetches
(weather, a ticker's price). The drawing uses the orb's own colors on black
glass, so it looks the same in either theme and is the one place literal
colors are allowed. An amber dirty-dot sits top-right when unapplied, and
a nameplate under the circle carries the index and what's on it (the feed
id, in mono, for a screen following a feed). The same drawing, small and
still, stands in for a control in the picker and for each screen in a
saved profile.

Selection is an **offset ring**: a 3px Signal ring held 4px off the
circle by a page-colored gap (box-shadow, not border), so it reads as a
bezel around the active screen. While a screen is selected, the other
four **step back**: their fill and label blend toward the page with
`color-mix()` (not `opacity`, which would also dim the dirty dot), and
return to full strength on hover or keyboard focus. Keyboard focus is a
thinner 2px version of the same ring.

### Connection Status (signature component)
The "Connected to `{host}`" line in the connected bar carries a small
Live Green dot (`.connected-status-dot`, 8px, `aria-hidden`) ahead of the
text, the same visual grammar as the screen tile's dirty dot: a colored
dot means live device state, never decoration.

### Status Bar
A 2rem strip fixed to the window's bottom edge while connected, fed by the
heartbeat's `GET /api/v1/system`: on the left, the orb's own details (hostname + IP, uptime, free heap,
firmware build date); at the far right, set apart as the one thing that
isn't the orb, the WiFi network with a four-bar signal meter and dBm.
Flat (page background, 1px divider on top, no shadow) and entirely
neutral: signal strength is shown by bar count, not color, since none of
these readings is one of the four states the signal colors are reserved
for. Numbers use `.mono-num`; labels stay in the body font.  Below 860px wide, uptime/heap/build drop out
before anything truncates.

### Workbench layout
Connected, the body is two columns. A 250px **rail** runs the full height
of the window's left edge, on its own neutral (`--color-rail`, one step
darker than the page in either theme: the second neutral layer a sidebar
gets), and scrolls separately from the main column. It holds
Profiles (one row each: the name and five small screen pictures; clicking
the row applies it and leaves it highlighted until the layout is next
changed. Right-clicking a row (or the keyboard's menu key) opens a
small menu with Apply, Update with current layout and Delete, so nothing
in the row moves on hover. A plus in the heading saves the current layout) and Feeds (id, live value, a thin bar for where the value sits
in its range; clicking one puts it on the selected screen as a draft).
Nothing lives behind a drawer except feed details (ages, deleting, the
push address). The main column is the screen row, then the editor in two
columns: every control pictured in a grid, and the chosen control's
settings beside it. Under 1080px the editor stacks; under 940px the rail
drops below the screens. The window can't be made narrower than 680px, so
the screen row always fits without scrolling sideways.

### Title bar (Windows)
On Windows the native title bar is off (`src-tauri/tauri.windows.conf.json`)
and the header is the title bar: it spans the full window width, drags the
window from anywhere that isn't a control, and ends in flat, square
minimize, maximize/restore and close buttons flush in the corner (close
turns Alert Red on hover). The page itself never scrolls; only the body
under the header does, so the scrollbar never runs up beside those
buttons. Drawers start below the header for the same reason. macOS and
Linux keep their native title bars and show no window buttons of ours.
Interface text is not selectable, except what someone would copy: inputs,
error messages, the connection address and the status bar.

### Apply controls
The header is sticky and reads left to right: the app's icon, the title,
then the connection status as plain text (no menu of its own); at the
right, the apply controls. The icon is the menu button, as a Windows
title bar's is: it opens Refresh,
Disconnect and Appearance; Appearance opens in that same panel, not a
modal, since its changes apply instantly and the app behind it is what
you are watching. With unapplied changes the apply controls are:
a discard icon button (tooltip "Discard changes"), and **Apply Layout**, the app's one
filled button, in Pending Amber because what it carries is the unapplied
state. With none: the plain text "Orb matches what you see".

## 6. Do's and Don'ts

### Do:
- **Do** reserve each signal color for exactly one meaning: cyan for
  selection/primary action, green for connected, amber for unapplied, red
  for error. Never repurpose one for a fifth meaning.
- **Do** keep panels, sections, and cards flat (no shadow); reserve shadow
  for the buttons and the five round screen tiles.
- **Do** define color in OKLCH and tint every neutral toward the 230°
  signal hue; never a flat, untinted grey.
- **Do** use the six-step fixed rem scale (`--text-xs` through
  `--text-xl`); never an arbitrary `em`/`px` value outside it.
- **Do** run live numeric readouts through `.mono-num` (mono,
  tabular-nums); never render them in the body sans.
- **Do** keep every `<input>`/`<select>` at `--text-base` (16px) even
  inside a smaller-captioned `<label>`.

### Don't:
- **Don't** build a generic SaaS dashboard: no hero-metric tiles, gradient
  accents, or glassmorphism, per PRODUCT.md.
- **Don't** style toward a toylike consumer smart-home look: no
  rounded-bubbly cartoonish IoT chrome, per PRODUCT.md.
- **Don't** reach for a saturated corporate blue or a terminal-green
  hacker palette; both are the reflex answer for "hardware control tool"
  and this system deliberately avoids both.
- **Don't** add card elevation or layered surfaces; this system is flat by
  design, not by omission.
- **Don't** use `border-left`/`border-right` colored stripes as an accent
  on cards or list items.
- **Don't** claim a webfont (`Inter`) that isn't actually loaded; use the
  native system stack, which is a legitimate, deliberate choice here, not
  a fallback of convenience.
- **Don't** set body text below 16px, even in a compact form field.
