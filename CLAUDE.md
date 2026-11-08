# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A local web tool for the USSA Design VAULT archive (a modular 3D-printed drawer system). The user composes a
stack in the browser; the tool resolves every printed part to an STL in the user's own copy of the archive,
lists hardware, packs parts onto printer plates and exports one multi-plate 3MF project per printer with
slicer presets embedded. The repository ships none of the designer's files: the archive is read in place
from `VAULT_ARCHIVE` (default: the parent directory of this repo).

## Commands

Dependencies are only `numpy`, `pypdf` and `pillow`; there is no pyproject, lockfile, linter config or test
framework. Run everything with `-X utf8` (archive paths contain `²`).

```bash
# run the app (http://localhost:8765; --no-browser to skip opening one; VAULT_PORT/PORT and HOST override)
VAULT_ARCHIVE=/path/to/VAULT uv run --python 3.13 --with numpy --with pypdf --with pillow python -X utf8 server.py

# per-module self-checks (the `if __name__ == "__main__"` block of each module)
python -X utf8 mesh.py      # no archive needed (CI runs this)
python -X utf8 plates.py    # no archive needed (CI runs this)
python -X utf8 catalog.py   # needs VAULT_ARCHIVE
python -X utf8 presets.py   # reads installed slicer presets
python -X utf8 assets_bootstrap.py

# tests: plain scripts with asserts, run one file at a time; both need VAULT_ARCHIVE
python -X utf8 tests/test_stack_parts.py     # all 18,620 layout x height x option stacks resolve to files
python -X utf8 tests/test_export_inside.py   # real export + 3MF read-back per printer mode (several minutes)

# end-to-end check of a running instance (stdlib only)
python -X utf8 deploy/smoke_test.py http://127.0.0.1:8765
```

CI (`.github/workflows/docker.yml`) runs the `mesh.py` and `plates.py` self-checks, then builds and pushes
`ghcr.io/marcelfarres/vault-configurator` on pushes to `main` and `v*` tags.

## Architecture

The pipeline is stack JSON -> BOM -> plan -> 3MF, one module per stage, wired together by `server.py`:

- `catalog.py` - `Index` scans the archive and finds a file by normalised part name plus a folder hint
  (`norm`/`name_key` tolerate `²` vs `2`, mojibake and files renamed between VAULT versions). `Bom` holds
  the designer's rules: given a stack (layers of Drawers/Sustainers with layout, height, facade patterns,
  interior, key, rails; roof; mods) it adds part lines and hardware. Identical parts merge on
  `(group, file, role)`. Each line carries a colour **role** (`main`, `box`, `knob`, `accent`, `tpu`) that
  drives filament assignment, and `kind_of` maps a part name to a print-settings group. Print time and grams
  come from `site_print_data.json` (the designer's sheet). `stack_from_site_pdf` imports the ussadesign.com
  "Your build" PDF.
- `mesh.py` - numpy STL reader, minimum-area XY re-squaring (archive STLs come out of CAD at arbitrary
  rotations), `StatsCache` (size/volume per file, persisted to `cache/stats.json`), thumbnails, and the 3MF
  writer plus `verify_3mf`, which reads a written file back the way the slicer does.
- `plates.py` - printer catalogue and defaults, assignment of each part to a printer that fits it,
  MaxRects packing with diagonal placement for oversize parts and braces paired against their module,
  one colour per plate, then `export`. `plan_tests` builds per-group test plates.
- `presets.py` - finds Bambu Studio / OrcaSlicer / Anycubic Slicer Next settings (OS config dir, or copies
  uploaded from the browser into `slicers/`), resolves `inherits` chains, and builds the 3MF
  `project_settings.config` (machine + process flattened, filament vectors concatenated in slot order).
- `assets_bootstrap.py` - at startup, extracts help pages from the owner's PDF manuals and fetches render
  sheets from ussadesign.com into `assets/`. Failures leave pictures missing; the UI copes and it retries
  next start.
- `server.py` - stdlib `ThreadingHTTPServer`. Module-level globals (`INDEX`, `STATS`, `SITE`, `EXPORT`
  status) are built at import, so importing `server` (as `tests/test_export_inside.py` does) indexes the
  archive. A background precache thread measures every STL and yields while user requests run. Exports run
  on a thread and are polled via `/api/export_status`; `/api/download` zips the last export for server
  installs. `/stl/` and `/thumb/` only serve paths present in the index.
- `index.html` - the whole front end in one file: inline vanilla JS, no build step, three.js from a CDN
  import map for the 3D viewer.
- `version.py` - build id is a hash of an explicit file list; add new runtime files to `FILES`.

Generated, git-ignored directories: `cache/`, `assets/`, `output/`, `slicers/`, plus `archive-path.txt`
(the archive folder remembered by the `Start VAULT (*)` starters, which `start.sh` drives).

## Conventions

- No dependencies beyond numpy/pypdf/pillow in the app and stdlib in `deploy/smoke_test.py`; the Dockerfile
  and the starters install exactly those.
- Printer bed sizes and nozzle reach come from the slicers' own presets or the makers' spec sheets, and the
  comment beside each constant says which; keep that source comment when changing one.
- `scripts/media/shoot.py` and `record.py` (Playwright, against a running server) regenerate the README
  screenshots and videos in `docs/media/` after UI changes.
