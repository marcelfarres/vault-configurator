---
version: 1
slug: "web-src-app-tsx"
primary_target: "web/src/App.tsx"
related_targets: []
---

# Surface brief: VAULT configurator app (web/)

Mode: Operate. Scope: the whole planner — header + 4 step tabs (Design, Parts, Plates, Assemble), Settings, 3D viewer chrome. Audience: VAULT archive owners composing a stack to print-ready 3MF exports (see PRODUCT.md). Job: compose stack → trust parts/plates → export.

Chosen direction: the user-pinned Lovable prototype "Vault Configurator UI prototype" (lovable.dev project 9f77e894), ported onto the real app. Pinned direction replaces the concept roll. Memorable moment: the Design editing loop — sticky blurred shell, airy section cards, large sticky Preview of the real stack in the user's filament colours.

## Direction contract

THESIS: The Lovable prototype's rendition of the Neutral Bench at full scale — an airy, centered, sticky-shelled planner — replaces the denser left-aligned bench; it refuses the cramped full-bleed tool layout while keeping every real feature the prototype lacks.
OWN-WORLD: Warm paper + card stock + recess neutrals, ink primary actions, one muted teal for selection/focus; Plex Sans with Plex Mono for the wordmark, chips, numerals and dimensions; radius scale from 0.5rem; shadow-sm on controls, none on cards; Lucide-style stroke icons.
STORY: The maker sees the stack drawing at all times, understands each step from its title and lede, and always has one obvious way onward (step footer), ending in print-ready exports.
FIRST VIEWPORT: Sticky blurred header (mono VAULT, ghost Save/Load, enabled-printer mono chips, overlapping filament dots, fit control, Settings) over numbered tabs; "Compose your stack" title; controls column (Footprint, Layers, Finish cards at 1.5rem padding) beside a sticky 420px Preview card.
FORM: User-pinned Lovable prototype (beats the roll; no concept-seed run). seed: none (unavailable)
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Declared deviations from the prototype: crafted local dark theme over Lovable's stock slate dark; label-above fields; Settings printers remain an editable table; stronger field-edge token.
