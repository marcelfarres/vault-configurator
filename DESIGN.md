---
name: VAULT configurator
description: A calm, hairline-ruled planning bench where filament colours carry the colour and one teal marks what is selected.
colors:
  bench-paper: "oklch(0.975 0.003 90)"
  card-stock: "oklch(0.995 0.002 90)"
  bench-ink: "oklch(0.21 0.006 286)"
  ink-reverse: "oklch(0.985 0.002 90)"
  pressed-grey: "oklch(0.94 0.004 286)"
  recess: "oklch(0.95 0.003 286)"
  pencil-grey: "oklch(0.52 0.012 286)"
  hairline: "oklch(0.91 0.004 286)"
  field-edge: "oklch(0.62 0.008 286)"
  bench-teal: "oklch(0.52 0.07 195)"
  teal-wash: "oklch(0.93 0.03 190)"
  deep-teal: "oklch(0.35 0.06 195)"
  plate-bed: "oklch(0.90 0.004 286)"
  plate-grid: "oklch(0.79 0.004 286)"
  cabinet-frame: "oklch(0.28 0.006 286)"
  caution: "oklch(0.50 0.11 60)"
  fault: "oklch(0.52 0.16 25)"
  confirmed: "oklch(0.48 0.09 155)"
  caution-wash: "oklch(0.955 0.035 80)"
  fault-wash: "oklch(0.955 0.022 25)"
  confirmed-wash: "oklch(0.955 0.035 155)"
  selection: "oklch(0.86 0.06 192)"
typography:
  headline:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "1.55rem"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "-0.02em"
  title:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.45
  body:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
  note:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "0.86rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 400
    lineHeight: 1.45
  wordmark:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "0.14em"
  mono:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.86rem"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  sm: "0.45rem"
  md: "0.5rem"
  lg: "0.65rem"
  xl: "0.7rem"
  full: "999px"
spacing:
  xs: "0.35rem"
  sm: "0.65rem"
  md: "1rem"
  lg: "1.25rem"
components:
  button:
    backgroundColor: "{colors.card-stock}"
    textColor: "{colors.bench-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "0.3rem 0.75rem"
    height: "2.25rem"
  button-primary:
    backgroundColor: "{colors.bench-ink}"
    textColor: "{colors.ink-reverse}"
    rounded: "{rounded.lg}"
    padding: "0.3rem 0.75rem"
    height: "2.25rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.bench-ink}"
    rounded: "{rounded.lg}"
    padding: "0.3rem 0.75rem"
    height: "2.25rem"
  chip:
    backgroundColor: "{colors.card-stock}"
    textColor: "{colors.bench-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0.12rem 0.55rem"
    height: "1.7rem"
  chip-selected:
    backgroundColor: "{colors.pressed-grey}"
  chip-export-selected:
    backgroundColor: "{colors.teal-wash}"
    textColor: "{colors.deep-teal}"
  status-chip:
    backgroundColor: "transparent"
    textColor: "{colors.pencil-grey}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0.12rem 0.55rem"
    height: "1.7rem"
  input:
    backgroundColor: "{colors.card-stock}"
    textColor: "{colors.bench-ink}"
    rounded: "{rounded.md}"
    padding: "0.4rem 0.55rem"
    height: "2.25rem"
  card:
    backgroundColor: "{colors.card-stock}"
    textColor: "{colors.bench-ink}"
    rounded: "{rounded.lg}"
    padding: "1rem 1.05rem 1.1rem"
  layer-row:
    backgroundColor: "{colors.recess}"
    rounded: "{rounded.xl}"
    padding: "0.45rem 0.55rem"
  layer-row-open:
    backgroundColor: "{colors.teal-wash}"
  hint:
    backgroundColor: "{colors.recess}"
    textColor: "{colors.pencil-grey}"
    typography: "{typography.note}"
    rounded: "{rounded.md}"
    padding: "0.55rem 0.7rem"
  tab:
    textColor: "{colors.pencil-grey}"
    padding: "0.7rem 0.1rem 0.55rem"
    height: "2.5rem"
  tab-selected:
    textColor: "{colors.bench-ink}"
  swatch:
    rounded: "{rounded.sm}"
    size: "2.2rem"
---

# Design System: VAULT configurator

## Overview

**Creative North Star: "The Neutral Bench"**

A clean workbench that lets the user's own filament colours and the designer's real renders be the loudest colour in the room. The chrome is warm off-white paper, ink-dark text, and hairline rules; the one accent is a muted teal that means "this is selected, on or in progress": the current tab, the open layer, a switch that is on, a plate marked printed, the focus ring. Everything else that carries colour is data: a swatch, a drawer front in the stack preview, a part on a plate bed. When the interface stays this quiet, a wrong number or an unprintable part is the loudest thing on screen.

The mood is calm, precise and restrained. Density is real, because this is a planner with part lists, plate beds and printer fleets, but it is held together by a single rhythm of hairline borders, small even gaps and consistent control heights rather than by decoration. Controls are refined and restrained: soft corners, ink-filled primary actions, no gradients, no flourish.

This is an independent tool with a neutral identity (see PRODUCT.md). Nothing here borrows the VAULT or USSA Design look.

**Key Characteristics:**
- Colour belongs to the user's filaments; the UI itself is paper, ink and one teal that marks selection and state.
- Flat by default: depth is tonal layering (paper, card stock, recess) plus a single whisper of shadow.
- Hairline borders do the structural work that fills and shadows do elsewhere.
- Plex Sans for everything; Plex Mono only for measured dimensions.
- Light and dark themes share one set of semantic token names and one warm-neutral hue family, each composed on its own.
- Desktop-first, mouse and keyboard; one breakpoint at 900px.

## Colors

A warm-neutral paper palette with one desaturated teal, plus three signal colours that appear as text and, on full-width message lines only, as a faint matching wash. Values are OKLCH and the frontmatter is the source of truth. The tokens below are the light theme; the dark theme follows.

### Primary
- **Bench Ink** (`oklch(0.21 0.006 286)`): body text, the filled primary button, and the outline stroke around parts on a plate bed. It is a near-black with a barely perceptible cool lean.
- **Ink Reverse** (`oklch(0.985 0.002 90)`): text and icons on top of Bench Ink.

### Secondary
- **Bench Teal** (`oklch(0.52 0.07 195)`): the only accent, and it marks selection and state, never decoration. It paints the focus ring, the selected-tab underline, the "on" switch track, the progress fill, the text caret, the link underline, hover and checked borders on cards, and the native `accent-color` for checkboxes and radios. It is never a large fill.
- **Teal Wash** (`oklch(0.93 0.03 190)`) with **Deep Teal** (`oklch(0.35 0.06 195)`) text: the quiet "this is on" tint for the open layer row, the backbone pill and selected printer chips in the export row. Deep Teal is also the link colour (10.8:1 on Card Stock).
- **Selection** (`oklch(0.86 0.06 192)`): the text-selection highlight, with Bench Ink text (11.9:1).

### Neutral
- **Bench Paper** (`oklch(0.975 0.003 90)`): the page background and top bar.
- **Card Stock** (`oklch(0.995 0.002 90)`): cards, buttons, inputs, menus. Barely lighter than the page, separated by a hairline rather than a shadow.
- **Recess** (`oklch(0.95 0.003 286)`): sunken wells, layer rows, piece cards, hints, the preview canvas and the progress track.
- **Pressed Grey** (`oklch(0.94 0.004 286)`): selected chips and the off state of switches.
- **Pencil Grey** (`oklch(0.52 0.012 286)`): secondary text, table headers, inactive tabs, the quiet half of any label pair.
- **Hairline** (`oklch(0.91 0.004 286)`): every structural border and row divider.
- **Field Edge** (`oklch(0.62 0.008 286)`): borders on inputs, selects and filament swatches, and the scrollbar thumb. It is the one border that meets 3:1 on Card Stock (3.6:1), so an editable control and a filament colour are visible without relying on fill.

### Plate and cabinet drawing
- **Plate Bed** (`oklch(0.90 0.004 286)`), **Plate Grid** (`oklch(0.79 0.004 286)`): the print bed and its 0.35-unit grid lines.
- **Cabinet Frame** (`oklch(0.28 0.006 286)`): the stroke of the stack preview drawing.

### Signal
- **Caution** (`oklch(0.50 0.11 60)`), **Fault** (`oklch(0.52 0.16 25)`), **Confirmed** (`oklch(0.48 0.09 155)`): text colour for fit warnings, errors and passing checks, each at least 5:1 on Card Stock, Bench Paper and Recess.
- **Caution Wash** (`oklch(0.955 0.035 80)`), **Fault Wash** (`oklch(0.955 0.022 25)`), **Confirmed Wash** (`oklch(0.955 0.035 155)`): a faint background behind a full-width message line (a `p` with `warn`, `bad` or `ok`), so a blocking message such as "does not fit an export printer" is found at a glance. Inline status words in a table or row stay text-only.

### Dark theme
Dark is switched by a `dark` class on `<html>`, set before first paint from `localStorage["vault-theme"]` (light, dark or system). It is a warm-neutral graphite in the same hue family as light (hue 286 and 90, chroma at most 0.008), composed for its own contrast and not inverted from light.

- **Surfaces:** page `oklch(0.165 0.006 286)`, card `oklch(0.205 0.007 286)`, recess `oklch(0.255 0.007 286)`, secondary `oklch(0.28 0.007 286)`. Each step is a visible tonal lift, since a dark card cannot rely on a shadow.
- **Text:** foreground `oklch(0.955 0.004 90)`, muted `oklch(0.72 0.01 286)` (7.2:1 on card), the inverted primary button `oklch(0.93 0.006 90)` with `oklch(0.18 0.006 286)` text.
- **Lines:** Hairline `oklch(0.31 0.007 286)`; Field Edge `oklch(0.54 0.008 286)` (3.5:1 on card).
- **Teal:** `oklch(0.74 0.075 195)` for rings, underlines and switch tracks (8.0:1 on card); wash `oklch(0.30 0.045 195)` with `oklch(0.85 0.07 195)` text.
- **Signal:** text `oklch(0.80 0.11 75)`, `oklch(0.76 0.13 25)`, `oklch(0.78 0.10 155)` (at least 7.9:1 on card); washes `oklch(0.27 0.045 75)`, `oklch(0.265 0.05 25)`, `oklch(0.26 0.04 155)`.
- **Plate bed:** `oklch(0.36 0.006 286)` with grid `oklch(0.46 0.006 286)`; part outlines `oklch(0.97 0.004 90)`.

### Named Rules
**The Filaments-First Colour Rule.** The loudest hue on any screen is a filament colour (swatches, dots, plate parts, the stack preview). The interface adds only Bench Teal, and only to mark selection, state or focus. Do not introduce a second accent.

**The Quiet Wash Rule.** Caution, Fault and Confirmed colour text. Only a full-width message line may also carry the matching faint wash, with no border, no icon and no saturated fill. A warning is still a sentence, not a banner.

## Typography

**Display Font:** none. There is no display face.
**Body Font:** IBM Plex Sans (with Segoe UI, sans-serif), loaded from Google Fonts at 400, 500 and 600.
**Label/Mono Font:** IBM Plex Mono (with ui-monospace), 400 and 500, used only for measured dimensions.

**Character:** A technical-humanist sans with a matching mono. It is engineered enough to be trusted with millimetres and plain enough to disappear. Hierarchy comes from weight and size in small steps, not from a second typeface.

### Hierarchy
- **Headline** (600, 1.55rem, 1.45, -0.02em): the one `h1` per page, e.g. "Design", "Parts".
- **Title** (600, 1rem): card titles (`h2`). Plate card titles (`h3`) step down to 0.95rem 600.
- **Body** (400, 1rem, 1.45): controls, rows and part names. Names inside rows are `strong` (a weight bump, not a size change).
- **Note** (400, 0.86rem): secondary text, hints, table body (0.88rem), field help. Colour is Pencil Grey.
- **Label** (400, 0.8rem): chips, pills, status chips and preview meta.
- **Wordmark** (600, 0.95rem, +0.14em, caps): "VAULT" in the top bar. The only tracked-out text.
- **Mono** (400, 0.86rem): the W × D × H line under the preview and other measured values.

### Named Rules
**The Millimetre Rule.** Measured dimensions, sizes and coordinates are set in Plex Mono so figures align and read as data. Prose never uses it.

**The Weight-Not-Size Rule.** Emphasis inside a row is weight (500 or 600), never a larger size.

## Layout

A top bar, a numbered step nav, then a single page column.

- **Container:** the page content is capped at 1180px with 1.25rem side padding, left-aligned (not centred), which keeps long rows scannable on wide monitors.
- **Top bar:** one wrapping flex row with `0.55rem 0.75rem` gaps. Brand and project name, Save, Load, enabled printers, filament dots and count, fit controls, then Settings pushed to the far end. It wraps rather than collapses.
- **Compose layout:** a two-column grid, `minmax(0, 1.2fr) minmax(280px, 0.8fr)` with a 1rem gap. Controls take the wide column; the live Preview card takes the narrow one.
- **Collections:** part pieces use `repeat(auto-fit, minmax(180px, 1fr))` at 0.6rem; plate cards use `minmax(240px, 1fr)` at 0.8rem. Settings is an 11rem nav plus a content column.
- **Spacing rhythm:** a small even set rather than a strict scale: 0.35rem (inside a control group), 0.65rem (between related rows), 1rem (between cards and columns), 1.25rem (page edge). Rows divide with a Hairline border, not extra whitespace.
- **Control height:** buttons, fields and checks are 2.25rem tall, tabs 2.5rem, chips 1.7rem. Touch targets are not the goal; consistent rhythm is.
- **Responsive:** one breakpoint at 900px collapses the compose, settings and colour-role grids to a single column. The tool is desktop-first; phone use is not a requirement.

### Named Rules
**The One Column Collapse Rule.** Below 900px every multi-column grid becomes a single column in source order. Do not invent intermediate layouts.

## Elevation & Depth

Flat by default. Depth is conveyed by tonal layering: Bench Paper is the floor, Card Stock sits barely above it with a Hairline border, and Recess sinks wells (layer rows, hints, the preview canvas, progress tracks) below it. There is one shadow in the whole system.

### Shadow Vocabulary
- **Card whisper** (`box-shadow: 0 1px 2px oklch(0.21 0.006 286 / 6%)`): cards and the current item in the settings nav. It is a contact line, not a lift.

Popover menus (`.menu`) and the 3D viewer overlay sit above the page by `z-index` and a Hairline border or a dim scrim (`oklch(0.13 0.006 286 / 88%)`), not by shadow. In dark, the Card whisper is `0 1px 2px oklch(0 0 0 / 30%)`.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest and nothing lifts on hover. Hover is a colour or border change (a menu item sinks to Recess, a part card takes a teal edge, an inactive tab darkens to ink), never a shadow or a movement.

## Shapes

Soft but not round. Corners sit between 0.45rem and 0.7rem (`--radius` is 0.5rem; cards are `calc(0.5rem + 0.15rem)`; buttons 0.65rem; layer rows and piece cards 0.7rem). Pills, chips, dots and the switch are fully round (999px). Borders are always 1px hairlines; the only 2px strokes are the tab underline, the focus ring and part outlines on plates. There is no clipping, no skew and no decorative geometry; the only drawn geometry is the real stack elevation and the real plate beds.

**Known drift:** the 0.65rem and 0.7rem radii differ by under a pixel and are not a deliberate pair; the menu button radius (0.4rem) and swatch radius (0.45rem) are similarly close. Fold them into one step when next touched.

## Components

All components are refined and restrained: hairline-bordered, ink-filled when primary, flat at rest.

### Buttons
- **Shape:** gently curved (0.65rem), 2.25rem tall, `0.3rem 0.75rem` padding, 1px Hairline border.
- **Default:** Card Stock fill, Bench Ink text.
- **Primary:** Bench Ink fill, Ink Reverse text. The same treatment marks the active option inside a segmented control (`aria-pressed="true"`).
- **Ghost:** transparent fill.
- **Icon button:** 2rem circle, no border, Pencil Grey, used for row actions.
- **Hover / Focus:** hover is not styled on buttons beyond the browser default; focus is a 2px Bench Teal outline with a 2px offset on every focusable element.

### Chips and pills
- **Style:** fully round, 1.7rem tall, `0.12rem 0.55rem` padding, 0.8rem label type, Hairline border.
- **Selected:** Pressed Grey fill. In the export row, a selected chip is Teal Wash with Deep Teal text and no border.
- **Status chip:** transparent, Pencil Grey, `cursor: default`. It reports a state (for example, an enabled printer in the header); it is not clickable.
- **Pill (teal):** Teal Wash fill, Deep Teal text, for facts like "backbone".

### Cards / Containers
- **Corner Style:** 0.65rem.
- **Background:** Card Stock, 1px Hairline border, Card whisper shadow.
- **Internal Padding:** `1rem 1.05rem 1.1rem`. The head is a flex row with the `h2` title left and optional actions right.
- **Hint:** an inset Recess panel with Pencil Grey note text, for inline explanation inside a card.

### Inputs / Fields
- **Style:** Card Stock fill, 1px Field Edge border, 0.5rem corner, 2.25rem tall.
- **Focus:** the global 2px Bench Teal ring.
- **Select / text / number / url:** share one style. Labels sit above the control (`field`), and an optional Caution warning line follows below it.
- **Switch:** a 2.55rem × 1.45rem round track; off is Pressed Grey with a Field Edge border, on is Bench Teal, with a Card Stock thumb (5.3:1 against the track).
- **Project name:** a borderless, transparent input in Pencil Grey in the top bar.

### Navigation
- **Step tabs:** a row of text buttons ("1 Design", "2 Parts", "3 Plates", "4 Assemble") on a Hairline baseline. Inactive: Pencil Grey, darkening to Bench Ink on hover. Selected: Bench Ink, weight 600, with a 2px Bench Teal underline. No fills, no icons.
- **Settings nav:** a vertical list of text buttons; the current one gets a Card Stock fill and the Card whisper.

### Layer row (signature)
A Recess strip, 0.7rem corner, holding a grip handle, the layer name (borderless button), the layer's height pill and a remove button. While its editor is open, the strip takes the Teal Wash so the layer being edited stands out in a long list. A stack is a vertical list of these, ordered top-down like the designer's drawing. A layer reorders by dragging the grip, or with the "Move toward top" and "Move toward base" buttons in its editor.

### Filament swatch (signature)
A 2.2rem square with a 0.45rem corner and a Field Edge border (so cream and charcoal filaments both read on Recess), filled with the user's filament colour. Smaller 0.7rem round "dots" summarise the filament set in the top bar. This is where the interface is most colourful, and the colour is always the user's.

### Plate bed and cabinet preview (signature)
- **Bed:** an SVG on Plate Bed with 0.35-unit Plate Grid lines, a Hairline border and 0.5rem corners. Parts are filled with their filament colour and outlined in Bench Ink at a 2.5px non-scaling stroke, so a small part on a large bed never loses its edge.
- **Cabinet:** a front elevation drawn in Cabinet Frame, one rounded block per layer scaled to the real layer heights, body and knob in their filament colours.

### Progress
A 0.4rem round track in Recess with a Bench Teal fill. Its width animation is disabled under `prefers-reduced-motion`.

## Do's and Don'ts

### Do:
- **Do** let colour come from filaments and renders. A swatch, a dot, a plate part or a drawer front is where a saturated hue belongs; Bench Teal marks selection and state beside them.
- **Do** separate surfaces with a 1px Hairline border and a tonal step (Paper, Card Stock, Recess). Reach for the Card whisper shadow only on cards.
- **Do** keep controls on the 2.25rem rhythm (chips 1.7rem, tabs 2.5rem) so rows align across the page.
- **Do** set measured dimensions in IBM Plex Mono and state limits with the number ("329.6 mm wide", not "too big").
- **Do** report faults as a short Caution or Fault sentence beside the control that caused it; give a blocking full-width message its faint wash.
- **Do** keep a visible 2px Bench Teal focus ring on every interactive element; this is a keyboard-and-mouse desk tool.
- **Do** take every colour from the token set so light and dark both work. Add a token before adding a literal.

### Don't:
- **Don't** add a second accent colour, gradients, glow, or decorative coloured backgrounds on panels. Tinted backgrounds are limited to the three signal washes on message lines and Teal Wash on the documented selected/open states.
- **Don't** use Caution, Fault or Confirmed as saturated fills, borders, left-edge stripes or banners; they colour text, and a message line may add its faint wash.
- **Don't** lift on hover or add shadows beyond the Card whisper.
- **Don't** introduce a display typeface or a size jump to show emphasis; use weight.
- **Don't** import the look of the VAULT product or USSA Design (logo, palette, imagery as chrome); the identity stays neutral and independent.
- **Don't** add decorative icons or hero-metric treatments; the interface carries data, not ornament.
- **Don't** hard-code a colour in a component's CSS for UI chrome. The only literal colours in code are fallbacks for filament data (`#c9ccd0`, `#ccc`).
- **Don't** design for touch or narrow screens beyond the single 900px collapse unless the product brief changes.
