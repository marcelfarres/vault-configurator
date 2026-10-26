# VAULT configurator

Compose a [VAULT](https://www.ussadesign.com/pages/vault) stack, get every printed part and bolt, and
export one print-ready multi-plate 3MF project per printer. Runs on your own computer or NAS against
**your own copy** of the USSA Design archive; it ships none of the designer's files.

[![A tour of the configurator, sped up: compose a stack, see the parts with filament and time, turn a part in 3D, preview the plates and export](docs/media/tour-preview.webp)](https://marcelfarres.github.io/vault-configurator/#video)

**Watch it** at normal speed with captions: the 84-second [tour](https://marcelfarres.github.io/vault-configurator/#video)
on the project page, or download the clips on [composing a stack](docs/media/stack.mp4),
[parts and the 3D view](docs/media/parts.mp4) and [plates and export](docs/media/export.mp4).
Re-made with `scripts/media/record.py`.

## Why

The archive is 733 STL files in family folders (`S5`, `L²`, `Universal`, `Modifications` …) plus four
PDF manuals. Building one cart means finding the right file for every module, box, facade, runner, key,
latch, hinge and handle across those folders, counting how many of each, and setting up each file in
the slicer. This tool does that from the stack you compose:

| With the archive alone | With the configurator |
|---|---|
| No way to see the stack before printing; the manuals show examples | To-scale preview from the designer's renders, front and back, for *your* layers and modifications |
| Pick each file by hand from a dozen folders; a two-bay L layer needs an L² body, S boxes, S facades and runner parts from three places | Every part resolved for your exact layout, size and depth (tested on 18,620 stack combinations) |
| Count pieces per module, then add up shared parts (runners, keys, latches, springs) yourself | Identical parts joined across modules and layers: one row, one total, packed together |
| Material and time unknown until you slice every file | Total filament per colour and print time for the whole stack before printing (demo cart: 120 pieces, ≈7.2 kg, ≈4.3 kg in the main colour) |
| Set printer, process and filament with colour in every file | Each 3MF opens with printer, process preset and your filaments and colours already set |
| Arrange plates by hand, colour changes mid-plate | Single-colour plates packed densely per printer, oversize parts across the diagonal, every piece checked on its plate |

## 1 · Stack

Layers top-down like the drawing: drawers or sustainers, S/M/L/XL and two-bay layers, facade split,
interior, lock, geared rails, manual support braces, roofs and every modification. Rules are the
designer's. Click any option for a plain explanation with the manual page and the real parts of *your*
size; click a part to spin it in 3D. Import the site's "Your build" PDF or its saved JSON.

![Help with the manual page and the real parts](docs/media/help.jpg)
![Any part in 3D](docs/media/viewer.jpg)

## 2 · Parts & hardware

Every printed piece with its picture in its colour, weight, time, size and which printer fits it, and
the bolt / rod / bearing list. Colours come from the designer's renders (body, drawer inside, knobs,
accent, TPU) and can be changed for the whole stack, a module, a part group or a single part.

![Parts and hardware](docs/media/parts.jpg)

## 3 · Plates & export

Printers picked from a list (every Bambu Lab model, the H2D/H2C/X2D once per nozzle, popular Prusa, Creality,
Anycubic, Elegoo, Qidi and others) or typed in by bed size (bed, Z, "no tall parts" for a bed-slinger),
filaments as colour slots (optionally from your Spoolman spools), what prints in which colour, then export: one 3MF project per printer with named
plates, one named object per piece, printer, process preset and filaments with your colours.
Every plate is one colour; parts are packed densely, oversize parts go across the diagonal, support
braces stand against their module. Optionally tune a process preset per part group with test plates.

![Colours and filaments](docs/media/colours.jpg)
![Plates per printer](docs/media/export.jpg)

Opens as a project in Bambu Studio, OrcaSlicer and Anycubic Slicer Next:

| Bambu Studio (H2C) | Anycubic Slicer Next (Kobra X) | OrcaSlicer |
|---|---|---|
| ![](docs/media/slicer-bambu-studio.jpg) | ![](docs/media/slicer-anycubic.jpg) | ![](docs/media/slicer-orca.jpg) |

## Run

You need the VAULT archive you bought: the folder with `01. DRAWERS`, `02. SUSTAINERS`,
`03. MODIFICATIONS` and the PDF manuals. It is read in place and never copied. At first start the help
pages are extracted from your PDFs and the render sheets fetched from ussadesign.com.

**One click, on your own computer** (no server, no Python install). Download this repository
(green **Code** button, **Download ZIP**, or `git clone`) and double-click the starter for your system:

| System | Starter |
|---|---|
| Windows | `Start VAULT (Windows).bat` |
| macOS | `Start VAULT (Mac).command` (the first time: right-click, **Open**) |
| Linux | `Start VAULT (Linux).sh` |

The first start offers to install [uv](https://docs.astral.sh/uv/), which fetches Python and the
libraries into your user folder, then asks once for your archive folder and remembers it in
`archive-path.txt` (delete that file to choose another). Your browser opens at http://localhost:8765.
Windows may warn that the file is from an unknown publisher: choose **More info**, then **Run anyway**.
A git checkout updates itself at each start. Running on the PC with your slicers lets it read your
Bambu Studio, OrcaSlicer and Anycubic Slicer Next presets.

**Docker** (PC or NAS):

```bash
VAULT_ARCHIVE=/path/to/VAULT docker compose up -d     # http://localhost:8765
```

**NAS with a stack manager** (Dockhand, Portainer): paste [`deploy/compose.yaml`](deploy/compose.yaml),
set `VAULT_ARCHIVE` to the dataset that holds the archive. The image is
`ghcr.io/marcelfarres/vault-configurator:latest`, built on every push; `pull_policy: always` means a
forced redeploy (`deploy/update-nas.cmd`) picks up the newest version. Step by step: [deploy/README.md](deploy/README.md).

**Plain Python** (3.11+ with `numpy`, `pypdf` and `pillow`):
`VAULT_ARCHIVE=/path/to/VAULT python -X utf8 server.py`. In Docker, mount the slicers' config folder
to get your presets.

Printers: the H2C is used as 325 × 320 × 320 mm, what one nozzle reaches. L-family parts are 329.6 mm
wide: 1U/2U modules, backbones and wall mounts go across the diagonal; L 4U modules, the L 4U sustainer
body, the L4F facade and wall mount cannot be printed on it, and the Stack tab says so with the dimension
and the limit. USSA's own printer check on the VAULT page gives the same answer (L 4U: H2S or A2L only).

## Tests

- `tests/test_stack_parts.py` composes every layout × height × option (18,620 stacks) and fails if any
  part does not resolve to an archive file; it also lists which files no stack reaches (only
  alternative lengths and duplicates).
- `tests/test_export_inside.py` exports representative stacks for each printer mode through the real
  export, reads every 3MF back the way the slicer does and fails if any piece leaves its plate or the
  piece count does not add up. The same read-back runs at the end of every export in the app.
- `deploy/smoke_test.py <url>` checks a running instance end to end (used after each NAS update).
- Each module has a self-check: `python -X utf8 {catalog,mesh,plates,presets,assets_bootstrap}.py`.

The tests need the archive: set `VAULT_ARCHIVE` to its folder (a network share works).

## Files

- `catalog.py` – stack → parts/hardware rules, part groups, colour roles, PDF import
- `mesh.py` – STL reader, alignment, stats cache, thumbnails, multi-plate 3MF writer
- `plates.py` – printer assignment, MaxRects + diagonal + brace packing, export, test plates
- `presets.py` – slicer presets, per-object overrides, project config
- `assets_bootstrap.py` – help pages from the owner's PDFs, render sheets from the site
- `server.py` + `index.html` – the app; `site_print_data.json` – the designer's print-time sheet
- `Start VAULT (*)` + `start.sh` – one-click starters (uv, archive folder picker)
- `deploy/compose.yaml` – NAS stack; `scripts/media/shoot.py` – refreshes the screenshots above

## License

The configurator's code is free software under the [GNU AGPL v3](LICENSE): you may use, change and share
it, and if you offer a changed version to others over a network you must share its source too.

The license covers this tool only. VAULT, its STL files, manuals, renders and the print data in
`site_print_data.json` belong to USSA Design and are not part of it; the tool works only with the archive
you bought. Not affiliated with USSA Design.
