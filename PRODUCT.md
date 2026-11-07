# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Makers who bought the VAULT archive from USSA Design (733 STL files in family folders plus four PDF manuals) and own one or more 3D printers: Bambu Lab, Prusa, Creality, Anycubic, Elegoo, Qidi and others. They run the tool on their own PC or home NAS, single-user and self-hosted, usually at a desk with a mouse and keyboard. Their job is to go from "the cart I want" to print-ready files: compose the stack, know every part and bolt, and print without hand-picking files across a dozen folders.

Audience is VAULT owners only. Print farms, shared multi-user hosting, and pre-purchase evaluators are not target users.

## Product Purpose

Compose a VAULT stack and get every printed part and hardware item, then export one print-ready multi-plate 3MF project per printer. Without it, a user finds the right file for every module, box, facade, runner, key, latch, hinge and handle by hand, counts pieces, and sets up each file in the slicer. With it, the parts are resolved from the stack, identical parts are joined across modules and layers, and filament and print time are known before printing. Each 3MF opens in Bambu Studio, OrcaSlicer or Anycubic Slicer Next with printer, process preset, and filaments and colours already set.

Success: a user composes a stack, trusts the part list and plate layout without re-checking against the manuals, and prints from the exported projects.

## Positioning

It runs against the user's own copy of the archive and ships none of the designer's files. The result is exact for that archive: every part is resolved for the chosen layout, size and depth, and every piece is checked to sit on its plate. A generic parts list or a hand-built slicer project cannot give the stack-to-plates path.

## Operating Context

- Starts as a one-click local app (Windows `.bat`, macOS `.command`, Linux `.sh`, using `uv`) at http://localhost:8765. It can also run as a Docker container or a NAS stack (Unraid, Dockhand, Portainer) with the archive mounted read-only.
- First start measures all 733 STLs, extracts help pages from the user's PDFs, and fetches render sheets from ussadesign.com. This is slow once and cached after.
- Server installs download exports as one zip (3MFs, BOM.md, stack.json). Slicer presets are sent from the browser by picking the slicer's settings folder. The local install reads slicer presets directly.
- Named projects stay in the browser. Save stack and Load stack move a stack as JSON, and the site's "Your build" PDF or saved JSON can be imported.
- The workflow is four steps in the numbered tabs: 1 Design, 2 Parts, 3 Plates, 4 Assemble. The first three take a stack to print-ready 3MF projects; Assemble carries the hardware and parts checklist used while building. Print progress on an exported plan is tracked by marking plates printed.

## Capabilities and Constraints

- Stack composition follows the designer's rules: layers top-down, drawers or sustainers, S/M/L/XL widths and two-bay layers, facade split, interior, lock, geared rails, manual support braces, roofs and modifications. Rules are not the tool's to change.
- Options explain themselves in context. Help pages come from the user's own manuals with the manual page and the real parts for their size, and any part opens in an interactive 3D viewer.
- The Parts view shows each piece with its picture in its colour, weight, time, size, and which printer fits it, plus the bolt, rod and bearing list. Colours can be changed for the whole stack, a module, a part group or one part.
- Plates: printers are picked from a list (every Bambu Lab model, the H2D/H2C/X2D once per nozzle, and popular Prusa, Creality, Anycubic, Elegoo, Qidi and others) or typed in by bed size, Z and a "no tall parts" bed-slinger option. Filaments are colour slots, optionally from Spoolman. Every plate is one colour, packed densely. Oversize parts go across the diagonal and support braces stand against their module.
- Fit is stated plainly with the dimension and the limit (for example, the H2C is treated as 325 × 320 × 320 mm, so L 4U parts cannot be printed on it).
- Terminology to keep: stack, layer, module, part group, plate, slot (filament colour slot), sustainer, facade, runner, brace, archive.
- Stack: Python server (`server.py`, `catalog.py`, `mesh.py`, `plates.py`, `presets.py`) with a React 19 + TypeScript + Vite front end in `web/` and three.js for 3D. The legacy single-file `index.html` still exists at the root.
- Licence: code is AGPL v3. The designer's files, manuals, renders and print-time data belong to USSA Design and must never be bundled.

## Brand Commitments

An independent tool with a neutral identity. The name is "VAULT configurator". It carries no USSA Design logo or branding, and "Not affiliated with USSA Design" stays truthful and visible. The designer's renders appear only from the user's own archive and the site's own sheets, never as shipped assets. No binding visual identity has been set beyond this.

## Evidence on Hand

- Real product screenshots and clips in `docs/media/`: stack, parts, plates, export, colours, help, 3D viewer, slicer screenshots (Bambu Studio, OrcaSlicer, Anycubic Slicer Next), and an 84-second narrated tour. A public project page lives in `docs/index.html`.
- Test coverage: 18,620 stack combinations checked to resolve to archive files, and exports read back the way the slicer reads them.
- A demo cart figure from the README: 120 pieces, about 7.2 kg, about 4.3 kg in the main colour.
- Absent and not to be invented: user testimonials, customer counts, any USSA endorsement, and pricing.

## Product Principles

1. Trust the numbers. Parts, weights, times and fit limits must be exact and checked; when something cannot be printed, say so with the dimension and the limit.
2. The designer's rules are the rules. Surface them, explain them from the manuals, and never override them.
3. Show the real thing. Prefer the user's own renders, parts and 3D view over abstract controls.
4. Own the user's files. The archive is read in place and never copied, and the app never writes to it.
5. Work for the slicer in front of them. Output opens with printer, process and filaments already set, whether the app runs locally or on a NAS.

## Accessibility & Inclusion

Desktop-first, used with mouse and keyboard on a PC. No formal standard (such as WCAG) is required. Keep keyboard operation and legible contrast sound in a dense planner UI. Phone and tablet use is not a stated requirement.
