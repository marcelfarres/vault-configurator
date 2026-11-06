"""Printer assignment, plate packing and 3MF export of a BOM."""
import hashlib
import json
import math
import os
import re
import time

import h2d_split
import mesh
import presets

# Default printers are filled in after PRINTER_CATALOG (U1, P1S, H2D left, H2D right).
# "Add printer" list. Bambu beds from Bambu Studio's machine presets, Anycubic from Anycubic Slicer Next's,
# the rest from the makers' spec sheets; `profile` is the model name the slicer's presets carry.
PRINTER_CATALOG = [{"name": n, "profile": n, "bed": [x, y], "z": z, "slicer": sl} for sl, rows in {
    "bambu": [("Bambu Lab A1 mini", 180, 180, 180), ("Bambu Lab A1", 256, 256, 256), ("Bambu Lab A2L", 330, 320, 325),
              ("Bambu Lab P1P", 256, 256, 250), ("Bambu Lab P1S", 256, 256, 250), ("Bambu Lab P2S", 256, 256, 256),
              ("Bambu Lab X1", 256, 256, 250), ("Bambu Lab X1 Carbon", 256, 256, 250), ("Bambu Lab X1E", 256, 256, 250),
              ("Bambu Lab H2S", 340, 320, 340)],
    "anycubic": [("Anycubic Kobra X", 260, 260, 260), ("Anycubic Kobra S1", 250, 250, 250), ("Anycubic Kobra S1 Max", 350, 350, 350),
                 ("Anycubic Kobra 3 V2", 255, 255, 260)],
    "orca": [("Prusa CORE One", 250, 220, 270), ("Prusa MK4S", 250, 210, 220), ("Prusa MINI", 180, 180, 180), ("Prusa XL", 360, 360, 360),
             ("Creality K1C", 220, 220, 250), ("Creality K1 Max", 300, 300, 300), ("Creality K2 Plus", 350, 350, 350),
             ("Creality Ender-3 V3 SE", 220, 220, 250), ("Elegoo Centauri Carbon", 256, 256, 256), ("Elegoo Neptune 4 Pro", 225, 225, 265),
             ("Qidi Q1 Pro", 245, 245, 240), ("Qidi Q2", 270, 270, 256), ("Flashforge AD5X", 220, 220, 220), ("Snapmaker U1", 270, 270, 270),
             ("Sovol SV08", 350, 350, 345), ("Voron 2.4 350", 350, 350, 340)],
}.items() for n, x, y, z in rows]
# Dual-nozzle Bambus, once per nozzle (extruder_printable_area): each nozzle alone reaches only part of the plate;
# `origin` is where the right nozzle's area starts, and that printer's file pins every filament to its nozzle.
for model, y, left, right in (("Bambu Lab H2C", 320, (325, 320), (305, 325, 25)), ("Bambu Lab H2D", 320, (325, 320), (325, 325, 25)),
                              ("Bambu Lab H2D Pro", 320, (325, 320), (325, 325, 25)), ("Bambu Lab X2D", 256, (256, 261), (235.5, 256, 20.5))):
    PRINTER_CATALOG += [{"name": f"{model} · left nozzle", "profile": model, "bed": [left[0], y], "z": left[1], "slicer": "bambu", "nozzleSide": "left"},
                        {"name": f"{model} · right nozzle", "profile": model, "bed": [right[0], y], "z": right[1], "slicer": "bambu",
                         "nozzleSide": "right", "origin": [right[2], 0]}]
# Opt-in. Not a default row: a 350 mm part is cut into one object with two nozzle parts.
# It does not replace the left-only and right-only rows.
PRINTER_CATALOG.append({
    "name": "Bambu Lab H2D · both nozzles (split)",
    "profile": "Bambu Lab H2D",
    "bed": [350, 320], "z": 320, "slicer": "bambu", "nozzleMode": "h2d-split",
})
PRINTER_CATALOG.sort(key=lambda p: p["name"])


def catalog_printer(name, pid):
    """One add-printer row, with the id and nozzle fields the rest of the app expects."""
    src = next(p for p in PRINTER_CATALOG if p["name"] == name)
    return {**src, "bed": list(src["bed"]), "id": pid, "maxH": src["z"], "enabled": True, "nozzle": "0.4", "preset": ""}


# Personal fleet. H2C and the other catalog rows stay available from Add printer.
# H2D is one row per nozzle: each nozzle reaches only part of the physical plate.
DEFAULT_PRINTERS = [
    catalog_printer("Snapmaker U1", "u1"),
    catalog_printer("Bambu Lab P1S", "p1s"),
    catalog_printer("Bambu Lab H2D · left nozzle", "h2d-left"),
    catalog_printer("Bambu Lab H2D · right nozzle", "h2d-right"),
]
MATERIALS = ["PLA", "PETG", "PETG-CF", "PETG-GF", "ASA", "ABS", "TPU"]
DEFAULT_FILAMENTS = [  # one slot per colour role; `preset` = slicer filament preset per printer id
    {"name": "light grey", "color": "#9da3a8", "material": "PETG", "preset": {}},
    {"name": "dark grey", "color": "#4a4d50", "material": "PETG", "preset": {}},
    {"name": "black", "color": "#222426", "material": "PETG", "preset": {}},
    {"name": "orange", "color": "#ff7a1a", "material": "PETG", "preset": {}},
    {"name": "black (soft)", "color": "#1a1a1a", "material": "TPU", "preset": {}},
]
DEFAULT_SETTINGS = {
    "estimateFromPreset": True, "spoolman": "",
    "printers": DEFAULT_PRINTERS, "mode": "both", "spacing": 6, "edge": 0, "groupBy": "color",
    "filaments": DEFAULT_FILAMENTS, "roles": {"main": 0, "box": 1, "knob": 2, "accent": 3, "tpu": 4},
    "kindRoles": {},  # part group -> colour role override (e.g. "facade": "accent")
    "wallMm": 0.8, "infill": 0.21, "secondsPerGram": 90, "density": 1.27,  # shell+infill model, fitted to the designer's sheet (±4 %)
    "presets": {},  # printerId -> {"byKind": {kind: preset}, "byPart": {part: preset}}
}


def preset_for(s, printer, item):
    """Process preset name for a part on a printer: per-part > per-kind > printer default."""
    p = (s.get("presets") or {}).get(printer["id"]) or {}
    return p.get("byPart", {}).get(item["part"]) or p.get("byKind", {}).get(item.get("kind", "")) or printer.get("preset") or ""


SAFE_EDGE = 1.0  # mm kept free at the bed edge even when the user's keep-out is 0: sizes are rounded and
#                  Orca-family slicers flag a part a few microns outside the printable area as "over the boundary"


def diagonal_fit(a, b, x, y):
    """Smallest-angle placement of an a×b rectangle inside an x×y bed (port of the
    ussadesign printer-fit logic). Returns angle in degrees or None."""
    eps = 1e-7
    cands = [0.0, math.pi / 2, math.atan2(b, a), math.atan2(a, b)]
    A, B, R, C = a - b, b - a, math.hypot(a - b, b - a), x - y
    if R > eps and abs(C) <= R + eps:
        phi, delta = math.atan2(B, A), math.acos(max(-1, min(1, C / R)))
        for sign in (-1, 1):
            for k in (-1, 0, 1):
                ang = phi + sign * delta + k * 2 * math.pi
                if -eps <= ang <= math.pi / 2 + eps:
                    cands.append(max(0.0, min(math.pi / 2, ang)))
    for ang in sorted(cands):
        used = (a * math.cos(ang) + b * math.sin(ang), a * math.sin(ang) + b * math.cos(ang))
        if used[0] <= x + eps and used[1] <= y + eps:
            return math.degrees(ang)
    return None


def split_reach(printer):
    """Left-nozzle width and right-nozzle origin for a combined H2D row, read from the catalog."""
    profile = printer.get("profile")
    left = next(p for p in PRINTER_CATALOG if p.get("profile") == profile and p.get("nozzleSide") == "left")
    right = next(p for p in PRINTER_CATALOG if p.get("profile") == profile and p.get("nozzleSide") == "right")
    return left["bed"][0], right["origin"][0]


def fits(size, printer, edge=0):
    """Placement angle (0, 90 or a diagonal) or None. Same rule as the ussadesign 'Printers' tab:
    the part's footprint may be rotated freely on the bed; height must clear the printer's Z and the
    user's 'max part height' (e.g. keep tall parts off a bed-slinger).

    The H2D combined row is not a larger single-nozzle bed. It only accepts an axis-aligned pose
    on the combined plate. Height uses the same limit as every other printer.
    """
    w, d, h = size
    if h > min(printer["z"], printer.get("maxH") or printer["z"]):
        return None
    if printer.get("nozzleMode") == "h2d-split":
        left_width, _right_min = split_reach(printer)
        return h2d_split.fit_angle(size, edge, printer["bed"], left_width)
    return diagonal_fit(w, d, printer["bed"][0] - 2 * edge, printer["bed"][1] - 2 * edge)


def estimate(line, stats, s):
    """(grams, seconds): site sheet numbers when present, else a shell + infill estimate:
    every surface gets `wallMm` of solid plastic, the rest of the volume `infill` percent."""
    if line.get("site_grams") is not None:
        g, sec = line["site_grams"], line.get("site_seconds") or line["site_grams"] * s["secondsPerGram"]
    else:
        vol, shell = stats["volume_cm3"], min(stats.get("area_cm2", 0) * float(s["wallMm"]) / 10.0, stats["volume_cm3"])
        g = s["density"] * (shell * (1 - float(s["infill"])) + vol * float(s["infill"]))
        sec = g * s["secondsPerGram"]
    return g, sec


class MaxRects:
    """MaxRects bin packer (best short-side fit) with 90° rotation; the spacing is added to every
    part and to the bed so the gap also applies at the edges only once."""

    def __init__(self, bed, edge, gap):
        self.w, self.d = bed[0] - 2 * edge + gap, bed[1] - 2 * edge + gap
        self.edge, self.gap = edge, gap
        self.free = [(0.0, 0.0, self.w, self.d)]  # x, y, w, d
        self.items = []

    def place(self, item):
        w, d = item["w"] + self.gap, item["d"] + self.gap
        best = None
        for (fx, fy, fw, fd) in self.free:
            for (pw, pd, rot) in ((w, d, 0), (d, w, 90)):
                if pw <= fw and pd <= fd:
                    score = (min(fw - pw, fd - pd), max(fw - pw, fd - pd))
                    if best is None or score < best[0]:
                        best = (score, fx, fy, pw, pd, rot)
        if best is None:
            return False
        _, x, y, pw, pd, rot = best
        self._split(x, y, pw, pd)
        ox, oy = (x + self.edge, y + self.edge) if rot == 0 else (x + self.edge + pw - self.gap, y + self.edge)
        self.items.append({**item, "x": round(ox, 2), "y": round(oy, 2), "rot": rot, "fw": pw - self.gap, "fd": pd - self.gap})
        return True

    def _split(self, x, y, w, d):
        new = []
        for (fx, fy, fw, fd) in self.free:
            if x >= fx + fw or x + w <= fx or y >= fy + fd or y + d <= fy:
                new.append((fx, fy, fw, fd))
                continue
            if x > fx:
                new.append((fx, fy, x - fx, fd))
            if x + w < fx + fw:
                new.append((x + w, fy, fx + fw - x - w, fd))
            if y > fy:
                new.append((fx, fy, fw, y - fy))
            if y + d < fy + fd:
                new.append((fx, y + d, fw, fy + fd - y - d))
        # drop free rects contained in another one
        new = [r for r in new if r[2] > 0 and r[3] > 0]
        self.free = [a for i, a in enumerate(new) if not any(j != i and b[0] <= a[0] and b[1] <= a[1] and b[0] + b[2] >= a[0] + a[2] and b[1] + b[3] >= a[1] + a[3] for j, b in enumerate(new))]

    def place_centred(self, item, rot):
        """A part as big as the bed (fits only with a zero keep-out): centre it so both margins are equal."""
        w, d = (item["w"], item["d"]) if rot == 0 else (item["d"], item["w"])
        bx, by = self.w - self.gap + 2 * self.edge, self.d - self.gap + 2 * self.edge
        x0, y0 = (bx - w) / 2, (by - d) / 2
        self._split(x0 - self.edge, y0 - self.edge, w + self.gap, d + self.gap)
        self.items.append({**item, "x": round(x0 if rot == 0 else x0 + w, 2), "y": round(y0, 2), "rot": rot, "fw": w, "fd": d})

    def fill(self):
        return sum(i["fw"] * i["fd"] for i in self.items) / ((self.w - self.gap) * (self.d - self.gap))


Shelf = MaxRects  # name kept for callers


def combine_braces(items, printers, edge, stats_fn):
    """A manual-support brace is packed as ONE block with its module: the brace's vertical edge stands
    against the module's face (the face is where the brace's highest points sit), centred along it."""
    out, braces = [], [it for it in items if it["kind"] == "manual supports"]
    for it in items:
        if it["kind"] == "manual supports":
            continue
        b = next((b for b in braces if it["kind"] == "module" and b["group"] == it["group"] and b["slot"] == it["slot"]), None)
        if b:
            st = stats_fn(b["file"])
            if b["w"] <= b["d"]:  # long base already along y, thickness along x
                rot_b, L, T, low = 0, b["d"], b["w"], st.get("topy", 0) < 0.5
            else:                  # turn it 90 deg so the base runs along y; its old x axis becomes +y
                rot_b, L, T, low = 90, b["w"], b["d"], st.get("topx", 0) < 0.5
            m0, by0 = (0.0, it["d"]) if low else (L, 0.0)  # brace behind the module, or in front of it
            w, d, h = it["w"], it["d"] + L, max(it["h"], b["h"])
            angles = {p["id"]: fits([w, d, h], p, edge) for p in printers}
            if any(a is not None for a in angles.values()):
                braces.remove(b)
                out.append({**it, "part": f'{it["part"]} + brace', "w": w, "d": d, "h": h, "grams": it["grams"] + b["grams"], "seconds": it["seconds"] + b["seconds"],
                            "angles": angles, "subs": [(it, 0.0, m0, it["w"], it["d"], 0), (b, (it["w"] - T) / 2, by0, T, L, rot_b)]})
                continue
        out.append(it)
    # a brace whose module is not printed here (no module left in its layer) is useless on its own: report it, do not pack it
    groups_with_module = {it["group"] for it in out if it["kind"] == "module"}
    return out + [b for b in braces if b["group"] in groups_with_module], [b for b in braces if b["group"] not in groups_with_module]


def expand(placed):
    """Blocks of several parts -> the parts, each with its own position and rotation."""
    out = []
    for it in placed:
        if "subs" not in it:
            out.append(it)
            continue
        a = math.radians(it["rot"])
        c, s = math.cos(a), math.sin(a)
        subs = []
        for (sub, fx0, fy0, fw, fd, rs) in it["subs"]:
            lx, ly = (fx0, fy0) if rs == 0 else (fx0 + fw, fy0)  # the sub-part's own origin inside the block
            subs.append({**sub, "x": round(it["x"] + lx * c - ly * s, 2), "y": round(it["y"] + lx * s + ly * c, 2), "rot": (rs + it["rot"]) % 360, "fw": fw, "fd": fd})
        out.extend(expand(subs))  # a block inside a block (module + brace laid across the diagonal)
    return out


def corner_rects(it, bed, gap, m):
    """The two empty corner triangles beside a diagonal part, as the largest axis-aligned rectangles
    inside them (half of each leg), in packer coordinates: small parts of the same colour go there."""
    a = math.radians(it["rot"])
    c, s = math.cos(a), math.sin(a)
    if s < 1e-6 or c < 1e-6:
        return []
    bx, by = bed
    x, y, w, d = it["x"], it["y"], it["w"], it["d"]
    out = []
    px, py = x - d * s, y + d * c                       # upper edge of the part, direction (c, s): top-left triangle above it
    A, B = (px + ((by - m) - py) * c / s) - m, (by - m) - (py + (m - px) * s / c)
    if A > gap and B > gap:
        out.append((0.0, (by - m - B / 2) - m, A / 2 + gap, B / 2 + gap))
    A2, B2 = (bx - m) - (x + (m - y) * c / s), (y + ((bx - m) - x) * s / c) - m   # lower edge through the corner: bottom-right triangle
    if A2 > gap and B2 > gap:
        out.append(((bx - m - A2 / 2) - m, 0.0, A2 / 2 + gap, B2 / 2 + gap))
    return out


def diagonal_rows(group_items, bed, gap, edge):
    """Oversize parts of one size: as many per plate as fit side by side across the diagonal. The n parts
    are treated as one block (w × n·d) whose angle comes from the same fit rule as a single part."""
    it0 = group_items[0]
    swap = it0["w"] < it0["d"]                      # long side along y: the part lies in the block turned 90 deg
    L, T = (it0["d"], it0["w"]) if swap else (it0["w"], it0["d"])
    bx, by = bed
    m = max(edge, SAFE_EDGE)
    rows = []
    while group_items:
        for n in range(len(group_items), 0, -1):
            dn = n * T + (n - 1) * gap
            ang = diagonal_fit(L, dn, bx - 2 * m, by - 2 * m)
            if ang is not None:
                break
        else:
            n, ang = 1, it0["diag"]
        a = math.radians(ang)
        c, s = math.cos(a), math.sin(a)
        dn = n * T + (n - 1) * gap
        chunk, group_items = group_items[:n], group_items[n:]
        block = {**it0, "part": f"{n}× {it0['part']}" if n > 1 else it0["part"], "w": L, "d": dn, "h": max(it["h"] for it in chunk),
                 "grams": sum(it.get("grams", 0) for it in chunk), "seconds": sum(it.get("seconds", 0) for it in chunk),
                 "subs": [(it, 0.0, k * (T + gap), L, T, 90 if swap else 0) for k, it in enumerate(chunk)],
                 "x": round((bx - (L * c + dn * s)) / 2 + dn * s, 2), "y": round((by - (L * s + dn * c)) / 2, 2), "rot": round(ang, 3), "fw": L, "fd": dn}
        rows.append([block])
    return rows


def footprint_corners(it):
    """Plate-local corners of a packed part. Same rotation as the 3MF writer: rotate about the
    part origin, then translate by (x, y)."""
    a = math.radians(it.get("rot") or 0)
    c, s = math.cos(a), math.sin(a)
    w, d = it["w"], it["d"]
    return [(it["x"] + u * c - v * s, it["y"] + u * s + v * c) for u, v in ((0, 0), (w, 0), (w, d), (0, d))]


def plate_fingerprint(plates):
    """Stable id for a layout. A coordinate, part or printer change produces a new id."""
    rows = []
    for pl in plates:
        items = sorted((it["part"], it.get("x"), it.get("y"), it.get("rot"), it.get("file")) for it in pl["items"])
        rows.append({"printer": pl["printer"], "slots": list(pl["slots"]), "items": items})
    return hashlib.sha1(json.dumps(rows, separators=(",", ":")).encode()).hexdigest()[:16]


def plan(parts, settings, stats_fn):
    """parts: BOM lines (with qty). Returns plates and per-part fit info.

    Every plate holds ONE filament (colour changes cost time even on a multi-material printer).
    groupBy: 'color' (default) = all parts of a colour on a printer packed together, fewest plates;
    'size' = large and small parts of one colour stay on separate plates;
    'module' = a module's parts of one colour stay on their own plates."""
    s = {**DEFAULT_SETTINGS, **settings}
    printers = [p for p in s["printers"] if p.get("enabled", True)]
    if s["mode"] != "both":
        printers = [p for p in printers if p["id"] == s["mode"]] or printers
    gap, edge = float(s["spacing"]), float(s["edge"])
    items, unplaceable, load = [], [], {p["id"]: 0.0 for p in printers}
    for line in parts:
        if not line.get("file") or int(line.get("qty", 0)) <= 0:
            continue
        st = stats_fn(line["file"])
        g, sec = estimate(line, st, s)
        angles = {p["id"]: fits(st["size"], p, edge) for p in printers}
        if all(a is None for a in angles.values()):
            unplaceable.append({"name": line["name"], "size": st["size"], "qty": int(line["qty"]), "group": line["group"]})
            continue
        for _ in range(int(line["qty"])):
            items.append({"part": line["name"], "file": line["file"], "group": line["group"], "role": line["role"], "kind": line.get("kind", ""),
                          "slot": int(s["roles"].get(line["role"], 0)), "w": st["size"][0], "d": st["size"][1], "h": st["size"][2],
                          "grams": g, "seconds": sec, "angles": angles})
    items, dropped = combine_braces(items, printers, edge, stats_fn)
    for b in dropped:
        unplaceable.append({"name": b["part"], "size": [b["w"], b["d"], b["h"]], "qty": 1, "group": b["group"], "reason": "its module is not printed, so the brace is pointless"})
    # ---- printer assignment: whole module to one printer (balanced by estimated time), item-wise for 'stack'
    def assign(group_items):
        cands = [p for p in printers if all(it["angles"][p["id"]] is not None for it in group_items)]
        if cands:  # ponytail: greedy least-loaded; good enough for 2 printers
            p = min(cands, key=lambda c: load[c["id"]])
            for it in group_items:
                it["printer"] = p["id"]
                load[p["id"]] += it["seconds"]
        else:  # mixed fit: fall back to per-item placement
            for it in group_items:
                p = min((p for p in printers if it["angles"][p["id"]] is not None), key=lambda c: load[c["id"]])
                it["printer"] = p["id"]
                load[p["id"]] += it["seconds"]
    if s["groupBy"] == "module":
        # unit of assignment: a module's parts that fit the same set of printers, so a tall body that
        # only fits the big printer does not drag the module's small parts along with it
        groups = {}
        for it in items:
            sig = tuple(sorted(pid for pid, a in it["angles"].items() if a is not None))
            groups.setdefault((it["group"], sig), []).append(it)
        for g_items in sorted(groups.values(), key=lambda g: -sum(it["seconds"] for it in g)):
            assign(g_items)
    else:  # ponytail: per-part greedy balance; a colour may end up with one partial plate per printer
        for it in sorted(items, key=lambda it: -it["seconds"]):
            assign([it])
    for it in items:
        a = it["angles"][it["printer"]]
        it["diag"] = None if a in (0.0, 90.0) else a
        del it["angles"]
    plates = []
    nozzle_lists = {}
    for p in printers:
        mine = [it for it in items if it["printer"] == p["id"]]
        # (bed, parts, nozzle). The queue is the nozzle. None means the combined bed, where
        # classify decides the cut. A right-nozzle pack is done in that nozzle's rectangle
        # and then shifted by the catalog origin so the drawing uses combined-plate coordinates.
        queues = [(p["bed"], mine, None)]
        if p.get("nozzleMode") == "h2d-split":
            left_w, right_min = split_reach(p)
            sides = _printer_nozzles(s, p)
            nozzle_lists[p["id"]] = sides
            one, right_parts, wide = [], [], []
            for it in mine:
                fits_one = h2d_split.single_nozzle_angle([it["w"], it["d"], it["h"]], edge, p["bed"], left_w) is not None
                slot = int(it.get("slot") or 0)
                if slot < len(sides) and sides[slot] == "2":
                    if fits_one:
                        right_parts.append(it)
                    else:
                        unplaceable.append({"name": it["part"], "size": [it["w"], it["d"], it["h"]], "qty": 1, "group": it["group"],
                                            "reason": "this filament prints on the right nozzle only, and the part does not fit there"})
                    continue
                if fits_one:
                    one.append(it)
                else:
                    wide.append(it)
            queues = [([left_w, p["bed"][1]], one, "left"),
                      ([left_w, p["bed"][1]], right_parts, "right"),
                      (list(p["bed"]), wide, None)]

        def keyf(it):
            if s["groupBy"] == "size":
                bed = next(pr["bed"] for pr in printers if pr["id"] == it["printer"])
                band = "large" if max(it["w"], it["d"]) > 0.5 * min(bed) else "small"
                return (band, it["slot"])
            return (it["group"] if s["groupBy"] == "module" else "", it["slot"])
        for pack_bed, group, nozzle in queues:
            for key in sorted({keyf(it) for it in group}, key=str):
                bucket = sorted([it for it in group if keyf(it) == key], key=lambda it: -(it["w"] * it["d"]))
                # oversize parts that only fit across the diagonal: same size + angle share a plate, side by side
                diag = {}
                for it in bucket:
                    if it["diag"] is not None:
                        diag.setdefault((round(it["diag"], 1), it["w"], it["d"]), []).append(it)
                packers = []
                for g_items in diag.values():
                    for row in diagonal_rows(g_items, pack_bed, gap, edge):
                        pk = Shelf(pack_bed, max(edge, SAFE_EDGE), gap)
                        pk.items, pk.diagonal = row, True
                        pk.free = corner_rects(row[0], pack_bed, gap, pk.edge) if len(row) == 1 else []  # the corners stay usable
                        packers.append(pk)
                for it in bucket:
                    if it["diag"] is not None:
                        continue
                    if not any(pk.place(it) for pk in packers):
                        pk = Shelf(pack_bed, max(edge, SAFE_EDGE), gap)
                        if not pk.place(it):  # as big as the bed itself: fits() allowed it with the user's keep-out, so centre it
                            pk.place_centred(it, int(fits([it["w"], it["d"], it["h"]], p, edge) or 0))
                        packers.append(pk)
                for pk in packers:
                    packed = expand(pk.items)
                    if nozzle == "right":
                        for it in packed:
                            it["x"] = round(it["x"] + right_min, 2)
                            it["nozzle"] = "right"
                    elif nozzle == "left":
                        for it in packed:
                            it["nozzle"] = "left"
                    plates.append({"printer": p["id"], "group": key[0], "slots": sorted({i["slot"] for i in pk.items}), "items": packed, "fill": round(pk.fill(), 2),
                                   "bed": list(p["bed"]), "origin": list(p.get("origin") or (0, 0)),
                                   **({"diagonal": True} if getattr(pk, "diagonal", False) else {})})
    for n, pl in enumerate(plates):
        pl["name"] = plate_name(n + 1, pl, s)
        pl["grams"] = round(sum(i["grams"] for i in pl["items"]), 1)
        pl["seconds"] = round(sum(i["seconds"] for i in pl["items"]))
        pl["height"] = max(i["h"] for i in pl["items"])
    pieces = sum(int(l.get("qty", 0)) for l in parts if l.get("file"))
    placed = sum(len(pl["items"]) for pl in plates)
    result = {"plates": plates, "unplaceable": unplaceable, "load": load, "pieces": pieces, "placed": placed,
              "nozzleLists": nozzle_lists,  # one "1"/"2" per filament slot, shared with the 3MF map and the cut
              "missing": pieces - placed}  # placed + unplaceable quantities must add up to the BOM; anything else is a bug
    for pl in plates:
        owner = next(pr for pr in printers if pr["id"] == pl["printer"])
        reach = split_reach(owner) if owner.get("nozzleMode") == "h2d-split" else None
        for it in pl["items"]:
            exact = list(footprint_corners(it))
            if reach and it.get("nozzle") in ("left", "right"):
                if not h2d_split.in_packed_reach(exact, owner["bed"], reach[0], reach[1], it["nozzle"]):
                    it["nozzle"] = "unsplittable"
                    it.pop("splitX", None)
            elif reach:
                h2d_split.classify(it, exact, owner["bed"], reach[0], reach[1])
            it["corners"] = [[round(x, 2), round(y, 2)] for x, y in exact]
    result["fingerprint"] = plate_fingerprint(plates)
    return result


def plate_name(n, plate, s):
    fil = s["filaments"][plate["slots"][0]]["name"].split("·")[-1].strip() if plate["slots"] else "?"
    grp = re.sub(r"[^A-Za-z0-9+·]+", " ", plate["group"]).strip()
    return (grp + " · " if grp else "") + fil


def filament_presets(s, p):
    """One filament preset per slot for printer `p`: the slot's choice for this printer, or the material match."""
    import presets as presets_mod
    if p.get("slicer") not in presets_mod.SLICERS:
        return []
    return [(f.get("preset") or {}).get(p["id"]) or presets_mod.default_filament(p["slicer"], p.get("profile", ""), p.get("nozzle", ""), f.get("material", "PETG"),
                                                                                  brand=(f.get("name") or "").split(" ")[0])
            for f in s["filaments"]]


def _printer_nozzles(s, p):
    """The one nozzle list for this printer: settings material plus the preset's filament_printable."""
    filaments = s.get("filaments") or []
    materials = [f.get("material") or "PETG" for f in filaments]
    if p.get("slicer") not in presets.SLICERS:
        names = [""] * len(materials)
    else:
        names = filament_presets(s, p)
        if len(names) != len(materials):
            names = [""] * len(materials)
    return presets.nozzle_list(materials, presets.read_filament_printables(p.get("slicer"), names))


def project_for(s, p, nozzles=None):
    """project_settings.config for one printer: its machine + default process preset and one filament
    preset per slot (filament_presets). None when unknown.

    nozzles, when given, is the list plan already packed with. The project writes that list.
    """
    import presets as presets_mod
    if p.get("slicer") not in presets_mod.SLICERS or not p.get("preset"):
        return None, []
    machine = p.get("machine") or f"{p.get('profile', '')} {p.get('nozzle', '')} nozzle".strip()
    names = filament_presets(s, p)
    colours = [(f.get("color") or "#808080").upper() for f in s["filaments"]]
    materials = [f.get("material") or "PETG" for f in s["filaments"]]
    try:
        return presets_mod.project_config(p["slicer"], machine, p["preset"], names, colours, p.get("nozzleSide"),
                                          materials, p.get("nozzleMode") == "h2d-split", nozzles), names
    except ValueError as e:
        return {"_error": str(e)}, names


def export(plan_result, settings, out_dir, root, stats_fn, stack_name="vault", suffix="", log=print, progress=lambda pct, msg: None):
    """One 3MF per printer, holding all of that printer's plates. Each distinct STL is stored once
    per file; repeats are instances (possibly on different plates). Parts carry the settings of
    their assigned process preset as per-object overrides (relative to the printer's default preset);
    the file also carries a full project config (printer, process, filaments with your colours)."""
    import presets as presets_mod
    s = {**DEFAULT_SETTINGS, **settings}
    os.makedirs(out_dir, exist_ok=True)
    written = []
    total = sum(len({(it["file"], it["role"], preset_for(s, p, it)) for pl in plan_result["plates"] if pl["printer"] == p["id"] for it in pl["items"]}) for p in s["printers"]) + len({pl["printer"] for pl in plan_result["plates"]})
    done = 0
    for p in s["printers"]:
        mine = [pl for pl in plan_result["plates"] if pl["printer"] == p["id"]]
        if not mine:
            continue
        t = time.time()
        allp = presets_mod.load_all(p["slicer"]) if p.get("slicer") in presets_mod.SLICERS else {}
        objects, index, plates = [], {}, []
        warn_parts = []
        ox, oy = p.get("origin") or (0, 0)  # where this nozzle's reach starts on the plate
        full_bed = (p["bed"][0] + ox, p["bed"][1] + oy)
        sides = (plan_result.get("nozzleLists") or {}).get(p["id"])
        left_ex, right_ex = presets.cut_extruders(sides)
        for pl in mine:
            items = []
            for it in pl["items"]:
                preset = preset_for(s, p, it)
                cfg = presets_mod.overrides(p.get("slicer", ""), preset, p.get("preset", ""), allp) if allp else {}
                if it.get("nozzle") == "unsplittable":
                    warn_parts.append(it["part"])
                    continue
                if it.get("nozzle") == "split":
                    if not left_ex or not right_ex:
                        warn_parts.append(it["part"])
                        continue
                    progress(100 * done / total, f"{p['name']}: cutting {it['part']} for the two nozzles")
                    raw = mesh.load_aligned(root, it["file"], stats_fn(it["file"]))
                    halves = h2d_split.split_for_pose(raw, it["x"], it["rot"], it["splitX"])
                    if not halves:
                        warn_parts.append(it["part"])
                        continue
                    left, right = halves
                    objects.append({"name": it["part"] + " (cut to parts)", "config": cfg, "parts": [
                        {"name": it["part"] + " · left nozzle", "mesh": left, "extruder": left_ex},
                        {"name": it["part"] + " · right nozzle", "mesh": right, "extruder": right_ex},
                    ]})
                    items.append((len(objects) - 1, it["x"] + ox, it["y"] + oy, it["rot"]))
                    done += 1
                    continue
                key = (it["file"], it["role"], preset)
                if key not in index:
                    progress(100 * done / total, f"{p['name']}: reading {it['part']} ({done + 1}/{total})")
                    index[key] = len(objects)
                    objects.append({"name": it["part"] + (f" ({preset})" if preset and preset != p.get("preset") else ""),
                                    "mesh": mesh.load_aligned(root, it["file"], stats_fn(it["file"])),
                                    "extruder": int(s["roles"].get(it["role"], 0)) + 1, "config": cfg})
                    done += 1
                items.append((index[key], it["x"] + ox, it["y"] + oy, it["rot"]))
            if items:
                plates.append({"name": pl["name"], "items": items})
        pname = re.sub(r"[^A-Za-z0-9]+", "-", p["name"]).strip("-")
        path = os.path.join(out_dir, f"{stack_name}{suffix}_{pname}.3mf")
        progress(100 * done / total, f"{p['name']}: writing {os.path.basename(path)} ({len(plates)} plates)")
        split_file = any(obj.get("parts") for obj in objects)
        project, fil_names = project_for(s, p, sides)
        warn = h2d_split.MANUAL_STEPS if split_file else None
        note = None
        if project:
            err = project.pop("_error", None)
            note = project.pop("_tpu_note", None)
            if not project:
                project = None
            if err:
                warn = (warn + " " if warn else "") + err
        elif not split_file:
            warn = "no slicer preset chosen for this printer; opened file keeps the slicer's current presets"
        if note:
            warn = (warn + " " if warn else "") + note
        if warn_parts:
            warn = (warn + " " if warn else "") + "Not exported, the cut could not be closed or the part is over 350 mm: " + ", ".join(warn_parts)
        if not objects:
            written.append({"file": path, "printer": p["name"], "plates": 0, "items": 0, "overrides": 0, "filaments": [],
                            "warning": warn, "outside": [], "seconds": round(time.time() - t, 1)})
            continue
        mesh.write_3mf(path, objects, plates, full_bed, f"{stack_name}{suffix} · {p['name']}", project if project else None)
        progress(100 * done / total, f"{p['name']}: checking every piece is on its plate")
        outside = mesh.verify_3mf(path, full_bed, reach=(ox, oy, *p["bed"]))  # read back the way the slicer will
        if outside:
            warn = (warn + " · " if warn else "") + f"{len(outside)} piece(s) not entirely on their plate: " + ", ".join(f"{o['name']} (plate {o['plate']}, {o['overhang_mm']} mm)" for o in outside[:4])
        done += 1
        for pl in mine:
            pl["file"] = os.path.basename(path)
        written.append({"file": path, "printer": p["name"], "plates": len(plates), "items": sum(len(pl["items"]) for pl in plates),
                        "overrides": sum(1 for o in objects if o["config"]), "filaments": fil_names, "warning": warn, "outside": outside,
                        "seconds": round(time.time() - t, 1)})
        log(f"wrote {path} ({len(plates)} plates, {time.time() - t:.1f}s)")
    progress(100, "done")
    return written


def sample_plan():
    """Synthetic bed picture for an empty archive. Not VAULT geometry."""
    stats = {"large": {"size": [160, 70, 30], "volume_cm3": 40, "area_cm2": 180},
             "small": {"size": [28, 28, 8], "volume_cm3": 2, "area_cm2": 20}}
    parts = [{"name": "synthetic large", "file": "large", "qty": 1, "role": "main", "group": "sample", "kind": "other"},
             {"name": "synthetic small", "file": "small", "qty": 4, "role": "accent", "group": "sample", "kind": "other"}]
    u1 = next(p for p in DEFAULT_PRINTERS if p["id"] == "u1")
    result = plan(parts, {"printers": [u1], "mode": "u1", "groupBy": "color"}, lambda f: stats[f])
    result["synthetic"] = True
    result["label"] = "Synthetic rectangles on a Snapmaker U1 bed. Not VAULT parts."
    return result


def plan_tests(parts, settings, kinds, stats_fn):
    """Test plates: per printer, one plate per selected kind holding one of each part of that kind
    (an assembly's parts together), so settings can be tuned before the real export."""
    s = {**DEFAULT_SETTINGS, **settings}
    printers = [p for p in s["printers"] if p.get("enabled", True)]
    if s["mode"] != "both":
        printers = [p for p in printers if p["id"] == s["mode"]] or printers
    plates = []
    for p in printers:
        for kind in kinds:
            lines = [{**l, "qty": 1} for l in parts if l.get("kind") == kind and l.get("file")]
            if not lines:
                continue
            sub = plan(lines, {**s, "mode": p["id"], "groupBy": "color"}, stats_fn)
            for pl in sub["plates"]:
                pl["name"] = f"TEST {kind}" + (" (diagonal)" if pl.get("diagonal") else "")
                pl["group"] = kind
                plates.append(pl)
    return {"plates": plates, "unplaceable": [], "load": {}}


if __name__ == "__main__":  # self-check on synthetic parts
    stats = {"a": {"size": [100, 50, 30], "volume_cm3": 100, "area_cm2": 400}, "b": {"size": [300, 40, 20], "volume_cm3": 50, "area_cm2": 300}, "c": {"size": [20, 20, 150], "volume_cm3": 1, "area_cm2": 10}}
    g, _ = estimate({"name": "x"}, {"volume_cm3": 262.1, "area_cm2": 1571.6}, DEFAULT_SETTINGS)
    assert abs(g - 202.5) < 12, g  # S3 module body: sheet says 202.5 g
    # Geometry fixtures stay the H2C reachable bed and the Kobra's short-part limit. They are not the default fleet.
    legacy = {"printers": [
        {"id": "h2c", "name": "Bambu Lab H2C", "bed": [325, 320], "z": 320, "maxH": 320, "enabled": True, "slicer": "bambu", "profile": "Bambu Lab H2C", "nozzle": "0.4"},
        {"id": "kobrax", "name": "Anycubic Kobra X", "bed": [260, 260], "z": 260, "maxH": 120, "enabled": True, "slicer": "anycubic", "profile": "Anycubic Kobra X", "nozzle": "0.4"},
    ]}
    h2c, kobra = legacy["printers"]
    a = fits([330, 105, 272], h2c)
    assert a is not None and 0 < a < 90 and fits([330, 105, 272], kobra) is None  # L6 2U module: H2C across the diagonal, Kobra too tall
    rows = diagonal_rows([{"diag": a, "w": 330, "d": 105, "h": 272, "slot": 0, "part": "L"} for _ in range(3)], h2c["bed"], 6, 0)
    assert [len(r) for r in rows] == [1, 1, 1]  # a 330 mm module across the 325 bed leaves no room for a second one...
    for (gw, gd) in ((270, 27), (27, 270)):  # ...but thin 270 mm runner guides go three per Kobra plate, whichever way the STL lies
        bars = [expand(r) for r in diagonal_rows([{"diag": 25.0, "w": gw, "d": gd, "h": 10, "slot": 0, "part": "guide", "grams": 1, "seconds": 1} for _ in range(7)], kobra["bed"], 6, 0)]
        assert [len(r) for r in bars] == [3, 3, 1], [len(r) for r in bars]
        for r in bars:
            for it in r:
                for px, py in footprint_corners({**it, "w": gw, "d": gd}):
                    assert SAFE_EDGE - 1e-6 <= px <= 260 - SAFE_EDGE + 1e-6 and SAFE_EDGE - 1e-6 <= py <= 260 - SAFE_EDGE + 1e-6, (gw, gd, it, px, py)
    turned = [(round(x), round(y)) for x, y in footprint_corners({"x": 10, "y": 20, "w": 30, "d": 40, "rot": 90})]
    assert turned == [(10, 20), (10, 50), (-30, 50), (-30, 20)]
    pk = Shelf(h2c["bed"], SAFE_EDGE, 6)
    pk.items, pk.free = expand(rows[0]), corner_rects(rows[0][0], h2c["bed"], 6, SAFE_EDGE)
    assert len(pk.free) == 2 and pk.place({"w": 40, "d": 40, "h": 10, "part": "small"})  # ...but small parts go into the empty corners
    sm = pk.items[-1]
    assert sm["x"] >= SAFE_EDGE and sm["y"] >= SAFE_EDGE and sm["x"] + 40 <= 325 and sm["y"] + 40 <= 320, sm
    blk, dropped = combine_braces([{"kind": "module", "group": "g", "slot": 0, "part": "M", "file": "m", "w": 165, "d": 100, "h": 150, "grams": 1, "seconds": 1, "angles": {}},
                                   {"kind": "manual supports", "group": "g", "slot": 0, "part": "B", "file": "b", "w": 6, "d": 60, "h": 150, "grams": 1, "seconds": 1, "angles": {}},
                                   {"kind": "manual supports", "group": "g2", "slot": 0, "part": "B2", "file": "b", "w": 6, "d": 60, "h": 150, "grams": 1, "seconds": 1, "angles": {}}],
                                  [h2c], 0, lambda f: {"topy": 0.02, "topx": 0.5})
    assert len(blk) == 1 and blk[0]["d"] == 160 and blk[0]["subs"][1][2] == 100  # brace stands behind the module, its low-y edge on the face
    assert [b["part"] for b in dropped] == ["B2"]  # a brace without a module is reported, not packed
    parts_ = expand([{**blk[0], "x": 10, "y": 20, "rot": 90}])
    assert parts_[0]["rot"] == 90 and parts_[1]["rot"] == 90 and round(parts_[1]["x"], 1) == round(10 - 100, 1), parts_
    nested = expand([r[0] for r in diagonal_rows([{**blk[0], "diag": 30.0}], h2c["bed"], 6, 0)])
    assert [p["part"] for p in nested] == ["M", "B"] and all("subs" not in p for p in nested), nested  # a block across the diagonal still yields its parts
    parts = [{"name": "A", "file": "a", "qty": 5, "role": "main", "group": "g1"},
             {"name": "B", "file": "b", "qty": 1, "role": "accent", "group": "g1"},
             {"name": "C", "file": "c", "qty": 1, "role": "main", "group": "g1"}]
    r = plan(parts, {**legacy, "mode": "kobrax"}, lambda f: stats[f])
    assert r["unplaceable"] and r["unplaceable"][0]["name"] == "C"          # taller than the Kobra's 120 mm part limit
    assert sum(len(p["items"]) for p in r["plates"]) == 6
    assert any(p.get("diagonal") for p in r["plates"])                      # 300 mm bar goes diagonal on a 260 bed
    assert all(len(p["slots"]) == 1 for p in r["plates"])                   # one filament per plate, always
    r2 = plan(parts, {**legacy, "mode": "both"}, lambda f: stats[f])
    assert sum(len(p["items"]) for p in r2["plates"]) == 7                  # C fits the H2C
    assert all(it["printer"] == "h2c" for p in r2["plates"] for it in p["items"] if it["part"] == "C")
    assert all(len(p["slots"]) == 1 for p in r2["plates"])
    parts2 = parts + [{"name": "D", "file": "a", "qty": 2, "role": "accent", "group": "g2"}, {"name": "E", "file": "a", "qty": 1, "role": "main", "group": "g2"}]
    r3 = plan(parts2, {**legacy, "mode": "kobrax", "groupBy": "color"}, lambda f: stats[f])
    acc = [p for p in r3["plates"] if p["slots"] == [DEFAULT_SETTINGS["roles"]["accent"]]]
    assert sum(len(p["items"]) for p in acc) == 3 and len(acc) <= 2, acc   # accent parts of g1+g2 share plates (B is the diagonal bar; D×2 fill its corners or one more plate)
    for p in r2["plates"]:
        for it in p["items"]:
            assert it["x"] >= 0 and it["y"] >= 0
    # MaxRects: 25 parts of 50×50 on a 260 bed with 6 mm gap -> 4 per row/col = 16 per plate -> 2 plates
    many = [{"name": "Q", "file": "q", "qty": 25, "role": "main", "group": "g"}]
    r4 = plan(many, {**legacy, "mode": "kobrax"}, lambda f: {"size": [50, 50, 10], "volume_cm3": 10, "area_cm2": 100})
    assert len(r4["plates"]) == 2 and len(r4["plates"][0]["items"]) == 16, [len(p["items"]) for p in r4["plates"]]
    for p in r4["plates"]:
        boxes = [(i["x"], i["y"], i["x"] + i["fw"], i["y"] + i["fd"]) for i in p["items"]]
        for a in boxes:
            assert a[2] <= 260 + 1e-6 and a[3] <= 260 + 1e-6
            for b in boxes:
                assert a is b or a[2] + 6 <= b[0] + 1e-6 or b[2] + 6 <= a[0] + 1e-6 or a[3] + 6 <= b[1] + 1e-6 or b[3] + 6 <= a[1] + 1e-6
    assert diagonal_fit(300, 40, 260, 260) is not None and diagonal_fit(418.8, 51.5, 330, 320) is None  # XL module: ~333 mm at 45°
    fleet = {p["id"]: p for p in DEFAULT_PRINTERS}
    assert set(fleet) == {"u1", "p1s", "h2d-left", "h2d-right"}
    assert fleet["u1"]["slicer"] == "orca" and fleet["u1"]["bed"] == [270, 270]
    assert fleet["p1s"]["bed"] == [256, 256] and fleet["p1s"]["z"] == 250
    assert fleet["h2d-left"].get("origin", [0, 0]) == [0, 0]
    assert fleet["h2d-right"]["origin"] == [25, 0] and fleet["h2d-right"]["bed"][0] == 325
    assert all(fits([160, 80, 40], p) is not None for p in fleet.values())
    assert fits([100, 80, 300], fleet["p1s"]) is None  # taller than the P1S
    assert fits([400, 200, 20], fleet["u1"]) is None
    sized = [{"name": "Big", "file": "a", "qty": 1, "role": "main", "group": "g"},
             {"name": "Small", "file": "q", "qty": 3, "role": "main", "group": "g"}]
    rs = plan(sized, {"printers": [fleet["u1"]], "mode": "u1", "groupBy": "size"},
              lambda f: {"a": {"size": [160, 80, 20], "volume_cm3": 20, "area_cm2": 80}, "q": {"size": [30, 30, 10], "volume_cm3": 2, "area_cm2": 20}}[f])
    for pl in rs["plates"]:
        names = {it["part"] for it in pl["items"]}
        assert names <= {"Big"} or names <= {"Small"}, names
        for it in pl["items"]:
            for x, y in footprint_corners(it):
                assert -0.05 <= x <= 270.05 and -0.05 <= y <= 270.05, (it, x, y)
    moved = json.loads(json.dumps(rs["plates"]))
    moved[0]["items"][0]["x"] = moved[0]["items"][0]["x"] + 1
    assert plate_fingerprint(moved) != rs["fingerprint"]
    sample = sample_plan()
    assert sample["synthetic"] and sample["placed"] == 5 and all(pl["bed"] == [270, 270] for pl in sample["plates"])
    print("plates.py self-check ok:", len(r["plates"]), "plates kobra;", len(r2["plates"]), "plates both")
