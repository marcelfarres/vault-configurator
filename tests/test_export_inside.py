"""Every exported piece is on its plate, for every printer, and nothing goes missing on the way.

Runs the real export (server.run_export, the code the Export button calls) for a few representative
stacks in each printer mode, then reads each 3MF back the way the slicer does (mesh.verify_3mf) and
checks the piece accounting. Needs the archive (VAULT_ARCHIVE or next to vault-configurator); uses
the installed slicers' presets when there are any, like the UI does.

Run:  python -X utf8 vault-configurator/tests/test_export_inside.py      (several minutes)"""
import copy
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import mesh  # noqa: E402
import plates  # noqa: E402
import presets  # noqa: E402
import server  # noqa: E402

STACKS = {
    "s-cart": {"depth": 4, "layers": [
        {"type": "Drawers", "layout": "S", "height": 2, "facades": [[1, 1]], "interior": "baseplate", "key": "key", "labels": True, "manualSupports": True},
        {"type": "Sustainers", "layout": "S", "height": 1},
        {"type": "Drawers", "layout": "S", "height": 4, "facades": [[2, 1, 1]], "key": "hidden"}],
        "roof": {"type": "grid", "topHandle": True},
        "mods": {"base": True, "wheels": True, "feet": True, "backbone": "wide", "pullout": True, "pegboard": "none"}},
    "l-mixed": {"depth": 6, "layers": [
        {"type": "Drawers", "layout": "L", "height": 1, "facades": [[1]], "manualSupports": True},
        {"type": "Drawers", "layout": "SS", "height": 2, "facades": [[2], [1, 1]], "rails": True},
        {"type": "Sustainers", "layout": "L", "height": 2, "variant": "Dividers", "divW": 1, "divD": 2}],
        "roof": {"type": "undertable"}, "mods": {"backbone": "wide", "wallmount": True, "pegboard": "none"}},
    "xl-flat": {"depth": 3, "layers": [
        {"type": "Drawers", "layout": "XL", "height": 1, "facades": [[1]]},
        {"type": "Drawers", "layout": "SM", "height": 1, "facades": [[1], [1]]}],
        "roof": {"type": "table"}, "mods": {"backbone": "none", "pegboard": "none"}},
}


RIGHT = {**next(c for c in plates.PRINTER_CATALOG if c["name"] == "Bambu Lab H2C · right nozzle"),  # parts must land in x 25-330
         "id": "h2c-right", "maxH": 325, "enabled": True, "nozzle": "0.4", "preset": ""}


def settings_for(mode):
    """H2C left, Kobra (short-part limit) and H2C right, with a process preset picked the way the Plates tab does.

    The app's default rows are the U1 / P1S / H2D fleet. This test keeps the older beds so diagonal placement
    and the bed-slinger height limit stay covered when an archive is present."""
    s = copy.deepcopy(plates.DEFAULT_SETTINGS)
    h2c = plates.catalog_printer("Bambu Lab H2C · left nozzle", "h2c")
    kobra = plates.catalog_printer("Anycubic Kobra X", "kobrax")
    kobra["maxH"] = 120
    s["printers"] = [h2c, kobra, copy.deepcopy(RIGHT)]
    s["mode"] = mode
    for p in s["printers"]:
        rows = [r for r in presets.catalog(p["slicer"], p["profile"]) if r["nozzle"] in (p["nozzle"], "")]
        pick = next((r for r in rows if not r["user"] and "0.20mm Standard" in r["name"]), rows[0] if rows else None)
        p["preset"] = pick["name"] if pick else ""
    return s


def main():
    failures, checked = [], 0
    for mode in ("both", "h2c", "kobrax", "h2c-right"):
        s = settings_for(mode)
        for name, stack in STACKS.items():
            body = {"stack": {**stack, "name": f"selftest-{name}-{mode}"}, "settings": s, "overrides": {}}
            server.EXPORT.clear()
            server.run_export(body, False)
            res = server.EXPORT.get("result")
            if not res:
                failures.append(f"{name}/{mode}: export failed: {server.EXPORT.get('error')}")
                continue
            plan = res["plan"]
            left = sum(u.get("qty", 1) for u in plan["unplaceable"])
            if plan["placed"] + left != plan["pieces"]:
                failures.append(f"{name}/{mode}: {plan['pieces']} pieces, {plan['placed']} placed, {left} reported unplaceable")
            on_files = sum(f["items"] for f in res["files"])
            if on_files != plan["placed"]:
                failures.append(f"{name}/{mode}: plan placed {plan['placed']} pieces but the files hold {on_files}")
            for f in res["files"]:
                checked += 1
                p = next(p for p in s["printers"] if p["name"] == f["printer"])
                ox, oy = p.get("origin") or (0, 0)
                again = mesh.verify_3mf(f["file"], (p["bed"][0] + ox, p["bed"][1] + oy), reach=(ox, oy, *p["bed"]))
                if f["outside"] or again:
                    failures.append(f"{name}/{mode}: {os.path.basename(f['file'])}: {f['outside'] or again}")
            print(f"{name:8s} {mode:6s} {plan['placed']:3d}/{plan['pieces']} pieces placed, {left} unplaceable, "
                  + ", ".join(f"{os.path.basename(f['file'])}: {f['plates']} plates, {len(f['outside'])} outside" for f in res["files"]))
    assert not failures, "\n".join(failures)
    print(f"test_export_inside ok: {checked} files, every piece on its plate")


if __name__ == "__main__":
    main()
