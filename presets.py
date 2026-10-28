"""Read presets from the installed slicers (Bambu Studio, Anycubic Slicer Next, OrcaSlicer) and
build a 3MF `project_settings.config` from them.

A preset JSON stores only the keys it changes and `inherits` its parent; the chain ends in a
system preset whose `compatible_printers` names the printer and nozzle ("Bambu Lab H2C 0.4 nozzle").
A project config is the flattened machine + process presets plus every filament preset's vectors
concatenated in slot order (that is how Bambu Studio writes its own project files).
"""
import glob
import json
import os
import re
import shutil
import sys


def config_root():
    """Where the slicers keep their settings: %APPDATA% on Windows (also how Docker points at a mounted
    folder), ~/Library/Application Support on macOS, $XDG_CONFIG_HOME or ~/.config on Linux."""
    if os.environ.get("APPDATA"):
        return os.environ["APPDATA"]
    if sys.platform == "darwin":
        return os.path.expanduser("~/Library/Application Support")
    return os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config")


APPDATA = config_root()
# copies of the slicer folders uploaded from a browser, for a server with no slicer installed (Docker volume /app/slicers)
UPLOADS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "slicers")
FOLDERS = {"bambu": ("Bambu Studio", "BambuStudio"), "anycubic": ("Anycubic Slicer Next", "AnycubicSlicerNext"), "orca": ("OrcaSlicer", "OrcaSlicer")}
SLICERS = {k: {"label": label, "folder": folder, "dir": next((d for d in (os.path.join(APPDATA, folder), os.path.join(UPLOADS, folder)) if os.path.isdir(d)),
                                                             os.path.join(UPLOADS, folder))}
           for k, (label, folder) in FOLDERS.items()}
# preset JSONs, plus <slicer>.conf reduced by the browser to its preset_folder (the account in use)
UPLOAD_PATH = re.compile(r"(?:^|/)(BambuStudio|AnycubicSlicerNext|OrcaSlicer)/((?:system|user)/[^\\]+\.json|\1\.conf)$")


def save_upload(files):
    """Replace the uploaded copy of each slicer folder in `files` ({browser relative path: text}); only the
    system/ and user/ preset JSONs and the account in use are kept. A slicer installed on this machine keeps
    reading its own folder."""
    by = {}
    for path, text in files.items():
        m = UPLOAD_PATH.search(path.replace("\\", "/"))
        if m and ".." not in m.group(2).split("/"):
            by.setdefault(m.group(1), {})[m.group(2)] = text
    if not by:
        return {"error": "no slicer presets found: pick the BambuStudio, AnycubicSlicerNext or OrcaSlicer folder itself"}
    out = {}
    for folder, rels in by.items():
        k = next(k for k, v in SLICERS.items() if v["folder"] == folder)
        target = os.path.join(UPLOADS, folder)
        if SLICERS[k]["dir"] != target:
            out[k] = "installed here: its own folder is used"
            continue
        shutil.rmtree(target, ignore_errors=True)
        for rel, text in rels.items():
            os.makedirs(os.path.dirname(os.path.join(target, rel)), exist_ok=True)
            with open(os.path.join(target, rel), "w", encoding="utf-8") as f:
                f.write(text)
        out[k] = f"{len(rels)} preset files"
    _cache.clear()
    return {"saved": out}
KINDS = ("process", "filament", "machine")
# bookkeeping keys that are not print settings
META = {"name", "inherits", "from", "type", "version", "setting_id", "instantiation", "description", "compatible_printers",
        "compatible_printers_condition", "print_settings_id", "is_custom_defined", "updated_time", "filament_settings_id",
        "printer_settings_id", "base_id", "filament_id", "setting_id", "include", "compatible_prints", "compatible_prints_condition"}
# project-level keys we do not copy per object
SKIP = META | {"print_extruder_id", "print_extruder_variant", "printer_model", "printer_variant"}

_cache = {}


def user_files(d, kind):
    """User presets the slicer shows: those of the account in use (`preset_folder` in <slicer>.conf; user/default
    is the signed-out set), with the base/ presets its filaments inherit from. No .conf: every account folder."""
    try:
        with open(os.path.join(d, os.path.basename(d) + ".conf"), encoding="utf-8", errors="replace") as f:
            m = re.search(r'"preset_folder"\s*:\s*"([\w-]+)"', f.read())
    except OSError:
        m = None
    folders = [os.path.join(d, "user", m.group(1))] if m else [f for f in glob.glob(os.path.join(d, "user", "*")) if os.path.isdir(f)]
    return [p for f in folders for p in glob.glob(os.path.join(f, kind, "*.json")) + glob.glob(os.path.join(f, kind, "base", "*.json"))]


def load_all(slicer, kind="process"):
    """name -> preset dict (with _user flag and _file) for every preset of one kind of one slicer."""
    d = SLICERS[slicer]["dir"]
    users = user_files(d, kind)
    stamp = tuple(sorted((p, os.path.getmtime(p)) for p in users))
    key = (slicer, kind)
    if key in _cache and _cache[key][0] == stamp:
        return _cache[key][1]
    out = {}
    for user, files in ((False, glob.glob(os.path.join(d, "system", "*", kind, "*.json"))), (True, users)):
        for p in files:
            try:
                with open(p, encoding="utf-8") as f:
                    j = json.load(f)
            except (OSError, ValueError):
                continue
            if not j.get("name"):
                continue
            j["_user"], j["_file"] = user, p
            out[j["name"]] = j
    _cache[key] = (stamp, out)
    return out


def chain(name, all_presets):
    seen, cur = [], name
    while cur and cur in all_presets and cur not in seen:
        seen.append(cur)
        cur = all_presets[cur].get("inherits")
    return [all_presets[n] for n in seen]


def flatten(name, all_presets):
    merged = {}
    for p in reversed(chain(name, all_presets)):
        # Bambu Studio 2.8 templates (a printer's G-code, dual-nozzle filament vectors): applied over the parent,
        # under the preset's own keys
        for inc in p.get("include") or []:
            merged.update({k: v for k, v in flatten(inc, all_presets).items() if k not in META})
        merged.update({k: v for k, v in p.items() if not k.startswith("_")})
    return merged


def compatible(name, all_presets):
    for p in chain(name, all_presets):
        c = p.get("compatible_printers")
        if c:
            return c if isinstance(c, list) else [c]
    return []


def nozzle_of(printers):
    for s in printers:
        m = re.search(r"(\d+(?:\.\d+)?)\s*nozzle", s)
        if m:
            return m.group(1)
    return ""


def catalog(slicer, profile="", kind="process"):
    """Instantiable presets of one kind, optionally only those compatible with a printer profile
    (substring match on compatible_printers or, for machines, on the preset name)."""
    allp = load_all(slicer, kind)
    key = ("catalog", slicer, profile, kind)
    if key in _cache and _cache[key][0] is allp:  # same preset files: same rows
        return _cache[key][1]
    rows = []
    for name, p in allp.items():
        if str(p.get("instantiation", "true")).lower() == "false":
            continue
        comp = compatible(name, allp) if kind != "machine" else [name]
        if profile and not any(profile.lower() in c.lower() for c in comp):
            continue
        row = {"name": name, "user": p["_user"], "nozzle": nozzle_of(comp), "printers": comp, "inherits": p.get("inherits", ""),
               "nkeys": len([k for k in p if not k.startswith("_") and k not in SKIP])}
        if kind == "filament":
            fl = flatten(name, allp)
            row["material"] = (fl.get("filament_type") or [""])[0]
            row["vendor"] = (fl.get("filament_vendor") or [""])[0]
        rows.append(row)
    rows.sort(key=lambda r: (not r["user"], r["nozzle"], r["name"]))
    _cache[key] = (allp, rows)
    return rows


def overrides(slicer, preset, base, all_presets=None):
    """Per-object settings: keys where `preset` differs from `base` (both flattened), as strings."""
    allp = all_presets or load_all(slicer, "process")
    if not preset or preset == base or preset not in allp:
        return {}
    a, b = flatten(preset, allp), flatten(base, allp) if base in allp else {}
    out = {}
    for k, v in a.items():
        if k in SKIP or k.startswith("_"):
            continue
        if b.get(k) != v:
            out[k] = ",".join(map(str, v)) if isinstance(v, list) else str(v)
    return out


NOZZLE_MAP = {"left": "1", "right": "2"}  # Bambu extruder 1 reaches the plate's left part, 2 (the master) the right


def project_config(slicer, machine, process, filaments, colours, nozzle_side=None):
    """Full project_settings.config dict: machine + process flattened, filament vectors concatenated
    per slot (variant-expanded keys get `filament_self_index` like Bambu Studio writes).
    nozzle_side "left"/"right" pins every filament to that nozzle of a dual-nozzle printer."""
    M = flatten(machine, load_all(slicer, "machine"))
    P = flatten(process, load_all(slicer, "process"))
    fil_all = load_all(slicer, "filament")
    Fs = [flatten(f, fil_all) for f in filaments]
    if not M or not P or any(not F for F in Fs):
        missing = [n for n, d in [(machine, M), (process, P)] + list(zip(filaments, Fs)) if not d]
        raise ValueError("preset not found: " + ", ".join(missing))
    cfg = {}
    for d in (M, P):
        cfg.update({k: v for k, v in d.items() if k not in META})
    fkeys = {k for F in Fs for k, v in F.items() if isinstance(v, list) and k not in META}
    nvar = [len(F.get("filament_extruder_variant") or [1]) for F in Fs]  # values per filament of a per-nozzle-variant key
    for k in sorted(fkeys):
        donor, dn = next((F[k], n) for F, n in zip(Fs, nvar) if isinstance(F.get(k), list))
        vals = []
        for F, n in zip(Fs, nvar):
            v = F.get(k)
            if v is None:  # this preset lacks the key: another slot's value, one per variant if the key is per variant
                v = donor[:1] * (n if len(donor) == dn > 1 else 1)
            vals.extend(v if isinstance(v, list) else [v])
        cfg[k] = vals
    cfg["filament_self_index"] = [str(i + 1) for i, F in enumerate(Fs) for _ in range(len(F.get("filament_extruder_variant") or [1]))]
    cfg["filament_colour"] = list(colours)
    cfg["filament_settings_id"] = list(filaments)
    cfg["print_settings_id"] = process
    cfg["printer_settings_id"] = machine
    cfg["filament_ids"] = [(F.get("filament_id") or F.get("setting_id") or "") for F in Fs]
    cfg["default_filament_profile"] = M.get("default_filament_profile") or [filaments[0]]
    n = len(filaments)
    cfg.update({"name": "project_settings", "from": "project", "version": vendor_version(slicer),
                "filament_map": [NOZZLE_MAP.get(nozzle_side, "1")] * n, "filament_map_mode": "Manual" if nozzle_side in NOZZLE_MAP else "Auto For Flush", "nozzle_volume_type": ["Standard"] * len(M.get("nozzle_diameter") or [1]),
                "different_settings_to_system": [""] * (n + 2), "curr_bed_type": "Textured PEI Plate",
                "flush_volumes_vector": ["140"] * (2 * n), "flush_volumes_matrix": ["0" if i == j else "140" for i in range(n) for j in range(n)]})
    return cfg


def vendor_version(slicer):
    """Version string of the slicer's bundled vendor profiles (what the slicer itself stamps into project files)."""
    root = SLICERS[slicer]["dir"]
    for f in glob.glob(os.path.join(root, "system", "*.json")):
        try:
            with open(f, encoding="utf-8") as fh:
                v = json.load(fh).get("version")
            if v:
                return str(v)
        except (OSError, ValueError):
            pass
    return "02.08.00.06"


def default_filament(slicer, profile, nozzle, material, brand="", prefer_user=True):
    """Filament preset for a slot of `material` (as Spoolman names it, e.g. PETG-HF): a preset of that material or
    its base (PETG), never another material; then the slot's brand, the material's suffix in the name (HF), user presets."""
    rows = [r for r in catalog(slicer, profile, "filament") if (not nozzle or r["nozzle"] in (nozzle, ""))]
    m = material.lower()
    base, *suffix = [t for t in re.split(r"[-_+ ]", m) if t] or [""]
    kind = lambda r: (r.get("material") or "").lower()
    own = lambda r: r["name"].split("@")[0].lower()  # "Anycubic PETG @Bambu Lab H2C": the printer part says nothing about the filament
    same = [r for r in rows if kind(r) in (m, base) or m in kind(r) or m in own(r)]
    b = brand.lower()
    # exact material first (PETG before PETG-CF), then the brand, the suffix, a name that says the material (TPU95A before PEBA), user presets
    pick = sorted(same or rows, key=lambda r: (kind(r) != m, kind(r) not in (m, base), bool(b) and b not in own(r),
                                               not all(t in own(r) for t in suffix), m not in own(r), prefer_user and not r["user"], r["name"]))
    return pick[0]["name"] if pick else ""


if __name__ == "__main__":
    for s in SLICERS:
        for kind in KINDS:
            rows = catalog(s, kind=kind)
            print(f"{s}/{kind}: {len(rows)} presets, {sum(r['user'] for r in rows)} user")
    allb = load_all("bambu")
    user = [n for n, p in allb.items() if p["_user"]]
    if user:
        o = overrides("bambu", user[0], allb[user[0]].get("inherits"), allb)
        assert o and all(isinstance(v, str) for v in o.values())
        assert overrides("bambu", user[0], user[0], allb) == {}
    m = catalog("bambu", "Bambu Lab H2C", "machine")
    print("H2C machines:", [r["name"] for r in m][:6])
    f1 = default_filament("bambu", "Bambu Lab H2C", "0.4", "PETG")
    f2 = default_filament("bambu", "Bambu Lab H2C", "0.4", "TPU")
    print("default filaments:", f1, "|", f2)
    cfg = project_config("bambu", "Bambu Lab H2C 0.4 nozzle", "0.20mm Standard @BBL H2C", [f1, f1, f2], ["#AAAAAA", "#333333", "#111111"])
    n = len(cfg["filament_settings_id"])
    assert "H2C" in cfg["machine_start_gcode"][:80], "the printer's G-code comes from its `include` templates"
    assert not [k for k, v in cfg.items() if isinstance(v, list) and None in v], "a filament vector has a hole"
    hf = default_filament("bambu", "Bambu Lab H2C", "0.4", "PETG-HF")
    assert flatten(hf, load_all("bambu", "filament")).get("filament_type") == ["PETG"], hf  # Spoolman's PETG-HF: a PETG preset, never another material
    assert cfg["printable_height"] and len(cfg["filament_type"]) == n and len(cfg["filament_colour"]) == n and len(cfg["nozzle_diameter"]) == 2
    assert cfg["filament_self_index"][:1] == ["1"] and len(cfg["filament_self_index"]) == len(cfg["filament_extruder_variant"])
    right = project_config("bambu", "Bambu Lab H2C 0.4 nozzle", "0.20mm Standard @BBL H2C", [f1, f2], ["#AAAAAA", "#111111"], "right")
    assert right["filament_map"] == ["2", "2"] and right["filament_map_mode"] == "Manual" and cfg["filament_map_mode"] == "Auto For Flush"
    print("project keys:", len(cfg), "| filament_type", cfg["filament_type"], "| self_index", cfg["filament_self_index"])
    k = default_filament("anycubic", "Anycubic Kobra X", "0.4", "PETG")
    cfgk = project_config("anycubic", "Anycubic Kobra X 0.4 nozzle", "0.20mm Standard @Anycubic Kobra X 0.4 nozzle", [k, k], ["#AAAAAA", "#333333"])
    print("kobra project keys:", len(cfgk), "| filaments", cfgk["filament_settings_id"], "| printable_area", cfgk.get("printable_area"))
    assert "error" in save_upload({"Downloads/x.json": "{}", "BambuStudio/user/../../evil.json": "{}"})
    if SLICERS["bambu"]["dir"] != os.path.join(UPLOADS, "BambuStudio"):  # an installed slicer's folder is never overwritten
        assert save_upload({"BambuStudio/user/1/process/a.json": "{}"})["saved"]["bambu"].startswith("installed")
    print("presets.py self-check ok")
