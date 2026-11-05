"""Planner rules that do not need the purchased archive.

The archive path is VAULT_ARCHIVE (or the desktop launcher's archive-path.txt). This test points that
variable at an empty folder so a host path is never read from the repository, and checks the API does
not echo the path back.
"""
import json
import os
import sys
import tempfile
import threading
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EMPTY = tempfile.mkdtemp(prefix="vault-empty-")
os.environ["VAULT_ARCHIVE"] = EMPTY
sys.path.insert(0, ROOT)

import catalog  # noqa: E402
import planner  # noqa: E402
import stackfit  # noqa: E402
import plates  # noqa: E402
import server  # noqa: E402


class FakeIndex:
    def find(self, name, hint=""):
        return "virtual/" + name + ".stl"

    def divider(self, folder, length):
        return None


def drawer(height, facades):
    return {"depth": 3, "layers": [{
        "type": "Drawers", "layout": "S", "height": height, "facades": [facades],
        "interior": "none", "key": "none", "labels": False, "rails": False, "manualSupports": False,
    }], "roof": {"type": "none"}, "mods": {}}


def runner_qty(stack):
    built = catalog.Bom(FakeIndex(), {}, lambda rel: True).build(stack)
    return sum(line["qty"] for line in built["parts"] if line["name"].endswith("Runner Guide"))


def test_quantities():
    assert catalog.runners_per_box(1) == 2
    assert catalog.runners_per_box(2) == 4
    assert catalog.runners_per_box(4) == 4
    assert runner_qty(drawer(1, [1])) == 2
    assert runner_qty(drawer(2, [2])) == 4
    # Two 1F boxes: four pieces. Not halved — this test does not open a purchased STL to count bodies.
    assert runner_qty(drawer(2, [1, 1])) == 4
    assert catalog.name_key("x7 Runner Slides") == catalog.name_key("x7 Runner Slide")


def test_fleet_and_sample():
    ids = {p["id"] for p in plates.DEFAULT_PRINTERS}
    assert ids == {"u1", "p1s", "h2d-left", "h2d-right"}
    sample = plates.sample_plan()
    assert sample["synthetic"] and sample["placed"] == 5
    for plate in sample["plates"]:
        assert plate["bed"] == [270, 270]
        for item in plate["items"]:
            assert item["corners"] == [[round(x, 2), round(y, 2)] for x, y in plates.footprint_corners(item)]
            for x, y in item["corners"]:
                assert -0.05 <= x <= 270.05 and -0.05 <= y <= 270.05, (item["part"], x, y)
    wide = [400, 200, 20]
    tall = [100, 80, 300]
    small = [160, 80, 40]
    by_id = {p["id"]: p for p in plates.DEFAULT_PRINTERS}
    assert all(plates.fits(small, p) is not None for p in by_id.values())
    assert plates.fits(tall, by_id["p1s"]) is None
    assert plates.fits(wide, by_id["u1"]) is None
    right = by_id["h2d-right"]
    assert right["origin"] == [25, 0]


def test_handoff_policy():
    root = tempfile.mkdtemp(prefix="vault-out-")
    path = os.path.join(root, "piece.3mf")
    with open(path, "wb") as fh:
        fh.write(b"not-a-purchased-stl")
    exported = {}
    planner.remember_export(path, exported, root)
    spec = planner.plan_handoff("bambu", "piece.3mf", platform="darwin", loopback=True, origin_ok=True,
                                 exported=exported, output_root=root)
    assert spec["argv"] == ["open", "-a", "Bambu Studio", os.path.realpath(path)]
    orca = planner.plan_handoff("orca", "piece.3mf", platform="darwin", loopback=True, origin_ok=True,
                                 exported=exported, output_root=root)
    assert orca["argv"][2] == "OrcaSlicer"
    outside = os.path.join(tempfile.mkdtemp(), "piece.3mf")
    with open(outside, "wb") as fh:
        fh.write(b"x")
    stolen = {"piece.3mf": outside}
    for kwargs in (
        {"app": "bambu", "filename": "../piece.3mf"},
        {"app": "bambu;open", "filename": "piece.3mf"},
        {"app": "orca", "filename": "piece.3mf", "platform": "linux"},
        {"app": "bambu", "filename": "piece.3mf", "loopback": False},
        {"app": "bambu", "filename": "piece.3mf", "origin_ok": False},
        {"app": "bambu", "filename": "missing.3mf"},
    ):
        call = dict(platform="darwin", loopback=True, origin_ok=True, exported=exported, output_root=root)
        call.update({k: v for k, v in kwargs.items() if k not in ("app", "filename")})
        try:
            planner.plan_handoff(kwargs["app"], kwargs["filename"], **call)
        except planner.HandoffError:
            pass
        else:
            raise AssertionError(kwargs)
    try:
        planner.plan_handoff("bambu", "piece.3mf", platform="darwin", loopback=True, origin_ok=True,
                              exported=stolen, output_root=root)
    except planner.HandoffError:
        pass
    else:
        raise AssertionError("path outside output was accepted")
    assert planner.origin_allows_handoff(None, "127.0.0.1:8765")
    assert planner.origin_allows_handoff("http://127.0.0.1:8765", "127.0.0.1:8765")
    assert not planner.origin_allows_handoff("http://evil.example", "127.0.0.1:8765")
    assert not planner.origin_allows_handoff("http://127.0.0.1:8765", "192.168.1.20:8765")


def test_server_hides_archive_path_and_rejects_open():
    httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_address[1]}"

    def call(path, body=None, origin=None):
        data = json.dumps(body).encode() if body is not None else None
        headers = {"Content-Type": "application/json"} if body is not None else {}
        if origin:
            headers["Origin"] = origin
        req = urllib.request.Request(base + path, data=data, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=10) as res:
                return res.status, res.read()
        except urllib.error.HTTPError as err:
            return err.code, err.read()

    status, raw = call("/api/meta")
    assert status == 200
    meta = json.loads(raw)
    assert EMPTY not in raw.decode()
    assert meta["archiveVia"] == "environment"
    assert meta["archiveReady"] is False
    assert meta["files"] == 0
    assert meta["handoff"] == "none"
    assert "Download" in meta["handoffNote"] or "download" in meta["handoffNote"]
    page = call("/")[1].decode()
    for text in ("VAULT_ARCHIVE", "Unraid", "Only offer choices that fit", "Save project", "data-tab=\"assemble\"", "Show a sample plate"):
        assert text in page, text
    code, body = call("/api/handoff", {"file": "../../etc/passwd", "app": "bambu"})
    assert code == 403
    assert b"passwd" not in body or b"Refusing" in body or b"only" in body.lower() or b"exported" in body.lower()
    code, _ = call("/api/handoff", {"file": "piece.3mf", "app": "bambu"}, origin="http://evil.example")
    assert code == 403
    code, _ = call("/api/open", {"path": "/etc/passwd"})
    assert code == 403
    code, _ = call("/api/download_file?name=../../etc/passwd")
    assert code == 404
    code, raw = call("/api/sample_plan")
    assert code == 200 and json.loads(raw)["synthetic"] is True
    code, raw = call("/api/export_part", {"file": "../secret.stl", "settings": {}})
    assert code == 500 and b"unknown part" in raw
    httpd.shutdown()


def test_xl7_h2d_choices_keep_invalid_selection():
    """The reported XL7 1U meshes do not fit an H2D left nozzle. The current XL choice stays."""
    h2d = plates.catalog_printer("Bambu Lab H2D · left nozzle", "h2d-left")
    module, facade = [57.0, 418.8, 314.1], [418.8, 47.0, 10.0]
    assert plates.fits(module, h2d, 0) is None
    assert plates.fits(facade, h2d, 0) is None
    mini = next(p for p in plates.PRINTER_CATALOG if p["name"] == "Bambu Lab A1 mini")
    assert plates.fits(facade, {**mini, "bed": list(mini["bed"]), "maxH": mini["z"]}, 0) is None

    class Idx:
        def find(self, name, hint=""):
            return "virtual/" + name + ".stl"

        def divider(self, folder, length):
            return "virtual/divider.stl"

    def stats(path):
        if "Module" in path and "XL" in path:
            return {"size": module, "volume_cm3": 1, "area_cm2": 1}
        if "Facade" in path and "XL" in path:
            return {"size": facade, "volume_cm3": 1, "area_cm2": 1}
        return {"size": [30, 20, 10], "volume_cm3": 1, "area_cm2": 1}

    stack = {"depth": 7, "layers": [{"type": "Drawers", "layout": "XL", "height": 1, "facades": [[1]],
                                     "interior": "none", "key": "none", "labels": False, "rails": False, "manualSupports": False}],
             "roof": {"type": "none"}, "mods": {}}
    saved = json.loads(json.dumps(stack))
    result = stackfit.fit_choices(stack, [h2d], 0, Idx(), {}, stats, lambda rel: True)
    assert stack["layers"][0]["layout"] == "XL" and stack == saved
    layouts = result["layers"][0]["layout"]
    xl = next(choice for choice in layouts if choice["value"] == "XL")
    narrow = next(choice for choice in layouts if choice["value"] == "S")
    assert xl["current"] and not xl["fits"] and "418.8" in xl["reason"]
    assert narrow["fits"] and not narrow["current"]
    depth7 = next(choice for choice in result["depth"] if choice["value"] == 7)
    assert depth7["current"] and not depth7["fits"]
    big = {"id": "big", "name": "Large bed", "bed": [450, 450], "z": 400, "maxH": 400}
    wider = stackfit.fit_choices(stack, [big], 0, Idx(), {}, stats, lambda rel: True)
    assert next(choice for choice in wider["layers"][0]["layout"] if choice["value"] == "XL")["fits"]

    def stats_depth(path):
        if "XL7 Module" in path:
            return {"size": module, "volume_cm3": 1, "area_cm2": 1}
        return {"size": [30, 20, 10], "volume_cm3": 1, "area_cm2": 1}

    by_depth = stackfit.fit_choices(stack, [h2d], 0, Idx(), {}, stats_depth, lambda rel: True)
    assert not next(choice for choice in by_depth["depth"] if choice["value"] == 7)["fits"]
    assert next(choice for choice in by_depth["depth"] if choice["value"] == 3)["fits"]
    judged, scope = stackfit.judged_printers({"printers": [h2d, big]}, "h2d-left")
    assert scope == "one" and [p["id"] for p in judged] == ["h2d-left"]
    judged, scope = stackfit.judged_printers({"printers": [h2d, {**big, "enabled": True}]}, "every")
    assert scope == "every" and len(judged) == 2


def test_unknown_height_becomes_one():
    stack = {"layers": [{"layout": "S", "height": 9, "facades": [[9]]}]}
    stackfit.normalize(stack)
    assert stack["layers"][0]["height"] == 1
    assert stack["layers"][0]["facades"] == [[1]]
    bom, _ = server.compute_bom({"stack": {"depth": 5, "layers": [], "roof": {"type": "none"}, "mods": {}}, "fitTarget": "every"})
    assert bom["judged"]["scope"] == "every" and len(bom["judged"]["printers"]) == 4
    assert "optionFits" not in bom
    assert [entry["value"] for entry in bom["choices"]["depth"]] == list(catalog.DEPTHS)
    assert [entry["value"] for entry in bom["choices"]["roof"]] == list(catalog.ROOFS)
    judged_bom, _ = server.compute_bom({
        "fitChoices": True,
        "fitTarget": "h2d-left",
        "stack": {"depth": 5, "layers": [{"type": "Drawers", "layout": "S", "height": 9, "facades": [[9]],
                                          "interior": "none", "key": "none"}], "roof": {"type": "none"}, "mods": {}},
    })
    assert judged_bom["stack"]["depth"] == 5
    assert judged_bom["stack"]["layers"][0]["height"] == 1
    assert judged_bom["stack"]["layers"][0]["facades"] == [[1]]
    assert judged_bom["choices"] is judged_bom["optionFits"]
    assert [entry["value"] for entry in judged_bom["choices"]["depth"]] == list(catalog.DEPTHS)
    assert [entry["value"] for entry in judged_bom["choices"]["layers"][0]["height"]] == list(catalog.HEIGHTS)
    assert isinstance(judged_bom["choices"]["layers"][0]["reasons"], list)
    frame = stackfit.choice_frame(json.loads(json.dumps(judged_bom["stack"])))
    h2d = plates.catalog_printer("Bambu Lab H2D · left nozzle", "h2d-left")

    class Found:
        def find(self, name, hint=""):
            return "virtual/" + name + ".stl"

        def divider(self, folder, length):
            return "virtual/divider.stl"

    judged = stackfit.fit_choices(judged_bom["stack"], [h2d], 0, Found(), {}, lambda path: {"size": [30, 20, 10], "volume_cm3": 1, "area_cm2": 1}, lambda rel: True)
    assert [entry["value"] for entry in judged["depth"]] == [entry["value"] for entry in frame["depth"]]
    assert "fits" in judged["depth"][0] and "fits" not in frame["depth"][0]
    assert judged["layers"][0]["reasons"] == []


if __name__ == "__main__":
    test_quantities()
    test_unknown_height_becomes_one()
    test_xl7_h2d_choices_keep_invalid_selection()
    test_fleet_and_sample()
    test_handoff_policy()
    test_server_hides_archive_path_and_rejects_open()
    print("test_planner ok")
