"""Local web server for the VAULT configurator.  Run:  python server.py  (opens the browser)."""
import copy
import io
import json
import mimetypes
import os
import re
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
import webbrowser
import zipfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
UI_DIST = os.path.join(HERE, "web", "dist")
# the VAULT archive (01. DRAWERS, 02. SUSTAINERS, 03. MODIFICATIONS, the manuals): next to this folder by
# default, or wherever VAULT_ARCHIVE points (Docker mounts it at /archive)
ROOT = os.path.abspath(os.environ.get("VAULT_ARCHIVE") or os.path.dirname(HERE))
sys.path.insert(0, HERE)
import assets_bootstrap  # noqa: E402
import version  # noqa: E402
import catalog  # noqa: E402
import mesh  # noqa: E402
import plates  # noqa: E402
import planner  # noqa: E402
import stackfit  # noqa: E402
import presets  # noqa: E402

PORT = int(os.environ.get("VAULT_PORT") or os.environ.get("PORT") or 8765)
INDEX = catalog.Index(ROOT)
BUILD = version.build_id(HERE)
SITE = catalog.load_site_data(os.path.join(HERE, "site_print_data.json"))
STATS = mesh.StatsCache(ROOT, os.path.join(HERE, "cache", "stats.json"))
LOCK = threading.Lock()
BUSY = threading.Semaphore(0)  # counts running user requests; the precache thread yields while any run


def archive_rel(rel):
    """An archive path from the page, with either separator, as this OS writes it (the page names a few
    parts by fixed path; those must work on a Linux server as well as on Windows)."""
    return os.path.normpath(rel.replace("\\", "/"))


def busy():
    return BUSY._value > 0  # ponytail: peeking at the counter is enough for a yield hint
PROGRESS = {"msg": "", "done": 0, "total": 0}
# printable volumes from USSA's printer-fit table, named when a part fits none of the user's printers
BIGGER = {"Bambu Lab H2S": (340, 320, 340), "Bambu Lab A2L": (330, 320, 325)}


def stats_fn(rel):
    with LOCK:
        return STATS.get(rel)


def thumb(rel):
    """Shaded thumbnail of one archive STL, rendered once and cached on disk; returns the PNG path."""
    cache = os.path.join(HERE, "cache", "thumbs", re.sub(r"[^A-Za-z0-9]+", "_", rel) + ".png")
    if os.path.exists(cache):
        return cache
    with LOCK:  # the warm-up and a page request may ask for the same picture at once
        if not os.path.exists(cache):
            os.makedirs(os.path.dirname(cache), exist_ok=True)
            png = mesh.thumb_png(mesh.read_stl(os.path.join(ROOT, rel)))
            with open(cache + ".tmp", "wb") as f:
                f.write(png)
            os.replace(cache + ".tmp", cache)
    return cache


def precache():
    """Measure and picture every archive part in the background, so nothing waits on first view
    (also hydrates Google Drive). Yields to requests; the cache folder keeps it across restarts."""
    files = [f[2] for f in INDEX.files]
    PROGRESS["total"] = len(files)
    for i, rel in enumerate(files):
        PROGRESS["done"] = i
        while busy():
            time.sleep(0.1)
        try:
            stats_fn(rel)
            thumb(rel)
        except Exception as e:  # keep going; the file is retried on demand
            print("precache skip", rel, e)
    PROGRESS["done"] = len(files)


def settings_of(body):
    s = {**plates.DEFAULT_SETTINGS, **(body.get("settings") or {})}
    _validate_settings(s)
    return s


def _positive(value, what):
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{what} needs a number.") from None
    if number != number or number <= 0:  # NaN or non-positive
        raise ValueError(f"{what} must be above 0.")
    return number


def _nonnegative(value, what):
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{what} needs a number.") from None
    if number != number or number < 0:
        raise ValueError(f"{what} must be at least 0.")
    return number


def _validate_settings(s):
    """A zero-sized bed or estimate must fail here, not as nonsense plates downstream."""
    for p in s.get("printers") or []:
        name = p.get("name") or p.get("id") or "Printer"
        bed = p.get("bed") or []
        if len(bed) != 2:
            raise ValueError(f"{name} bed needs two numbers.")
        _positive(bed[0], f"{name} bed X")
        _positive(bed[1], f"{name} bed Y")
        _positive(p.get("z"), f"{name} Z")
        if p.get("maxH") is not None:
            _positive(p["maxH"], f"{name} max part height")
    for key in ("spacing", "edge", "infill"):
        if s.get(key) is not None:
            _nonnegative(s[key], key)
    for key in ("wallMm", "secondsPerGram", "density"):
        if s.get(key) is not None:
            _positive(s[key], key)


def biggest_printer(s):
    """The biggest printer this export will actually use. Same list as plan()."""
    ps = plates.printers_for_export(s)
    return max(ps, key=lambda p: p["bed"][0] * p["bed"][1]) if ps else None


def estimate_from_preset(s, p):
    """Shell thickness and infill fraction of the printer's default process preset (the user can override)."""
    if not p or p.get("slicer") not in presets.SLICERS or not p.get("preset"):
        return None
    P = presets.flatten(p["preset"], presets.load_all(p["slicer"], "process"))
    if not P:
        return None
    first = lambda k, d: float(str((P.get(k) or [d])[0] if isinstance(P.get(k), list) else P.get(k, d)).rstrip("%") or d)
    walls, lw = first("wall_loops", 2), first("outer_wall_line_width", 0.42) or first("line_width", 0.42)
    density = first("sparse_infill_density", 15) / 100.0
    return {"wallMm": round(walls * lw, 2), "infill": round(density, 3), "preset": p["preset"], "printer": p["name"], "walls": int(walls), "lineWidth": lw}


def compute_bom(body):
    body = dict(body)
    body["stack"] = stackfit.normalize(copy.deepcopy(body.get("stack") or {}))
    s = settings_of(body)
    big = biggest_printer(s)
    est = estimate_from_preset(s, big) if s.get("estimateFromPreset", True) else None
    if est:
        s["wallMm"], s["infill"] = est["wallMm"], est["infill"]
    fits_whole = (lambda rel: plates.fits(stats_fn(rel)["size"], big, float(s["edge"])) is not None) if big else (lambda rel: True)
    bom = catalog.Bom(INDEX, SITE, fits_whole).build(body["stack"])
    overrides = body.get("overrides") or {}
    kind_roles = s.get("kindRoles") or {}
    enabled = [p for p in s["printers"] if p.get("enabled", True)]
    for line in bom["parts"]:
        key = f'{line["group"]}|{line["name"]}'
        if kind_roles.get(line.get("kind")):
            line["role"] = kind_roles[line["kind"]]
        if key in overrides:
            o = overrides[key]
            if "qty" in o:
                line["qty"] = int(o["qty"])
            if "role" in o:
                line["role"] = o["role"]
        if line["file"]:
            st = stats_fn(line["file"])
            g, sec = plates.estimate(line, st, s)
            line.update({"size": st["size"], "volume_cm3": st["volume_cm3"], "tris": st["tris"], "grams": round(g, 1), "seconds": round(sec),
                         "fits": {p["id"]: plates.fits(st["size"], p, float(s["edge"])) is not None for p in enabled}})
    bom["estimate"] = est or {"wallMm": s["wallMm"], "infill": s["infill"], "preset": None}
    bom["filamentPresets"] = {p["id"]: plates.filament_presets(s, p) for p in enabled}  # what the export will use, shown as "auto"
    for l in bom["parts"]:  # say exactly why a part fits no printer: which dimension, against which limit
        if l.get("fits") and not any(l["fits"].values()):
            w, d, h = l["size"]
            why = []
            for p in enabled:
                lim = min(p["z"], p.get("maxH") or p["z"])
                if h > lim:
                    why.append(f'{p["name"]}: {h:.0f} mm tall, limit {lim:.0f} mm' + (" (no tall parts)" if lim < p["z"] else " (Z)"))
                else:
                    area = f'{p["bed"][0]}×{p["bed"][1]} mm' + (", what one nozzle reaches (the 330 mm plate is only covered by both nozzles together)" if p.get("id") == "h2c" else " bed")
                    keep = f', minus your {float(s["edge"]):g} mm edge' if float(s["edge"]) else ""
                    why.append(f'{p["name"]}: footprint {w:.1f}×{d:.1f} mm does not fit {area}{keep}, even rotated')
            bigger = [f"{n} ({x}×{y}×{z} mm)" for n, (x, y, z) in BIGGER.items() if h <= z and plates.diagonal_fit(w, d, x, y) is not None]
            bom["warnings"].append(f'{l["group"]}: {l["qty"]}× {l["name"]} ({w:.1f}×{d:.1f}×{h:.1f} mm) cannot be printed. ' + "; ".join(why) + "."
                                   + (f" It fits a {' or a '.join(bigger)}." if bigger else ""))
    judged, scope = stackfit.judged_printers(s, body.get("fitTarget"))
    bom["judged"] = {"scope": scope, "printers": [{"id": p["id"], "name": p["name"]} for p in judged]}
    bom["stack"] = body["stack"]
    if body.get("fitChoices") and judged:
        bom["optionFits"] = stackfit.fit_choices(body["stack"], judged, float(s["edge"]), INDEX, SITE, stats_fn, fits_whole)
        bom["optionFits"]["scope"] = scope
        bom["optionFits"]["printers"] = bom["judged"]["printers"]
        bom["choices"] = bom["optionFits"]
    else:
        bom["choices"] = stackfit.choice_frame(body["stack"])
    return bom, s


def write_bom_md(path, stack, bom, plan_result, s):
    name_of = {p["id"]: p["name"] for p in s["printers"]}
    L = [f"# {stack.get('name') or 'VAULT stack'}", "", f"Depth {stack.get('depth')} ({156.1 + (int(stack.get('depth', 3)) - 3) * 42:.1f} mm), "
         f"{len(stack.get('layers', []))} layers.", "", "## Printed parts", "", "| Group | Part | Qty | Filament | Est. g | Est. time | Size (mm) | Note |", "|---|---|---|---|---|---|---|---|"]
    tot_g = tot_s = tot_n = 0
    for p in bom["parts"]:
        q = int(p["qty"])
        g, sec = p.get("grams", 0) * q, p.get("seconds", 0) * q
        tot_g, tot_s, tot_n = tot_g + g, tot_s + sec, tot_n + q
        size = " × ".join(f"{v:.0f}" for v in p.get("size", [])) if p.get("size") else "?"
        L.append(f"| {p['group']} | {p['name']} | {q} | {s['filaments'][s['roles'].get(p['role'], 0)]['name']} | {g:.0f} | {tot_h(sec)} | {size} | {p.get('note', '')} |")
    L += ["", f"**Total: {tot_n} pieces · ≈{tot_g:.0f} g · ≈{tot_h(tot_s)}** (sheet values where the designer supplied them, otherwise shell {s['wallMm']} mm + infill {s['infill']})", "",
          "## Hardware", "", "| Item | Qty | Where |", "|---|---|---|"]
    L += [f"| {h['item']} | {h['qty']} | {h['notes']} |" for h in bom["hardware"]]
    L += ["", "## Plates", ""]
    for n, pl in enumerate(plan_result["plates"]):
        fil = ", ".join(s["filaments"][k]["name"] for k in pl["slots"])
        L.append(f"### {pl.get('file', '')} · plate {n + 1}: {pl['name']} · {name_of.get(pl['printer'], pl['printer'])} · {fil} · ≈{pl['grams']:.0f} g · ≈{tot_h(pl['seconds'])}" + (" · diagonal placement" if pl.get("diagonal") else ""))
        counts = {}
        for it in pl["items"]:
            counts[it["part"]] = counts.get(it["part"], 0) + 1
        L += [f"- {n} × {k}" for k, n in counts.items()] + [""]
    if plan_result["unplaceable"]:
        L += ["## Does not fit any enabled printer", ""] + [f"- {u['name']} ({' × '.join(f'{v:.0f}' for v in u['size'])} mm)" for u in plan_result["unplaceable"]]
    if bom["warnings"]:
        L += ["", "## Warnings", ""] + [f"- {w}" for w in bom["warnings"]]
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")


def tot_h(sec):
    m = round(sec / 60)
    return f"{m // 60}h {m % 60:02d}m"


EXPORT = {"running": False, "percent": 0, "msg": "", "result": None, "error": None}
EXPORTED = {}  # basename -> real path, only files this process wrote under output/


def output_root():
    return os.path.join(HERE, "output")


def remember_written(paths):
    for path in paths:
        if path and os.path.isfile(path):
            planner.remember_export(path, EXPORTED, output_root())


def handoff_meta(loopback):
    """What this process can open, and the sentence the page should show."""
    if not loopback:
        return "none", ("This page is not on the computer running the planner. Download the 3MF and open it in "
                        "Bambu Studio or OrcaSlicer. Opening an app needs the planner running on that Mac or PC, "
                        "not in a hosted browser or on a NAS.")
    if sys.platform == "darwin":
        return "mac", ("Opens the exported 3MF in Bambu Studio or OrcaSlicer on this Mac. If the app is missing, "
                       "macOS says so and the download still works.")
    if sys.platform == "win32":
        return "windows", ("Shows the export folder, or opens the 3MF with the app Windows has associated with it. "
                           "The download is there either way.")
    return "none", ("This computer is not macOS or Windows, so the planner cannot hand a file to Bambu Studio or "
                    "OrcaSlicer. Download the 3MF and open it yourself.")


def run_export(body, test):
    """Background export; the UI polls /api/export_status for percent + message."""
    BUSY.release()
    t = time.time()
    try:
        bom, s = compute_bom(body)
        name = re.sub(r"[^A-Za-z0-9_-]+", "-", body["stack"].get("name") or "vault-stack").strip("-") or "vault-stack"
        out = os.path.join(HERE, "output", name)

        def progress(pct, msg):
            EXPORT.update({"percent": round(pct), "msg": msg})
        if test:
            pr = plates.plan_tests(bom["parts"], s, body.get("kinds") or [], stats_fn)
            files = plates.export(pr, s, out, ROOT, stats_fn, stack_name=name, suffix="_TEST", progress=progress)
            extra = []
        else:
            pr = plates.plan(bom["parts"], s, stats_fn)
            files = plates.export(pr, s, out, ROOT, stats_fn, stack_name=name, progress=progress)
            extra = [os.path.join(out, "BOM.md"), os.path.join(out, "stack.json")]
            write_bom_md(extra[0], body["stack"], bom, pr, s)
            with open(extra[1], "w", encoding="utf-8") as f:
                json.dump({"stack": body["stack"], "settings": s, "overrides": body.get("overrides") or {}}, f, indent=1)
        written_paths = [f["file"] for f in files]
        remember_written(written_paths)
        EXPORT.update({"result": {"folder": out, "files": files, "plan": pr, "seconds": round(time.time() - t, 1),
                                  "zip": name + ("_TEST" if test else "") + ".zip", "download": written_paths + extra},
                       "percent": 100, "msg": "done"})
    except Exception as e:
        import traceback
        traceback.print_exc()
        EXPORT.update({"error": f"{type(e).__name__}: {e}"})
    finally:
        EXPORT["running"] = False
        BUSY.acquire(blocking=False)


def spoolman(url):
    """Spools from a Spoolman server (GET /api/v1/spool), reduced to what the filament table needs."""
    if not url:
        return {"error": "no Spoolman URL"}
    try:
        with urllib.request.urlopen(url.rstrip("/") + "/api/v1/spool", timeout=6) as r:
            spools = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        return {"error": f"Spoolman: {e}"}
    out = []
    for sp in spools:
        f = sp.get("filament") or {}
        out.append({"id": sp.get("id"), "name": f.get("name", ""), "vendor": (f.get("vendor") or {}).get("name", ""), "material": f.get("material", ""),
                    "color": "#" + (f.get("color_hex") or "808080")[:6], "remaining_g": round(sp.get("remaining_weight") or 0),
                    "label": f"{(f.get('vendor') or {}).get('name', '')} {f.get('name', '')} · {f.get('material', '')} · {round(sp.get('remaining_weight') or 0)} g".strip()})
    return {"spools": out}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=HERE, **k)

    def log_message(self, fmt, *args):
        if "/api/" in str(args[0] if args else ""):
            super().log_message(fmt, *args)

    def send_bytes(self, data, ctype, code=200, headers=()):
        try:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            for h in headers:
                self.send_header(*h)
            self.end_headers()
            self.wfile.write(data)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass  # the page navigated away while we were computing

    def send_json(self, obj, code=200):
        self.send_bytes(json.dumps(obj).encode("utf-8"), "application/json; charset=utf-8", code)

    def send_file(self, path, ctype, headers=()):
        with open(path, "rb") as fh:
            self.send_bytes(fh.read(), ctype, headers=headers)

    def send_ui_asset(self, rel):
        root = os.path.realpath(UI_DIST)
        target = os.path.realpath(os.path.join(root, rel))
        if target != root and not target.startswith(root + os.sep):
            return self.send_json({"error": "not found"}, 404)
        if not os.path.isfile(target):
            return self.send_json({"error": "not found"}, 404)
        ctype = mimetypes.guess_type(target)[0] or "application/octet-stream"
        return self.send_file(target, ctype, headers=[("Cache-Control", "public, max-age=31536000, immutable")])

    def loopback(self):
        return self.client_address[0] in ("127.0.0.1", "::1")

    def local(self):
        """Page opened on the Windows machine running the server: Explorer can show the output folder.
        Anywhere else (Docker, NAS, another PC, macOS/Linux) the files are downloaded instead."""
        return os.name == "nt" and self.loopback()

    def send_thumb(self, rel):
        rel = archive_rel(rel)
        if rel.startswith("..") or not any(r == rel for _, _, r in INDEX.files):
            return self.send_json({"error": "unknown part"}, 404)
        BUSY.release()
        try:
            cache = thumb(rel)
        finally:
            BUSY.acquire(blocking=False)
        with open(cache, "rb") as f:
            self.send_bytes(f.read(), "image/png", headers=[("Cache-Control", "max-age=86400")])

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path in ("/classic", "/classic/", "/classic/index.html"):
            self.path = "/index.html"
            return super().do_GET()
        if path in ("/", "/index.html"):
            ui = os.path.join(UI_DIST, "index.html")
            if os.path.isfile(ui):
                return self.send_file(ui, "text/html; charset=utf-8", headers=[("Cache-Control", "no-cache")])
            self.path = "/index.html"
            return super().do_GET()
        if path.startswith("/ui/"):
            return self.send_ui_asset(path[1:])
        if self.path == "/api/meta":
            return self.send_json({"defaults": plates.DEFAULT_SETTINGS, "layouts": catalog.LAYOUTS, "allowed": catalog.ALLOWED_LAYOUTS,
                                   "patterns": catalog.PATTERNS, "width": catalog.WIDTH, "depths": list(catalog.DEPTHS), "roofs": list(catalog.ROOFS),
                                   "files": len(INDEX.files), "progress": PROGRESS,
                                   "roles": catalog.ROLES, "roleLabels": catalog.ROLE_LABELS, "kinds": [k for k, _ in catalog.KINDS], "materials": plates.MATERIALS, "printerCatalog": plates.PRINTER_CATALOG,
                                   "families": catalog.FAMILIES, "layoutFamily": catalog.LAYOUT_FAMILY, "layerTypes": list(catalog.LAYER_TYPES),
                                   "drawerInteriors": list(catalog.DRAWER_INTERIORS), "sustainerInteriors": list(catalog.SUSTAINER_INTERIORS),
                                   "heights": list(catalog.HEIGHTS), "widthMm": catalog.WIDTH,
                                   "build": BUILD, "assets": assets_bootstrap.count(os.path.join(HERE, "assets")), "local": self.local(),
                                   "archiveVia": "environment" if os.environ.get("VAULT_ARCHIVE") else "unspecified",
                                   "archiveReady": os.path.isdir(os.path.join(ROOT, "01. DRAWERS")),
                                   **dict(zip(("handoff", "handoffNote"), handoff_meta(self.loopback())))})
        if self.path == "/api/progress":
            return self.send_json(PROGRESS)
        if self.path == "/api/presets":
            out = {}
            for k, v in presets.SLICERS.items():
                ok = os.path.isdir(v["dir"])
                out[k] = {"label": v["label"], "installed": ok, "uploaded": v["dir"].startswith(presets.UPLOADS), "presets": presets.catalog(k) if ok else [],
                          "filaments": presets.catalog(k, kind="filament") if ok else [], "machines": presets.catalog(k, kind="machine") if ok else []}
            return self.send_json(out)
        if self.path == "/api/export_status":
            return self.send_json(EXPORT)
        if self.path == "/api/sample_plan":
            return self.send_json(plates.sample_plan())
        if self.path.startswith("/api/download_file"):
            name = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("name", [""])[0]
            path = EXPORTED.get(name)
            if not path:
                return self.send_json({"error": "that file is not from an export this planner just wrote"}, 404)
            with open(path, "rb") as fh:
                data = fh.read()
            return self.send_bytes(data, "application/octet-stream", headers=[("Content-Disposition", f'attachment; filename="{name}"')])
        if self.path == "/api/download":  # the last export as one zip: 3MFs + BOM.md + stack.json
            r = EXPORT.get("result")
            if not r:
                return self.send_json({"error": "nothing exported yet"}, 404)
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, "w") as z:  # stored: a 3MF is already deflated
                for p in r["download"]:
                    z.write(p, os.path.basename(p))
            return self.send_bytes(buf.getvalue(), "application/zip", headers=[("Content-Disposition", f'attachment; filename="{r["zip"]}"')])
        if self.path.startswith("/api/spoolman"):
            url = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("url", [""])[0].strip()
            return self.send_json(spoolman(url if "://" in url or not url else "http://" + url))
        if self.path.startswith("/api/find"):  # archive file for a part name (+ folder hint), for the help pictures
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            rel = next((INDEX.find(n, q.get("hint", [""])[0]) for n in q.get("name", []) if INDEX.find(n, q.get("hint", [""])[0])), None)
            return self.send_json({"file": rel})
        if self.path.startswith("/thumb/"):
            return self.send_thumb(urllib.parse.unquote(self.path[7:]))
        if self.path.startswith("/stl/"):  # raw archive STL for the in-page 3D viewer
            rel = archive_rel(urllib.parse.unquote(self.path[5:]))
            if rel.startswith("..") or not any(r == rel for _, _, r in INDEX.files):
                return self.send_json({"error": "unknown part"}, 404)
            with open(os.path.join(ROOT, rel), "rb") as f:
                return self.send_bytes(f.read(), "model/stl", headers=[("Cache-Control", "max-age=86400")])
        if self.path.startswith("/api/"):
            return self.send_json({"error": "not found"}, 404)
        return super().do_GET()  # static files: /assets/*.png

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        if self.path == "/api/import_pdf":  # raw PDF body from the site's "Your build" print-out
            from pypdf import PdfReader
            try:
                text = "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(self.rfile.read(n))).pages)
                return self.send_json(catalog.stack_from_site_pdf(text))
            except Exception as e:
                return self.send_json({"error": f"{type(e).__name__}: {e}"}, 400)
        body = json.loads(self.rfile.read(n) or b"{}")
        BUSY.release()
        try:
            if self.path == "/api/bom":
                bom, s = compute_bom(body)
                return self.send_json(bom)
            if self.path == "/api/plan":
                bom, s = compute_bom(body)
                return self.send_json({"bom": bom, "plan": plates.plan(bom["parts"], s, stats_fn)})
            if self.path in ("/api/export", "/api/export_test"):
                if EXPORT.get("running"):
                    return self.send_json({"error": "an export is already running"}, 409)
                EXPORT.update({"running": True, "percent": 0, "msg": "planning…", "result": None, "error": None})
                threading.Thread(target=run_export, args=(body, self.path == "/api/export_test"), daemon=True).start()
                return self.send_json({"started": True})
            if self.path in ("/api/open", "/api/handoff"):
                return self.send_handoff(body)
            if self.path == "/api/export_part":
                return self.send_json(export_one_part(body))
            if self.path == "/api/presets_upload":  # {"files": {"BambuStudio/user/…/x.json": text}} from a folder picked in the browser
                return self.send_json(presets.save_upload(body["files"]))
        except Exception as e:  # surface errors in the UI instead of a silent 500
            import traceback
            traceback.print_exc()
            return self.send_json({"error": f"{type(e).__name__}: {e}"}, 500)
        finally:
            BUSY.acquire(blocking=False)
        return self.send_json({"error": "not found"}, 404)

    def send_handoff(self, body):
        """Open one file this process exported. Never a caller-supplied path or command."""
        origin_ok = planner.origin_allows_handoff(self.headers.get("Origin"), self.headers.get("Host"))
        filename = body.get("file") or ""
        app = body.get("app") or ""
        if not filename and body.get("path"):
            filename = os.path.basename(str(body.get("path")).replace("\\", "/"))
            app = app or "folder"
        try:
            spec = planner.plan_handoff(app, filename, platform=sys.platform, loopback=self.loopback(), origin_ok=origin_ok,
                                        exported=EXPORTED, output_root=output_root())
        except planner.HandoffError as e:
            return self.send_json({"error": str(e)}, 403)
        if spec["action"] == "argv":
            subprocess.Popen(spec["argv"])
        else:
            os.startfile(spec["path"])  # Windows only; plan_handoff never asks for it elsewhere
        return self.send_json({"ok": True, "opened": spec["label"]})


def export_one_part(body):
    """One 3MF containing a single archive part. The STL is read in place and not copied into the repo."""
    rel = archive_rel(body.get("file") or "")
    if rel.startswith("..") or not any(r == rel for _, _, r in INDEX.files):
        raise ValueError("unknown part")
    s = settings_of(body)
    name = re.sub(r"[^A-Za-z0-9_-]+", "-", body.get("name") or os.path.splitext(os.path.basename(rel))[0]).strip("-") or "part"
    line = {"name": body.get("name") or name, "file": rel, "qty": 1, "role": body.get("role") or "main", "group": "solo", "kind": "other"}
    pr = plates.plan([line], s, stats_fn)
    if not pr["plates"]:
        why = pr["unplaceable"][0].get("name") if pr["unplaceable"] else line["name"]
        raise ValueError(f"{why} does not fit an enabled printer")
    out = os.path.join(output_root(), "solo-" + name)
    files = plates.export(pr, s, out, ROOT, stats_fn, stack_name="solo-" + name)
    remember_written([f["file"] for f in files])
    first = files[0]
    base = os.path.basename(first["file"])
    return {"file": base, "files": [os.path.basename(f["file"]) for f in files], "download": "/api/download_file?name=" + urllib.parse.quote(base),
            "warning": first.get("warning"), "plates": first["plates"]}


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")  # Docker sets 0.0.0.0
    url = f"http://127.0.0.1:{PORT}/"
    ThreadingHTTPServer.allow_reuse_address = os.name != "nt"  # on Windows it lets a second copy share the port
    try:
        srv = ThreadingHTTPServer((host, PORT), Handler)
    except OSError:  # started twice: show the one already running instead of a traceback
        print(f"Port {PORT} is in use: the configurator is probably already running at {url}")
        if "--no-browser" not in sys.argv:
            webbrowser.open(url)
        sys.exit(1)
    threading.Thread(target=lambda: assets_bootstrap.bootstrap(ROOT, os.path.join(HERE, "assets")), daemon=True).start()
    threading.Thread(target=precache, daemon=True).start()
    print(f"VAULT configurator: {url}  ({len(INDEX.files)} STL files indexed)")
    if not INDEX.files:
        print(f"No VAULT archive found at {ROOT}: set VAULT_ARCHIVE to the folder holding '01. DRAWERS'.")
    if "--no-browser" not in sys.argv:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    srv.serve_forever()
