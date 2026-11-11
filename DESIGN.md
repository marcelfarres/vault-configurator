---
name: VAULT configurator
description: A calm, hairline-ruled planning bench with a sticky shell, where filament colours carry the colour and one teal marks what is selected.
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
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "-0.025em"
  title:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.45
  body:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
  note:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.45
  wordmark:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "0.1em"
  mono:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  sm: "0.25rem"
  md: "0.375rem"
  lg: "0.5rem"
  full: "999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
  2xl: "2.5rem"
components:
  button:
    backgroundColor: "{colors.bench-paper}"
    textColor: "{colors.bench-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
    height: "2.25rem"
  button-primary:
    backgroundColor: "{colors.bench-ink}"
    textColor: "{colors.ink-reverse}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
    height: "2.25rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.bench-ink}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
    height: "2.25rem"
  chip:
    backgroundColor: "{colors.card-stock}"
    textColor: "{colors.pencil-grey}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0.125rem 0.625rem"
  chip-selected:
    backgroundColor: "{colors.pressed-grey}"
  printer-toggle:
    backgroundColor: "{colors.bench-paper}"
    textColor: "{colors.bench-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  printer-toggle-selected:
    backgroundColor: "{colors.teal-wash}"
    textColor: "{colors.deep-teal}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  status-chip:
    backgroundColor: "{colors.card-stock}"
    textColor: "{colors.pencil-grey}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0.125rem 0.5rem"
  input:
    backgroundColor: "{colors.card-stock}"
    textColor: "{colors.bench-ink}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
    height: "2.25rem"
  card:
    backgroundColor: "{colors.card-stock}"
    textColor: "{colors.bench-ink}"
    rounded: "{rounded.lg}"
    padding: "1.5rem"
  layer-row:
    backgroundColor: "{colors.bench-paper}"
    rounded: "{rounded.md}"
    padding: "0.625rem 0.75rem"
  layer-row-open:
    backgroundColor: "{colors.teal-wash}"
  hint:
    backgroundColor: "{colors.recess}"
    textColor: "{colors.pencil-grey}"
    typography: "{typography.note}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
  tab:
    textColor: "{colors.pencil-grey}"
    padding: "0.625rem 1rem"
    height: "2.5rem"
  tab-selected:
    textColor: "{colors.bench-ink}"
  swatch:
    rounded: "{rounded.sm}"
    size: "2.5rem"
---

# Design System: VAULT configurator

## Overview

**Creative North Star: "The Neutral Bench"**

A clean workbench that lets the user's own filament colours and the designer's real renders be the loudest colour in the room. The chrome is warm off-white paper, ink-dark text, and hairline rules under a sticky, blurred header; the one accent is a muted teal that means "this is selected or in progress": the current tab, the open layer, a plate marked printed, the focus ring. A switch that is on is ink-filled, like a primary button. Everything else that carries colour is data: a swatch, a drawer front in the stack preview, a part on a plate bed. When the interface stays this quiet, a wrong number or an unprintable part is the loudest thing on screen.

The mood is calm, precise and restrained, at an airier scale than the bench's first rendition: a centred 80rem column, 1.5rem card padding and 2rem column gaps (the rendition pinned from the "Vault Configurator UI prototype" on Lovable, ported 2026-11). Density is still real, because this is a planner with part lists, plate beds and printer fleets, but it is held together by hairline borders, a three-step shadow scale on controls only, and consistent control heights rather than by decoration. Icons are a single 2px-stroke set drawn inline, used only where they name an action.

This is an independent tool with a neutral identity (see PRODUCT.md). Nothing here borrows the VAULT or USSA Design look.

**Key Characteristics:**
- Colour belongs to the user's filaments; the UI itself is paper, ink and one teal that marks selection and state.
- Cards are flat with hairline borders; controls carry a small resting shadow so editable things read as objects on the bench.
- Hairline borders do the structural work that fills and shadows do elsewhere.
- Plex Sans for prose and controls; Plex Mono for the wordmark, chips, counts and measured dimensions.
- Light and dark themes share one set of semantic token names and one warm-neutral hue family, each composed on its own.
- Desktop-first, mouse and keyboard; breakpoints at 1100px (preview narrows), 900px (one column) and 640px (tight gutters).

## Colors

A warm-neutral paper palette with one desaturated teal, plus three signal colours that appear as text and, on full-width message lines only, as a faint matching wash. Values are OKLCH and the frontmatter is the source of truth. The tokens below are the light theme; the dark theme follows.

### Primary
- **Bench Ink** (`oklch(0.21 0.006 286)`): body text, the filled primary button, the "on" switch track, and the outline stroke around parts on a plate bed. It is a near-black with a barely perceptible cool lean.
- **Ink Reverse** (`oklch(0.985 0.002 90)`): text and icons on top of Bench Ink.

### Secondary
- **Bench Teal** (`oklch(0.52 0.07 195)`): the only accent, and it marks selection and state, never decoration. It paints the focus ring, the selected-tab underline, the progress fill, the text caret, the link underline, hover and checked borders on cards, the selected printer toggle's border, and the native `accent-color` for checkboxes and radios. It is never a large fill.
- **Teal Wash** (`oklch(0.93 0.03 190)`) with **Deep Teal** (`oklch(0.35 0.06 195)`) text: the quiet "this is on" tint for the open layer row, the backbone pill, selected printer toggles in the export row, the hover wash on outline and ghost buttons, and the Assembly-complete panel. Deep Teal is also the link colour (10.8:1 on Card Stock).
- **Selection** (`oklch(0.86 0.06 192)`): the text-selection highlight, with Bench Ink text (11.9:1).

### Neutral
- **Bench Paper** (`oklch(0.975 0.003 90)`): the page background and top bar.
- **Card Stock** (`oklch(0.995 0.002 90)`): cards, buttons, inputs, menus. Barely lighter than the page, separated by a hairline rather than a shadow.
- **Recess** (`oklch(0.95 0.003 286)`): sunken wells, hints, the preview canvas and the progress track.
- **Pressed Grey** (`oklch(0.94 0.004 286)`): selected plain chips. (The switch's off track is a 22% foreground tint mixed from Bench Ink, so it reads in both themes.)
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
- **Teal:** `oklch(0.74 0.075 195)` for rings and underlines (8.0:1 on card); wash `oklch(0.30 0.045 195)` with `oklch(0.85 0.07 195)` text. The on-switch track inverts with the primary button (near-white track, dark thumb).
- **Signal:** text `oklch(0.80 0.11 75)`, `oklch(0.76 0.13 25)`, `oklch(0.78 0.10 155)` (at least 7.9:1 on card); washes `oklch(0.27 0.045 75)`, `oklch(0.265 0.05 25)`, `oklch(0.26 0.04 155)`.
- **Plate bed:** `oklch(0.36 0.006 286)` with grid `oklch(0.46 0.006 286)`; part outlines `oklch(0.97 0.004 90)`.

### Named Rules
**The Filaments-First Colour Rule.** The loudest hue on any screen is a filament colour (swatches, dots, plate parts, the stack preview). The interface adds only Bench Teal, and only to mark selection, state or focus. Do not introduce a second accent.

**The Quiet Wash Rule.** Caution, Fault and Confirmed colour text. Only a full-width message line may also carry the matching faint wash, with no border, no icon and no saturated fill. A warning is still a sentence, not a banner.

## Typography

**Display Font:** none. There is no display face.
**Body Font:** IBM Plex Sans (with Segoe UI, sans-serif), loaded from Google Fonts at 400, 500 and 600.
**Label/Mono Font:** IBM Plex Mono (with ui-monospace), 400 and 500, for the wordmark, chips and pills, tab numerals, quantities and measured dimensions.

**Character:** A technical-humanist sans with a matching mono. It is engineered enough to be trusted with millimetres and plain enough to disappear. Hierarchy comes from weight and size in small steps, not from a second typeface.

### Hierarchy
- **Headline** (600, 1.5rem, 1.45, -0.025em): the one `h1` per page, e.g. "Compose your stack", "Parts & colours".
- **Title** (600, 0.875rem): card titles (`h2` and card `h3`). Plate card titles step down to weight 500 under the bed drawing.
- **Body** (400, 1rem, 1.45): rows and part names. Controls and labels step down to 0.875rem, weight 500 on buttons and field labels. Names inside rows are `strong` (a weight bump, not a size change).
- **Note** (400, 0.875rem): secondary text, hints, table body, field help. Colour is Pencil Grey.
- **Label** (400, 0.75rem, mono): chips, pills, status chips, tab numerals and preview meta.
- **Wordmark** (600, 1.125rem, mono, +0.1em, caps): "VAULT" in the top bar. The only tracked-out text.
- **Mono** (400, 0.875rem): the W × D × H line under the preview, plate printer/time/weight lines and other measured values.

### Named Rules
**The Millimetre Rule.** Measured dimensions, sizes and coordinates are set in Plex Mono so figures align and read as data; the same mono carries the wordmark, chips, tab numerals and counts — short data labels only. Prose never uses it.

**The Weight-Not-Size Rule.** Emphasis inside a row is weight (500 or 600), never a larger size.

## Layout

A sticky shell (top bar plus numbered step nav), then a single centred page column.

- **Container:** the page is capped at 80rem including its 2rem side padding (`border-box`), centred, with 2.5rem of air under the shell. Parts narrows to 56rem, Plates to 64rem, Assemble to 42rem — reading-width columns for list-shaped work. Settings takes 72rem: the printer fleet table sizes Bed/Z/action to content and gives the rest to Name and Profile, so printer identities stay readable without horizontal scrolling. Design keeps the full 80rem for the editing loop.
- **Shell:** `.app-head` sticks to the viewport top with a 95% Card Stock ground, an 8px backdrop blur and a Hairline bottom edge. Its rows align to the page column through `--page-pad`; its measured height is published as `--head-h` (a ResizeObserver in `App.tsx`) so the sticky preview column and the drawing budgets sit below it at any wrap state.
- **Top bar:** one wrapping flex row. Mono wordmark and project name, ghost Save and Load (with icons), enabled-printer mono chips, overlapping filament dots and count, fit controls, then Settings pushed to the far end. It wraps rather than collapses.
- **Compose layout:** a two-column grid, `minmax(0, 1fr) minmax(300px, 420px)` with a 2rem gap (320px side column under 1100px). Controls take the wide column at 1.5rem card gaps; the side column (Preview, then Help) sticks under the shell while editing, its drawing scaled to a height budget so any stack height gets the same anchor.
- **Collections:** part pieces use `repeat(auto-fit, minmax(200px, 1fr))` at 0.75rem; plate cards use `minmax(240px, 1fr)` at 1rem. Settings is a 12.5rem icon nav plus a content column at a 2rem gap.
- **Spacing rhythm:** 0.25rem (inside a chip group), 0.5rem (related controls), 1rem (card head to body), 1.5rem (between cards, card padding), 2rem (columns, page gutter), 2.5rem (under the shell, above the step footer). Rows still divide with a Hairline border, not extra whitespace.
- **Control height:** buttons, fields and checks are 2.25rem tall (2rem for the small header size), tabs 2.5rem. Touch targets are not the goal; consistent rhythm is.
- **Responsive:** 1100px narrows the preview column; 900px collapses the compose, settings and colour-role grids to a single column; 640px tightens gutters. The tool is desktop-first; phone use is not a requirement.

### Named Rules
**The One Column Collapse Rule.** Below 900px every multi-column grid becomes a single column in source order. The 1100px preview narrowing is the one intermediate step.

## Elevation & Depth

Cards are flat: Bench Paper is the floor, Card Stock sits barely above it with a Hairline border and no shadow, and Recess sinks wells (hints, the preview canvas, progress tracks) below it. Depth lives on the controls instead — a three-step shadow scale, always with a downward offset and a soft blur, never a halo.

### Shadow Vocabulary
- **Control shadow** (`--shadow-sm: 0 1px 2px oklch(0.21 0.006 286 / 8%)`): outline buttons, inputs, selects, the switch track, and (with a 1px Hairline ring) the current item in the settings nav.
- **Primary shadow** (`--shadow: 0 1px 3px oklch(0.21 0.006 286 / 10%), 0 1px 2px -1px oklch(0.21 0.006 286 / 10%)`): the ink-filled primary button, so the committed action sits a hair above its neighbours.
- **Menu shadow** (`--shadow-md: 0 4px 6px -1px oklch(0.21 0.006 286 / 10%), 0 2px 4px -2px oklch(0.21 0.006 286 / 10%)`): popover menus (`.menu`).

The 3D viewer overlay sits above everything (including the sticky shell) by `z-index` with a dim scrim (`oklch(0.13 0.006 286 / 88%)`), not by shadow. In dark, the three shadows deepen to 30–40% black.

### Named Rules
**The Flat-Cards Rule.** Surfaces and cards are flat at rest and nothing lifts on hover. Shadows belong to controls and menus only. Hover is a colour or border change (a button takes the Teal Wash, a piece card takes a teal edge, an inactive tab darkens to ink), never a movement.

## Shapes

Soft but not round. One radius scale derives from `--radius` (0.5rem): small 0.25rem (swatches, menu items), medium 0.375rem (buttons, inputs, selects, layer rows, piece cards, beds, hints), large 0.5rem (cards). Pills, chips, dots and the switch are fully round (999px). Borders are 1px: Hairline for structure, Field Edge for editable controls; the only 2px strokes are the tab underline, the focus ring and part outlines on plates. There is no clipping, no skew and no decorative geometry; the only drawn geometry is the real stack elevation and the real plate beds.

## Components

All components are refined and restrained: hairline-bordered, ink-filled when primary, with resting control shadows and one 2px-stroke icon set (inline SVG, 1rem, round caps) for named actions.

### Buttons
- **Shape:** gently curved (0.375rem), 2.25rem tall (2rem small), `0.5rem 1rem` padding, 0.875rem at weight 500, icon and label 0.5rem apart.
- **Default (outline):** Bench Paper fill, Bench Ink text, Hairline border, Control shadow. Hover takes the Teal Wash with Deep Teal text.
- **Primary:** Bench Ink fill, Ink Reverse text, Primary shadow; hover lightens the ink by a tenth. The same treatment marks the active option inside a segmented control (`aria-pressed="true"`) and the Settings button while Settings is open.
- **Ghost:** transparent fill and border, Teal Wash on hover (Save, Load, Start over).
- **Icon button:** 2rem circle, no border, Pencil Grey darkening to ink on hover, for row actions.
- **Disabled:** half opacity, no hover change. **Focus:** a 2px Bench Teal outline with a 2px offset on every focusable element.

### Chips, pills and printer toggles
- **Chip / pill:** fully round, `0.125rem 0.625rem` padding, 0.75rem mono label type in Pencil Grey, Hairline border on Card Stock.
- **Selected:** Pressed Grey fill for a plain pressed chip.
- **Status chip:** the same shell, `cursor: default`. It reports a state (an enabled printer in the header); it is not clickable.
- **Pill (teal):** Teal Wash fill, Deep Teal text, Bench Teal border, for facts like "backbone".
- **Printer toggle (export row):** a larger button form of the chip — 0.375rem corner, `0.5rem 1rem` padding, name plus bed size in small mono. Unselected is Bench Paper with a Hairline border (teal on hover); selected is Teal Wash with a Bench Teal border.

### Cards / Containers
- **Corner Style:** 0.5rem.
- **Background:** Card Stock, 1px Hairline border, no shadow.
- **Internal Padding:** 1.5rem all round (plate cards step down to 1rem). The head is a flex row with the 0.875rem semibold title left and optional actions right, 1rem above the body.
- **Hint:** an inset Recess panel (0.375rem corner, `0.5rem 0.75rem`) with Pencil Grey note text, for inline explanation inside a card.

### Inputs / Fields
- **Style:** Card Stock fill, 1px Field Edge border, 0.375rem corner, 2.25rem tall, `0.5rem 0.75rem` padding, Control shadow, 0.875rem type.
- **Focus:** the global 2px Bench Teal ring.
- **Select / text / number / url:** share one style. Labels sit above the control (`field`, 0.875rem at weight 500, 0.5rem gap), and an optional Caution warning line follows below it. Stacked direct-child fields in a card are 1rem apart.
- **Switch:** a 2.25rem × 1.25rem round track; off is a 22% ink tint, on is Bench Ink (near-white in dark), with a 1rem Bench Paper thumb carrying its own soft shadow.
- **Project name:** a borderless, transparent 0.875rem input in Pencil Grey in the top bar.

### Navigation
- **Step tabs:** text buttons inside the sticky shell, the step number set in small mono at 60% opacity before each name ("1 Design" … "4 Assemble"). Inactive: Pencil Grey, darkening to Bench Ink on hover. Selected: Bench Ink, weight 500, with a 2px Bench Teal underline overlapping the shell's bottom edge. No fills.
- **Settings nav:** a vertical list of icon-plus-label buttons; the current one gets a Card Stock fill, a Hairline ring and the Control shadow.

### Layer row (signature)
A Bench Paper strip with a Hairline border and a 0.375rem corner, holding a grip handle, the layer name and its one-line summary (borderless button), the layer's height pill (mono, units and millimetres) and a remove icon button. While its editor is open, the strip takes the Teal Wash with a Bench Teal border so the layer being edited stands out in a long list. A stack is a vertical list of these, ordered top-down like the designer's drawing. A layer reorders by dragging the grip, or with the "Move toward top" and "Move toward base" buttons in its editor.

### Filament swatch (signature)
Three forms of the user's colour: a 2.5rem square (0.25rem corner, Field Edge border, so cream and charcoal both read) on piece cards; overlapping 1rem round dots ringed in Card Stock in the top bar; and a 2.25rem round colour disc in Settings, where the disc itself is the colour picker and the filament name sits in a borderless input that gains its border and shadow on hover or focus. This is where the interface is most colourful, and the colour is always the user's.

### Plate bed and cabinet preview (signature)
- **Bed:** an SVG on Plate Bed with 0.35-unit Plate Grid lines and 0.375rem corners, no border, set first in a 1rem-padded plate card with the title below it. Parts are filled with their filament colour and outlined in Bench Ink at a 2.5px non-scaling stroke, so a small part on a large bed never loses its edge.
- **Cabinet:** a front elevation drawn in Cabinet Frame on a Recess canvas at 2rem padding. Each layer draws its real fronts: bays side by side at their width shares, split facades stacked top-to-bottom at their unit shares, a handle on every front, body and knob in their filament colours. The layer open in the editor is stroked in Bench Teal.

### Progress
A 0.4rem round track in Recess with a Bench Teal fill. Its width animation is disabled under `prefers-reduced-motion`.

## Do's and Don'ts

### Do:
- **Do** let colour come from filaments and renders. A swatch, a dot, a plate part or a drawer front is where a saturated hue belongs; Bench Teal marks selection and state beside them.
- **Do** separate surfaces with a 1px Hairline border and a tonal step (Paper, Card Stock, Recess). Keep shadows on controls and menus, from the three-step scale only.
- **Do** keep controls on the 2.25rem rhythm (small header size 2rem, tabs 2.5rem) and corners on the one radius scale (0.25 / 0.375 / 0.5rem) so rows align across the page.
- **Do** set measured dimensions, chips and counts in IBM Plex Mono and state limits with the number ("329.6 mm wide", not "too big").
- **Do** use the inline 2px-stroke icon set where an icon names the action (save, load, add, export); pair it with a text label on buttons.
- **Do** report faults as a short Caution or Fault sentence beside the control that caused it; give a blocking full-width message its faint wash.
- **Do** keep a visible 2px Bench Teal focus ring on every interactive element; this is a keyboard-and-mouse desk tool.
- **Do** take every colour from the token set so light and dark both work. Add a token before adding a literal.

### Don't:
- **Don't** add a second accent colour, gradients, glow, or decorative coloured backgrounds on panels. Tinted backgrounds are limited to the three signal washes on message lines and Teal Wash on the documented selected, open and hover states.
- **Don't** use Caution, Fault or Confirmed as saturated fills, borders, left-edge stripes or banners; they colour text, and a message line may add its faint wash.
- **Don't** lift on hover, shadow a card, or add shadow steps beyond the three named ones.
- **Don't** introduce a display typeface or a size jump to show emphasis; use weight.
- **Don't** import the look of the VAULT product or USSA Design (logo, palette, imagery as chrome); the identity stays neutral and independent.
- **Don't** use emoji or text glyphs (`×`, `←`, `+`) as icons, or icons as ornament; the interface carries data.
- **Don't** hard-code a colour in a component's CSS for UI chrome. The only literal colours in code are fallbacks for filament data (`#c9ccd0`, `#ccc`).
- **Don't** design for touch or narrow screens beyond the documented 1100 / 900 / 640px steps unless the product brief changes.
