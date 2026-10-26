"""VAULT part catalog: stack description -> printed part lines + hardware.

Rules come from the VAULT manuals, the ussadesign.com composer rules
(vault-composer-rules.js) and its print-data sheet. Quantities that the
manuals leave implicit are marked in `note` and stay editable in the UI.
"""
import glob
import json
import os
import re

FAMILIES = ["S", "M", "L", "XL"]
LAYOUTS = {"S": ["S"], "M": ["M"], "L": ["L"], "XL": ["XL"], "SS": ["S", "S"], "SM": ["S", "M"]}
LAYOUT_FAMILY = {"S": "S", "M": "M", "L": "L", "XL": "XL", "SS": "L", "SM": "XL"}
ALLOWED_LAYOUTS = {"S": ["S"], "M": ["M"], "L": ["L", "SS"], "XL": ["XL", "SM"]}
PATTERNS = {1: [[1]], 2: [[2], [1, 1]], 4: [[4], [2, 2], [1, 1, 1, 1], [2, 1, 1], [1, 1, 2]]}
WIDTH = {"S": 164.8, "M": 254.0, "L": 329.6, "XL": 418.8}
GRID_W = {"S": 10, "M": 18, "L": 26, "XL": 32}   # grid-divider length index per family width
GRID_D = {3: 10, 4: 14, 5: 18, 6: 22, 7: 26}      # ... and per depth
ROD_LENGTH = {"S": 248, "M": 338, "L": 414, "XL": 504}
DENSITY_PETG = 1.27  # g/cm3

MAIN, DARK, ACCENT, TPU = "main", "knob", "accent", "tpu"
BOX = "box"
ROLES = [MAIN, BOX, DARK, ACCENT, TPU]
ROLE_LABELS = {MAIN: "main body (modules, facades, roofs, base)", BOX: "drawer inside (boxes, dividers, baseplates)",
               DARK: "knob & handles (lock knob, handles, backbone, feet)", ACCENT: "accent (hinges, latches, springs, rails, caps)", TPU: "TPU tyres"}


def norm(s):
    s = s.replace("┬▓", "2").replace("²", "2").lower()
    return re.sub(r"[^a-z0-9]", "", s)


def name_key(s):
    """File-name key: norm() without word-final s, since USSA renames files between archive versions
    ('x7 Runner Slide' / 'x7 Runner Slides'); no two files in one folder differ only by it."""
    return norm(re.sub(r"(?i)(?<=[a-z])s\b", "", s))


class Index:
    """All STL files in the archive, addressable by normalized filename + folder hint.
    (The archive's folder names contain mojibake like 'L┬▓ Families', hence the normalization.)"""

    def __init__(self, root):
        self.root = root
        self.files = []  # (norm_path, norm_base, rel)
        for p in glob.glob(os.path.join(root, "0*", "**", "*.stl"), recursive=True):
            rel = os.path.relpath(p, root)
            self.files.append((norm(rel), name_key(os.path.basename(rel)[:-4]), rel))

    def find(self, name, hint=""):
        """Basename match (name_key), disambiguated by a folder hint. None if missing."""
        n, words = name_key(name), [norm(w) for w in hint.split()]
        hits = [rel for np_, nb, rel in self.files if nb == n and all(w in np_ for w in words)]
        if not hits and words:
            hits = [rel for np_, nb, rel in self.files if nb == n]
        return sorted(hits, key=len)[0] if hits else None

    def divider(self, folder, length):
        """Grid divider files are named like '10-S, x3.stl' or '5.stl'; match by leading integer."""
        pat = norm(folder)
        for np_, nb, rel in self.files:
            if pat in np_ and re.match(rf"^{length}(?![0-9])", nb):
                return rel
        return None


def load_site_data(path):
    with open(path, encoding="utf-8") as f:
        return {p["key"]: p for p in json.load(f)["parts"]}


class Bom:
    def __init__(self, index, site_data, fits_whole):
        self.index = index
        self.site = site_data
        self.fits_whole = fits_whole  # callable(rel) -> bool: does this file fit the biggest enabled printer?
        self.lines = []
        self.hardware = {}
        self.warnings = []

    # ---------------------------------------------------------------- helpers
    def add(self, group, name, hint="", qty=1, role=MAIN, note="", site_key=None, file=None):
        if qty <= 0:
            return
        rel = file or self.index.find(name, hint)
        if rel is None:
            self.warnings.append(f"File not found: {name} ({hint})")
        key = (group, rel or name, role)
        for line in self.lines:
            if (line["group"], line["file"] or line["name"], line["role"]) == key:
                line["qty"] += qty
                return
        site = self.site.get(site_key) if site_key else None
        self.lines.append({
            "id": f"p{len(self.lines) + 1}", "group": group, "name": name, "file": rel, "qty": qty,
            "role": role, "note": note,
            "site_seconds": site["seconds"] if site and site["seconds"] is not None else None,
            "site_grams": site["grams"] if site and site["grams"] is not None else None,
        })

    def hw(self, item, qty, per=""):
        if qty <= 0:
            return
        h = self.hardware.setdefault(item, {"item": item, "qty": 0, "notes": set()})
        h["qty"] += qty
        if per:
            h["notes"].add(per)

    def split_or_whole(self, group, whole_name, part_names, hint, role=MAIN, extra_when_split=(), note=""):
        """Use the one-piece file if it fits the largest printer, else the split version."""
        whole = self.index.find(whole_name, hint)
        if whole and self.fits_whole(whole):
            self.add(group, whole_name, hint, 1, role, note, file=whole)
            return
        if whole:
            note = (note + " " if note else "") + "Split version used: one-piece file does not fit the enabled printers."
        for n in part_names:
            self.add(group, n, hint, 1, role, note)
        for n, q, r in extra_when_split:
            self.add(group, n, hint, q, r, "Joins the split parts.")

    # ---------------------------------------------------------------- drawers
    def drawer_layer(self, i, layer, depth, opts):
        layout, h = layer["layout"], int(layer["height"])
        fams = LAYOUTS[layout]
        wf = LAYOUT_FAMILY[layout]
        g = f"L{i + 1} · {wf}{depth} {h}U drawers" + (" (split " + "+".join(fams) + ")" if len(fams) > 1 else "")
        if len(fams) > 1:
            self.add(g, f"{wf}{depth}² Module {h}F", "families", 1, MAIN, note="Two-bay module (L²/XL² family).",
                     site_key=f"Drawer body:{wf}:{depth}:{h}")
            self.add(g, f"x{depth} Accessory 1st", "accessories", 1, MAIN, note="L²/XL² centre-runner accessory; quantity assumed 1.")
            self.add(g, f"x{depth} Accessory 2nd", "accessories", 1, MAIN, note="L²/XL² centre-runner accessory; quantity assumed 1.")
        else:
            self.add(g, f"{wf}{depth} Module {h}F", "drawers modules", 1, MAIN, site_key=f"Drawer body:{wf}:{depth}:{h}")
        self.add(g, "Latch", "drawers universal", len(fams), ACCENT, note="File holds the latch pair; one per bay.")
        if layer.get("manualSupports"):
            self.add(g, f"Manual support brace x{depth}", "", 1, MAIN, file=self.index.find(f"x{depth}", "manual supports"),
                     note="Sacrificial brace printed beside the standing module (one per module print, snapped off afterwards).")
        key = layer.get("key", "key")
        interior = layer.get("interior", "none")
        for col, f in enumerate(fams):
            faces = layer["facades"][col]
            for fh in faces:
                fh = int(fh)
                runners = 2 if fh == 1 else 4
                runner_note = "Two per 1F box, four per 2F/4F box (two runner pairs per side)."
                if f == "XL":
                    if depth >= 6:
                        self.add(g, f"XL{depth} Box 1F Part 1", "drawers boxes", 1, MAIN, site_key=f"Drawer box:XL:{depth}:1")
                        self.add(g, f"XL{depth} Box 1F Part 2", "drawers boxes", 1, MAIN)
                    else:
                        self.add(g, f"XL{depth} Box 1F", "drawers boxes", 1, MAIN, site_key=f"Drawer box:XL:{depth}:1")
                        self.add(g, f"XL{depth} Back Panel", "drawers boxes", 1, MAIN)
                    self.add(g, "XL Facade 1F", "drawers xl families", 1, MAIN, site_key="Drawer facade:XL::1")
                    self.add(g, f"x{depth} Runner Guide XL", "xl runners", runners, MAIN, note=runner_note, site_key=f"Rail 2:All:{depth}:")
                    self.add(g, f"x{depth} Runner Slide XL", "xl runners", runners, MAIN, note=runner_note, site_key=f"Rail 1:All:{depth}:")
                else:
                    self.add(g, f"{f}{depth} Box {fh}F", "drawers boxes", 1, MAIN, site_key=f"Drawer box:{f}:{depth}:{fh}")
                    self.add(g, f"{f}{fh}F (Turn On Supports)", "drawers facades", 1, MAIN, note="Print with supports on.", site_key=f"Drawer facade:{f}::{fh}")
                    self.add(g, f"x{depth} Runner Guide", "universal runners", runners, MAIN, note=runner_note, site_key=f"Rail 2:All:{depth}:")
                    self.add(g, f"x{depth} Runner Slide", "universal runners", runners, MAIN, note=runner_note, site_key=f"Rail 1:All:{depth}:")
                self.add(g, "Runner Stopper", "runners", runners, ACCENT, note="One per runner slide.")
                if key == "hidden":
                    self.add(g, "Hidden Key (Turn On Supports)", "drawers universal", 1, DARK, note="Supports on.", site_key="Drawer lock:All::")
                    self.add(g, "Hidden Key Part 2 (Turn on Supports)", "drawers universal", 1, DARK, note="Supports on.")
                elif key != "none":
                    self.add(g, "Key (Turn On Supports)", "drawers universal", 1, DARK, note="Supports on.", site_key="Drawer lock:All::")
                    self.add(g, "Key Cap", "drawers universal", 1, MAIN, site_key="Lock cap:All::")
                self.add(g, "Springs", "drawers universal", 1, ACCENT, note="File holds both springs for one facade.")
                self.add(g, "Facade Cap", "drawers universal", 1, MAIN)
                if layer.get("labels", True):
                    self.add(g, "Label", "drawers universal", 1, MAIN, note="Slide-in label; add text in the slicer.")
                if layer.get("rails") or len(faces) > 1:
                    self.add(g, f"{f} Rails", "geared rails", 1, ACCENT,
                             note="Geared lock rails (pair). Required when a module holds more than one box; optional otherwise.")
                self.hw("M4 x 14 mm bolt", 4 if fh == 1 else 6, "per drawer facade")
                if interior.startswith("baseplate"):
                    suffix = {"baseplate1h": "_With 1 Handle", "baseplate2h": "_With 2 Handles"}.get(interior, "")
                    if f == "XL":
                        if depth >= 6:
                            self.add(g, f"XL{depth} Baseplate Part 1", "drawers gridfinity", 1, MAIN)
                            self.add(g, f"XL{depth} Baseplate Part 2", "drawers gridfinity", 1, MAIN)
                        else:
                            self.add(g, f"XL{depth} Baseplate", "drawers gridfinity", 1, MAIN)
                    else:
                        name = f"{f}{depth} Baseplate{suffix}"
                        if suffix and not self.index.find(name, "drawers gridfinity"):
                            self.warnings.append(f"{name} does not exist; plain baseplate used.")
                            name = f"{f}{depth} Baseplate"
                        self.add(g, name, "drawers gridfinity", 1, MAIN)
                elif interior == "grid":
                    tall = layer.get("gridHeight") or ("20mm" if False else {1: "34.5", 2: "82.5", 4: "82.5"}[fh])
                    folder = {"20": "20MM TALL", "34.5": "34.5MM TALL", "82.5": "82.5MM TALL"}[str(tall).replace("mm", "")]
                    nw, nd = int(layer.get("gridW", 1)), int(layer.get("gridD", 1))
                    wfile = self.index.divider(folder, GRID_W[f])
                    dfile = self.index.divider(folder, GRID_D[depth])
                    self.add(g, f"Grid divider {GRID_W[f]} ({folder})", "", nw, MAIN, file=wfile, note="Width-wise divider; count is your choice.")
                    self.add(g, f"Grid divider {GRID_D[depth]} ({folder})", "", nd, MAIN, file=dfile, note="Depth-wise divider; count is your choice.")
                    edge = {"20MM TALL": "Straight Edge Piece 20MM", "34.5MM TALL": "Straight Edge Piece 1F", "82.5MM TALL": "Straight Edge Piece 2F"}[folder]
                    self.add(g, edge, "grid dividers", 2 * (nw + nd), MAIN, note="One per divider end (assumed).")
                    self.add(g, "grid divider pin_loose", "grid dividers", nw * nd, MAIN, note="One per crossing (assumed); 'pin_tight' variant also exists.")

    # ------------------------------------------------------------- sustainers
    def sustainer_layer(self, i, layer, depth, opts):
        layout, h = layer["layout"], int(layer["height"])
        variant = layer.get("variant", "Flat")
        for col, f in enumerate(LAYOUTS[layout]):
            g = f"L{i + 1} · {f}{depth} {h}U sustainer" + (f" (bay {col + 1})" if len(LAYOUTS[layout]) > 1 else "")
            if f in ("S", "M"):
                self.add(g, f"{f}{depth} {h}F Module", "sustainers", 1, MAIN, site_key=f"Sustainer body:{f}:{depth}:{h}")
            else:
                self.add(g, f"{f}{depth} {h}F {variant} Module", "sustainers", 1, MAIN, site_key=f"Sustainer body:{f}:{depth}:{h}")
            fac = "XL1F Facade" if f == "XL" else f"{f}{h}F Facade"
            self.add(g, fac, "sustainers", 1, MAIN, site_key=f"Sustainer facade:{f}::{h}")
            hint = f"sustainers {f} families"
            if depth >= 6:
                self.split_or_whole(g, f"{f}{depth} Roof Whole", [f"{f}{depth} Roof Part 1", f"{f}{depth} Roof Part 2"], hint,
                                    extra_when_split=[("Connector For Split Roof", 1, MAIN)], note="Sustainer lid.")
                for line in self.lines:
                    if line["group"] == g and "Roof" in line["name"] and line["site_seconds"] is None:
                        s = self.site.get(f"Sustainer lid:{f}:{depth}:")
                        if s and "Whole" in line["name"]:
                            line["site_seconds"], line["site_grams"] = s["seconds"], s["grams"]
            else:
                self.add(g, f"{f}{depth} Roof", hint, 1, MAIN, note="Sustainer lid.", site_key=f"Sustainer lid:{f}:{depth}:")
            big = f in ("L", "XL")
            self.add(g, ("L-XL 1F Hinge" if big else "S-M 1F Hinge") if h == 1 else ("L 2-4F Hinge" if big else "S-M 2-4F Hinge"), "hinges", 2, DARK)
            self.add(g, "L-XL Hinge Top" if big else f"{f} Hinge Top", "hinges", 2, DARK)
            self.add(g, "L-XL Rods" if big else "S-M Rods", "rods", 1, ACCENT, note="Hinge pin set for both hinges.")
            self.add(g, "LOCK HOLDER", "locks", 2, DARK)
            self.add(g, "LOCK INNER PART", "locks", 2, DARK)
            self.add(g, "LOCK OUTER PART 1F" if h == 1 else "LOCK OUTER PART 2-4F", "locks", 2, DARK)
            self.add(g, "1 SET OF PINS FOR 1 LOCK", "locks", 2, ACCENT)
            self.add(g, "Label for Sustainers", "sustainers", 1, MAIN)
            if big and variant == "Dividers":
                if f == "L":
                    self.add(g, f"L-{h}F Width Divider", "dividers", int(layer.get("divW", 1)), DARK, note="Count is your choice.")
                    self.add(g, f"L{depth}-{h}F Depth Divider", "dividers", int(layer.get("divD", 2)), DARK, note="Count is your choice.")
                else:
                    self.add(g, "XL Width Divider", "dividers", int(layer.get("divW", 1)), DARK, note="Count is your choice.")
                    self.add(g, f"XL{depth} Depth Divider", "dividers", int(layer.get("divD", 2)), DARK, note="Count is your choice.")
            elif big and variant == "Sealed":
                if f == "L":
                    self.add(g, f"L-{h}F Seal Divider", "dividers", 3, DARK, note="Three seal dividers as in the naming sheet.")
                else:
                    self.add(g, "XL Seal Divider (Center)", "dividers", 1, DARK)
                    self.add(g, "XL Seal Divider (Sides)", "dividers", 2, DARK)
            elif not big and layer.get("dividers"):
                self.add(g, f"{f}{h}F Divider", "dividers", int(layer.get("divW", 2)), DARK, note="Count is your choice.")
            if layer.get("baseplate"):
                if f == "XL":
                    if depth >= 6:
                        self.add(g, f"XL{depth} Part 1  Gridfinity Baseplate", "sustainers baseplates", 1, MAIN)
                        self.add(g, f"XL{depth} Part 2  Gridfinity Baseplate", "sustainers baseplates", 1, MAIN)
                    else:
                        self.add(g, f"XL{depth}  Gridfinity Baseplate", "sustainers baseplates", 1, MAIN)
                else:
                    self.add(g, f"{f}{depth} Baseplate", "sustainers universal baseplates", 1, MAIN)
            self.hw("M4 x 10 mm bolt", 8, "per sustainer"); self.hw("M4 x 14 mm bolt", 16, "per sustainer"); self.hw("M4 x 20 mm bolt", 7, "per sustainer")

    # -------------------------------------------------------------------- roof
    def roof(self, stack, top_layer, depth):
        r = stack.get("roof") or {}
        t = r.get("type", "none")
        if t == "none":
            return
        f = LAYOUT_FAMILY[top_layer["layout"]]
        g = f"Roof · {f}{depth}"
        if t == "heavyweight":
            if f in ("S", "M"):
                self.warnings.append("Heavyweight roof only exists for L and XL; roof skipped.")
                return
            if f == "XL":
                whole = self.index.find(f"XL{depth} Heawyweight Roof", "roofs")
                if whole and self.fits_whole(whole):
                    self.add(g, f"XL{depth} Heawyweight Roof", "roofs", 1, MAIN)
                else:
                    self.add(g, f"XL{depth} Heavyweight Roof Cut", "roofs", 1, MAIN, note="'Cut' version chosen: the full XL roof does not fit the enabled printers.")
            else:
                self.add(g, f"L{depth} Heawyweight Roof", "roofs", 1, MAIN)
            self.add(g, "Heawyweight Roof Handle", "drawers universal", 1, DARK)
            self.add(g, "Heawyweight Roof Insert", "drawers universal", 2, MAIN, note="Quantity assumed 2 (one per bin).")
            return
        name = {"grid": "Grid Roof", "table": "Table Roof", "bowl": "Bowl Roof", "undertable": "Under Table Mount Roof"}[t]
        self.add(g, f"{f}{depth} {name}", "drawers roofs", 1, MAIN)
        if t == "grid" and r.get("topHandle", True):
            self.add(g, "Top Handle (Turn On Supports)", "drawers universal", 1, DARK, note="Supports on.")
            self.hw("M6 x 50 mm countersunk bolt", 2, "roof handle")

    # -------------------------------------------------------------------- mods
    def mods(self, stack, depth):
        m = stack.get("mods") or {}
        layers = stack["layers"]
        F = LAYOUT_FAMILY[layers[0]["layout"]]
        g = "Mods · base"
        if m.get("base"):
            if depth >= 6:
                self.split_or_whole(g, f"{F}{depth} Base Whole", [f"{F}{depth} Base Part 1", f"{F}{depth} Base Part 2"], "modifications base",
                                    extra_when_split=[("Base Connector", 2, MAIN)])
            else:
                self.add(g, f"{F}{depth} Base", "modifications base", 1, MAIN)
            if m.get("casters"):
                self.hw("Caster with M8 bolt", 4, "casters mode")
        if m.get("wheels"):
            self.add(g, "Disk", "wheels", 2, MAIN); self.add(g, "Cover", "wheels", 2, MAIN); self.add(g, "Bushing", "wheels", 2, MAIN)
            self.add(g, "Tyre (TPU)", "wheels", 2, TPU, note="Print in TPU, 7 walls.")
            self.add(g, "Jig", "wheels", 1, MAIN, note="Assembly jig for the bushings.")
            self.hw(f"M16 rod {ROD_LENGTH[F]} mm (axle)", 1, "wheels"); self.hw("M4 x 25 mm bolt", 12, "6 per wheel")
            self.hw("6205ZZ bearing (25x52x15)", 2, "per wheel"); self.hw("SCSAW shaft collar 16d 35D 10mm", 2, "per wheel")
        if m.get("feet"):
            self.add(g, f"{F} Feet", "feet", 1, DARK); self.hw("M6 x 90 mm bolt", 2, "per foot")
        bb = m.get("backbone", "none")
        if bb != "none":
            g2 = "Mods · backbone"
            for i, layer in enumerate(layers):
                fl, h = LAYOUT_FAMILY[layer["layout"]], int(layer["height"])
                boards = [(f"{fl}{min(h, 2)}F Backbone", 1 if h < 4 else 2)] if bb == "wide" else [(f"Universal {min(h, 2)}F Backbone", 2 if h < 4 else 4)]
                for name, q in boards:
                    if bb == "wide" and fl == "XL" and h > 1:
                        name, q = "XL1F Backbone", h
                    self.add(g2, name, "backbone", q, DARK, note=f"Layer {i + 1}." + (" Drill the 2F board holes before use." if "2F" in name else ""))
                    self.hw("M4 x 60-100 mm bolt", 4 * q, "per backbone board")
            if m.get("connectors"):
                for lo in layers[:-1]:  # ponytail: connector height follows the lower module's backbone board (assumed)
                    self.add(g2, f"Connector for Modules {min(int(lo['height']), 2)}F", "backbone", 2, DARK, note="Optional module-to-module connector, 2 per joint assumed.")
        if (m.get("base") or bb != "none") and len(layers) > 1:
            if int(layers[0]["height"]) != 2 or int(layers[-1]["height"]) != 2:
                self.warnings.append("Designer's advice for carts: use a 2U module right above the base and a 2U module right below the roof.")
        if m.get("pullout"):
            g3 = "Mods · pull-out handle"
            self.add(g3, f"{F} Pull-out Handle", "pull-out handle", 1, DARK)
            if bb == "universal":
                self.add(g3, "Universal Pull-out Handle Lock", "backbone", 2, DARK)
            else:
                self.add(g3, f"{F} Pull-out Handle Lock", "backbone", 1, DARK)
                if F == "S":
                    self.add(g3, "S Pull-out Handle Lock Part 2", "backbone", 1, DARK)
            self.add(g3, "Handle Lock Knob Part 1", "backbone", 2, MAIN); self.add(g3, "Handle Lock Knob Part 2", "backbone", 2, DARK)
            self.hw("M6 x 30 mm countersunk bolt", 4, "pull-out handle"); self.hw("M6 x 35 mm hex bolt", 2, "pull-out handle")
            self.hw("M6x8x8 heat insert", 2, "pull-out handle"); self.hw("M16 rod, tower height (pull-out handle)", 2, "cut to tower height")
        if m.get("stationary"):
            self.add("Mods · stationary handle", f"{F} Stationary Handle", "stationary handle", 1, MAIN); self.hw("M4 x 60 mm bolt", 8, "stationary handle")
        pb = m.get("pegboard", "none")
        if pb != "none":
            folder = "USSA Pegboard" if pb == "ussa" else "IKEA Skadis Pegboard"
            self.warnings.append("USSA pegboard: the archive only has the attachment rails; the pegboard panels are a separate product "
                                 "(https://www.ussadesign.com/products/multifunctional-bench)." if pb == "ussa"
                                 else "IKEA Skadis pegboard: the archive only has the attachment rails; the board comes from IKEA.")
            for i, layer in enumerate(layers):
                fl, h = LAYOUT_FAMILY[layer["layout"]], int(layer["height"])
                q = 1 if h < 4 else 2
                self.add("Mods · pegboard", f"{fl}{min(h, 2)}F", folder, q, MAIN,
                         note=f"Layer {i + 1}, {folder} attachment." + (" The USSA pegboard panels themselves are a separate product: https://www.ussadesign.com/products/multifunctional-bench" if pb == "ussa" else " Fits an IKEA Skådis board (not included)."))
                self.hw("M4 x 40 mm bolt", 4 * q, "per pegboard")
        if m.get("wallmount"):
            for i, layer in enumerate(layers):
                fl, h = LAYOUT_FAMILY[layer["layout"]], int(layer["height"])
                self.add("Mods · wall mount", f"{fl}{h}F Wall Mount", "wall mounts", 1, MAIN, note=f"Layer {i + 1}.")
                self.add("Mods · wall mount", "Wall Mount Second Part", "wall mounts", 2, DARK, note="Two per mount (assumed).")

    # -------------------------------------------------------------------- main
    def build(self, stack):
        depth = int(stack.get("depth", 3))
        layers = stack.get("layers") or []
        if not layers:
            self.warnings.append("No layers yet.")
            return self.result(stack)
        base = LAYOUT_FAMILY[layers[0]["layout"]]
        for i, layer in enumerate(layers):
            if layer["layout"] not in ALLOWED_LAYOUTS[base]:
                self.warnings.append(f"Layer {i + 1}: {layer['layout']} cannot stack on a {base} base.")
            if LAYOUT_FAMILY[layer["layout"]] == "XL" and int(layer["height"]) != 1:
                self.warnings.append(f"Layer {i + 1}: XL-width modules (XL and S+M) only exist in 1U.")
            if layer["type"] == "Sustainers":
                layer = {**layer, "facades": [[int(layer["height"])] for _ in LAYOUTS[layer["layout"]]]}
                self.sustainer_layer(i, layer, depth, stack)
            else:
                self.drawer_layer(i, layer, depth, stack)
        self.roof(stack, layers[-1], depth)
        self.mods(stack, depth)
        return self.result(stack)

    def result(self, stack):
        hw = [{"item": h["item"], "qty": h["qty"], "notes": ", ".join(sorted(h["notes"]))} for h in self.hardware.values()]
        for line in self.lines:
            line["kind"] = kind_of(line["name"], line["role"])
            line["role"] = role_of(line["name"], line["kind"])
        return {"parts": self.lines, "hardware": hw, "warnings": self.warnings}


def stack_from_site_pdf(text):
    """Layers from the ussadesign.com 'Your build' PDF (Modules required / Facades required tables).
    The PDF has no layer order and no facade-per-module assignment, so both are best guesses."""
    rank = {"S": 0, "M": 1, "L": 2, "XL": 3}
    head, _, tail = text.partition("Facades required")
    rows = lambda t: [(m[0], m[1], int(m[2]), int(m[3])) for m in re.findall(r"(Drawers|Sustainers)\s+(XL|S|M|L)\s+(\d)U\s+(\d+)", t)]
    modules, facades = rows(head), rows(tail)
    warnings = []
    if not modules:
        return {"layers": [], "warnings": ["No 'Modules required' table found in this PDF."]}
    base = max((f for _, f, _, _ in modules), key=rank.get)
    pool = {}
    for t, f, h, q in facades:
        pool[(f, h)] = pool.get((f, h), 0) + q
    layers = []
    single = [(t, f, h) for t, f, h, q in modules for _ in range(q)]
    while single:
        t, f, h = single.pop(0)
        if f == base:
            layers.append({"type": t, "layout": f, "height": h, "facades": [[h]]})
            continue
        want = "S" if base == "L" else ("M" if f == "S" else "S")  # L = S+S, XL = S+M
        mate = next((m for m in single if m[0] == t and m[1] == want and m[2] == h), None)
        if mate is None:
            warnings.append(f"{f} {h}U {t.lower()} module without a partner for a {base} base; placed alone in a two-bay layer.")
            mate = (t, want, h)
        else:
            single.remove(mate)
        pair = sorted([(t, f, h), mate], key=lambda m: rank[m[1]])
        layers.append({"type": t, "layout": "SS" if base == "L" else "SM", "height": h, "facades": [[h], [h]], "_bays": [m[1] for m in pair]})
    for l in layers:
        fams = l.pop("_bays", [l["layout"]])
        if l["type"] != "Drawers":
            for f in fams:
                pool[(f, l["height"])] = pool.get((f, l["height"]), 0) - 1
            continue
        l["facades"] = []
        for f in fams:
            pick = next((p for p in PATTERNS[l["height"]] if all(pool.get((f, u), 0) >= p.count(u) for u in set(p))), [l["height"]])
            for u in pick:
                pool[(f, u)] = pool.get((f, u), 0) - 1
            l["facades"].append(list(pick))
    for l in layers:
        l.pop("_bays", None)
    if any(v > 0 for v in pool.values()):
        warnings.append("Some facades in the PDF could not be matched to a module: " + ", ".join(f"{v}× {f} {u}U" for (f, u), v in pool.items() if v > 0))
    warnings.append("The site PDF has no layer order and no depth: reorder the layers and set the depth.")
    return {"layers": layers, "warnings": warnings}


def role_of(name, kind):
    """Colour role of a part, from what it is on the designer's renders."""
    if kind == "tyre (TPU)":
        return TPU
    if kind in ("box", "dividers", "baseplate"):
        return BOX
    if re.search(r"Key|Handle|Knob|Backbone|Feet|Pegboard", name) and not re.search(r"Key Cap", name) or kind in ("backbone & handles",):
        return DARK
    if kind in ("hinges & locks",) or re.search(r"Latch|Springs|Rails$|Runner Stopper|Facade Cap|Key Cap|Rods|PINS", name):
        return ACCENT
    return MAIN


KINDS = [  # (kind, regex on part name) — first match wins; a kind is a print-settings/test group
    ("tyre (TPU)", r"Tyre"),
    ("module", r"Module"),
    ("lock mechanism", r"^Key|Hidden Key|Key Cap|Springs|Latch|Rails$|Facade Cap|^Label$"),
    ("runners", r"Runner|Accessory"),
    ("hinges & locks", r"Hinge|Rods|LOCK|PINS|Label for Sustainers"),
    ("dividers", r"(?i)divider|Edge Piece|pin_"),
    ("baseplate", r"Baseplate"),
    ("roof", r"Roof|Top Handle|Connector For Split"),
    ("facade", r"Facade|\dF \(Turn On Supports\)"),
    ("box", r" Box "),
    ("module", r"Module"),
    ("base & wheels", r"Base|Disk|Cover|Bushing|Jig|Feet"),
    ("backbone & handles", r"Backbone|Handle|Knob|Connector for Modules"),
    ("pegboard", r"^(S|M|L|XL)[124]F$"),
    ("wall mount", r"Wall Mount"),
    ("manual supports", r"^Manual support"),
]


def kind_of(name, role=""):
    for kind, pat in KINDS:
        if re.search(pat, name):
            return kind
    return "other"


if __name__ == "__main__":  # self-check against the real archive
    assert name_key("x7 Runner Slides") == name_key("x7 Runner Slide") and name_key("S Rails") != name_key("M Rails")  # renamed archives
    root = os.environ.get("VAULT_ARCHIVE") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    idx = Index(root)
    site = load_site_data(os.path.join(os.path.dirname(os.path.abspath(__file__)), "site_print_data.json"))
    stack = {"depth": 5, "layers": [
        {"type": "Drawers", "layout": "SS", "height": 2, "facades": [[1, 1], [2]], "interior": "baseplate", "key": "key"},
        {"type": "Sustainers", "layout": "L", "height": 1, "variant": "Dividers", "baseplate": True},
        {"type": "Drawers", "layout": "L", "height": 1, "facades": [[1]], "interior": "grid", "gridW": 1, "gridD": 2},
    ], "roof": {"type": "grid"}, "mods": {"base": True, "wheels": True, "feet": True, "backbone": "wide", "pullout": True, "pegboard": "ussa", "wallmount": False}}
    r = Bom(idx, site, lambda rel: True).build(stack)
    missing = [l for l in r["parts"] if not l["file"]]
    for l in r["parts"]:
        print(f'{l["group"]:34s} {l["qty"]:2d} x {l["name"]:40s} [{l["role"]}] {l["file"] or "MISSING"}')
    print("hardware:", r["hardware"]); print("warnings:", r["warnings"])
    assert not missing, missing
    assert sum(l["qty"] for l in r["parts"] if l["name"].endswith("Runner Guide")) == 10  # S 1F + S 1F + L 1F boxes at 2 each, S 2F box at 4
    kinds = {l["name"]: l["kind"] for l in r["parts"]}
    assert kinds["S5 Box 1F"] == "box" and kinds["L5² Module 2F"] == "module" and kinds["Springs"] == "lock mechanism"
    assert kinds["L5 1F Dividers Module"] == "module" and kinds["L-1F Width Divider"] == "dividers"
    assert kinds["L5 Roof"] == "roof" and kinds["L2F"] == "pegboard" and kinds["Tyre (TPU)"] == "tyre (TPU)" and kinds["L1F Facade"] == "facade"
    assert "other" not in kinds.values(), [n for n, k in kinds.items() if k == "other"]
    roles = {l["name"]: l["role"] for l in r["parts"]}
    assert roles["S5 Box 1F"] == "box" and roles["Key (Turn On Supports)"] == "knob" and roles["L-XL 1F Hinge"] == "accent"
    assert roles["Springs"] == "accent" and roles["L5 Roof"] == "main" and roles["Tyre (TPU)"] == "tpu" and roles["L Pull-out Handle"] == "knob"
    assert roles["L5 Baseplate"] == "box" and roles["L1F Facade"] == "main" and roles["Label for Sustainers"] == "accent"
    print("catalog self-check ok:", len(r["parts"]), "lines")
