"""H2D dual-nozzle split, using synthetic meshes only.

The numbers under test are the guide's 350 mm plate and 325 mm nozzle reach, and this
repo's catalog placement of the right nozzle at x = 25.
"""
import json
import os
import re
import sys
import tempfile
import zipfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import h2d_split  # noqa: E402
import mesh  # noqa: E402
import plates  # noqa: E402
import presets  # noqa: E402

CUBE = np.array([
    [[0, 0, 0], [1, 1, 0], [1, 0, 0]], [[0, 0, 0], [0, 1, 0], [1, 1, 0]],
    [[0, 0, 1], [1, 0, 1], [1, 1, 1]], [[0, 0, 1], [1, 1, 1], [0, 1, 1]],
    [[0, 0, 0], [1, 0, 0], [1, 0, 1]], [[0, 0, 0], [1, 0, 1], [0, 0, 1]],
    [[0, 1, 0], [1, 1, 1], [1, 1, 0]], [[0, 1, 0], [0, 1, 1], [1, 1, 1]],
    [[0, 0, 0], [0, 0, 1], [0, 1, 1]], [[0, 0, 0], [0, 1, 1], [0, 1, 0]],
    [[1, 0, 0], [1, 1, 1], [1, 0, 1]], [[1, 0, 0], [1, 1, 0], [1, 1, 1]],
], dtype=float)


def box(w, d, h):
    out = CUBE.copy()
    out[:, :, 0] *= w
    out[:, :, 1] *= d
    out[:, :, 2] *= h
    return out


def machine():
    left = plates.catalog_printer("Bambu Lab H2D · left nozzle", "h2d-left")
    right = plates.catalog_printer("Bambu Lab H2D · right nozzle", "h2d-right")
    both = plates.catalog_printer("Bambu Lab H2D · both nozzles (split)", "h2d-both")
    return both, left, right, left["bed"][0], right["origin"][0]


def world(tri, x, y, rot):
    placed = mesh.rotate_z(tri, rot)
    placed = np.array(placed, copy=True)
    placed[:, :, 0] += x
    placed[:, :, 1] += y
    return placed


def test_limits_and_single_nozzle_regression():
    both, left, right, left_w, _right_min = machine()
    assert plates.fits([200, 80, 40], left) is not None
    assert plates.fits([200, 80, 40], right) is not None
    assert plates.fits([418.8, 47, 10], left) is None  # wider than one nozzle and than the combined bed
    assert h2d_split.fit_angle([418.8, 47, 10], 0, both["bed"], left_w) is None
    assert h2d_split.fit_angle([360, 40, 20], 0, both["bed"], left_w) is None
    assert h2d_split.fit_angle([200, 80, 40], 0, both["bed"], left_w) == 0.0
    assert h2d_split.fit_angle([340, 40, 20], 0, both["bed"], left_w) == 0.0
    assert h2d_split.fit_angle([40, 340, 20], 0, both["bed"], left_w) == 90.0
    # A thin bar can still lie on the left nozzle diagonally. Combined mode does not claim that as a split.
    assert plates.fits([400, 20, 10], left) is not None
    assert h2d_split.fit_angle([400, 20, 10], 0, both["bed"], left_w) is None
    short = {**both, "maxH": 10}
    assert plates.fits([200, 40, 20], short) is None  # the shared height limit still applies


def test_cut_conserves_a_box():
    solid = box(340, 100, 20)
    original = mesh.mesh_volume(solid)
    left, right = h2d_split.split_mesh(solid, 175)
    assert h2d_split.watertight(left) and h2d_split.watertight(right)
    assert abs((mesh.mesh_volume(left) + mesh.mesh_volume(right)) - original) < 1e-3
    assert left[:, :, 0].max() <= 175 + 1e-4
    assert right[:, :, 0].min() >= 175 - 1e-4
    # The parts meet. They do not overlap as solids and they do not leave a gap.
    assert abs(left[:, :, 0].max() - right[:, :, 0].min()) < 1e-4
    assert abs(mesh.mesh_volume(left) - 175 * 100 * 20) < 1e-2
    assert abs(mesh.mesh_volume(right) - 165 * 100 * 20) < 1e-2


def test_placed_split_stays_inside_each_nozzle():
    both, _left, _right, left_max, right_min = machine()
    plate_x = both["bed"][0]
    solid = box(340, 80, 15)
    item = {"x": 1, "y": 2, "rot": 0, "w": 340, "d": 80}
    h2d_split.classify(item, plates.footprint_corners(item), both["bed"], left_max, right_min)
    assert item["nozzle"] == "split"
    cut = item["splitX"]
    assert right_min <= cut <= left_max
    halves = h2d_split.split_for_pose(solid, item["x"], item["rot"], cut)
    assert halves is not None
    left, right = (world(half, item["x"], item["y"], item["rot"]) for half in halves)
    assert left[:, :, 0].min() >= -1e-4 and left[:, :, 0].max() <= left_max + 1e-4
    assert right[:, :, 0].min() >= right_min - 1e-4 and right[:, :, 0].max() <= plate_x + 1e-4
    assert abs(mesh.mesh_volume(left) + mesh.mesh_volume(right) - mesh.mesh_volume(solid)) < 1e-2
    # A part that fits the left nozzle is not split.
    narrow = {"x": 0, "y": 0, "rot": 0, "w": 200, "d": 80}
    h2d_split.classify(narrow, plates.footprint_corners(narrow), both["bed"], left_max, right_min)
    assert narrow["nozzle"] == "left" and "splitX" not in narrow
    wide = {"x": 0, "y": 0, "rot": 0, "w": 360, "d": 40}
    h2d_split.classify(wide, plates.footprint_corners(wide), both["bed"], left_max, right_min)
    assert wide["nozzle"] == "unsplittable"
    turned = {"x": 340, "y": 0, "rot": 90, "w": 80, "d": 340}
    h2d_split.classify(turned, plates.footprint_corners(turned), both["bed"], left_max, right_min)
    assert turned["nozzle"] == "split"
    halves = h2d_split.split_for_pose(box(80, 340, 15), turned["x"], 90, turned["splitX"])
    assert halves is not None
    left, right = (world(half, turned["x"], turned["y"], 90) for half in halves)
    assert left[:, :, 0].max() <= left_max + 1e-3
    assert right[:, :, 0].min() >= right_min - 1e-3
    assert abs(mesh.mesh_volume(halves[0]) + mesh.mesh_volume(halves[1]) - mesh.mesh_volume(box(80, 340, 15))) < 1e-2


def test_3mf_is_one_object_with_two_nozzles():
    solid = box(340, 60, 12)
    cut = 175.0
    left, right = h2d_split.split_mesh(solid, cut)
    path = os.path.join(tempfile.mkdtemp(prefix="h2d-"), "split.3mf")
    mesh.write_3mf(path, [{
        "name": "synthetic bar",
        "parts": [
            {"name": "synthetic bar · left nozzle", "mesh": left, "extruder": 1},
            {"name": "synthetic bar · right nozzle", "mesh": right, "extruder": 2},
        ],
    }], [{"name": "split", "items": [(0, 0, 0, 0)]}], (350, 320), "h2d split test")
    with zipfile.ZipFile(path) as zf:
        model = zf.read("3D/3dmodel.model").decode()
        cfg = zf.read("Metadata/model_settings.config").decode()
    assert model.count("<item ") == 1  # one object, not two bodies to glue
    assert cfg.count("<part ") == 2
    extruders = re.findall(r'<part id="\d+"[^>]*>.*?<metadata key="extruder" value="(\d+)"', cfg, re.S)
    assert extruders == ["1", "2"]
    names = re.findall(r'<part id="\d+"[^>]*>.*?<metadata key="name" value="([^"]+)"', cfg, re.S)
    assert names == ["synthetic bar · left nozzle", "synthetic bar · right nozzle"]
    outside = mesh.verify_3mf(path, (350, 320))
    assert outside == []
    # The right half is its own component. Shifting only that mesh must fail the plate check.
    right = right.copy()
    right[:, :, 0] += 400
    mesh.write_3mf(path, [{
        "name": "synthetic bar",
        "parts": [
            {"name": "synthetic bar · left nozzle", "mesh": left, "extruder": 1},
            {"name": "synthetic bar · right nozzle", "mesh": right, "extruder": 2},
        ],
    }], [{"name": "split", "items": [(0, 0, 0, 0)]}], (350, 320), "h2d split test")
    assert mesh.verify_3mf(path, (350, 320))


def test_plan_splits_only_the_wide_part():
    both = {**plates.catalog_printer("Bambu Lab H2D · both nozzles (split)", "h2d-both"), "enabled": True, "nozzle": "0.4", "preset": ""}
    assert both["nozzleMode"] == "h2d-split" and both["bed"] == [350, 320]
    stats = {
        "wide": {"size": [340, 40, 20], "volume_cm3": 10, "area_cm2": 10},
        "narrow": {"size": [100, 40, 20], "volume_cm3": 1, "area_cm2": 1},
        "too": {"size": [418.8, 47, 10], "volume_cm3": 1, "area_cm2": 1},
    }
    parts = [
        {"name": "wide", "file": "wide", "qty": 1, "role": "main", "group": "g"},
        {"name": "narrow", "file": "narrow", "qty": 1, "role": "main", "group": "g"},
        {"name": "too", "file": "too", "qty": 1, "role": "main", "group": "g"},
    ]
    result = plates.plan(parts, {"printers": [both], "mode": "h2d-both", "groupBy": "color"}, lambda f: stats[f])
    assert any(row["name"] == "too" for row in result["unplaceable"])
    split = [it for pl in result["plates"] for it in pl["items"] if it.get("nozzle") == "split"]
    assert len(split) == 1 and split[0]["part"] == "wide"
    _both, _left, _right, left_max, right_min = machine()
    assert right_min <= split[0]["splitX"] <= left_max
    assert all("h2dSplit" not in pl for pl in result["plates"])
    narrow = [it for pl in result["plates"] for it in pl["items"] if it["part"] == "narrow"]
    assert narrow and narrow[0]["nozzle"] == "left"
    left = {**plates.catalog_printer("Bambu Lab H2D · left nozzle", "h2d-left"), "enabled": True, "nozzle": "0.4", "preset": ""}
    left_plan = plates.plan([parts[1]], {"printers": [left], "mode": "h2d-left", "groupBy": "color"}, lambda f: stats[f])
    assert left_plan["placed"] == 1
    assert "nozzle" not in left_plan["plates"][0]["items"][0]


def test_edge_inset_and_shared_wide_plate():
    """A part inside the raw nozzle width can still need the combined bed once the edge is removed.
    Several bars that need that bed share one plate."""
    both, _left, _right, left_w, right_min = machine()
    assert h2d_split.single_nozzle_angle([320, 40, 10], 0, both["bed"], left_w) == 0.0
    assert h2d_split.single_nozzle_angle([320, 40, 10], 5, both["bed"], left_w) is None
    assert h2d_split.fit_angle([320, 40, 10], 5, both["bed"], left_w) == 0.0
    both = {**both, "enabled": True}
    inset = [{"name": f"inset-{n}", "file": "inset", "qty": 1, "role": "main", "group": "g"} for n in ("a", "b")]
    inset.append({"name": "narrow", "file": "narrow", "qty": 1, "role": "main", "group": "g"})
    stats = {"inset": {"size": [320, 40, 10], "volume_cm3": 1, "area_cm2": 1},
             "narrow": {"size": [100, 40, 10], "volume_cm3": 1, "area_cm2": 1}}
    result = plates.plan(inset, {"printers": [both], "mode": "h2d-both", "groupBy": "color", "edge": 5, "spacing": 6}, lambda f: stats[f])
    inset_plates = [pl for pl in result["plates"] if any(it["part"].startswith("inset") for it in pl["items"])]
    assert len(inset_plates) == 1 and len(inset_plates[0]["items"]) == 2
    for it in inset_plates[0]["items"]:
        assert it["x"] == 5
        assert it["x"] + it["w"] <= both["bed"][0] + 1e-6
    narrow = [it for pl in result["plates"] for it in pl["items"] if it["part"] == "narrow"]
    assert len(narrow) == 1 and narrow[0]["nozzle"] == "left" and "splitX" not in narrow[0]
    bars = [{"name": f"bar-{n}", "file": "bar", "qty": 1, "role": "main", "group": "g"} for n in range(3)]
    wide = plates.plan(bars, {"printers": [both], "mode": "h2d-both", "groupBy": "color", "edge": 0, "spacing": 6},
                       lambda f: {"size": [330, 40, 10], "volume_cm3": 1, "area_cm2": 1})
    split = [it for pl in wide["plates"] for it in pl["items"] if it.get("nozzle") == "split"]
    assert len(split) == 3
    assert sum(1 for pl in wide["plates"] if any(it.get("nozzle") == "split" for it in pl["items"])) == 1
    assert all(right_min <= it["splitX"] <= left_w for it in split)


def _open_sheet():
    """Not a closed solid, so the H2D cut cannot cap it."""
    return np.array([[[0.0, 0.0, 0.0], [340.0, 0.0, 0.0], [0.0, 30.0, 0.0]]], dtype=float)


def test_tpu_wider_than_the_right_nozzle_is_refused():
    both = {**plates.catalog_printer("Bambu Lab H2D · both nozzles (split)", "h2d-both"), "enabled": True}
    stats = {"wide": {"size": [340, 40, 10], "volume_cm3": 1, "area_cm2": 1}}
    parts = [{"name": "wide tyre", "file": "wide", "qty": 1, "role": "tpu", "group": "g", "kind": "other"}]
    result = plates.plan(parts, {"printers": [both], "mode": "h2d-both"}, lambda f: stats[f])
    assert result["placed"] == 0
    assert result["unplaceable"] and "right nozzle" in result["unplaceable"][0]["reason"]
    assert result["placed"] + sum(u.get("qty", 1) for u in result["unplaceable"]) == result["pieces"]


def test_right_only_preset_under_another_name_lands_right():
    """The preset's filament_printable wins over the material name. Settings filaments have no printable key."""
    assert presets.nozzle_list(["PLA"], [["2"]]) == ["2"]
    assert presets.nozzle_list(["TPU"], [[]]) == ["2"]
    assert presets.nozzle_list(["PLA"], [["1", "2"]]) == ["1"]
    both = {**plates.catalog_printer("Bambu Lab H2D · both nozzles (split)", "h2d-both"), "enabled": True}
    filaments = [dict(f) for f in plates.DEFAULT_FILAMENTS]
    filaments[0] = {**filaments[0], "name": "right-only PLA", "material": "PLA"}
    assert "printable" not in filaments[0]
    stats = {"tab": {"size": [80, 40, 10], "volume_cm3": 1, "area_cm2": 1}}
    parts = [{"name": "tab", "file": "tab", "qty": 1, "role": "main", "group": "g", "kind": "other"}]

    def fake_read(_slicer, names):
        # The loaded preset for slot 0 is right-nozzle-only. The other presets are not loaded.
        return [["2"]] + [[] for _ in list(names)[1:]]

    saved = presets.read_filament_printables
    presets.read_filament_printables = fake_read
    try:
        result = plates.plan(parts, {"printers": [both], "mode": "h2d-both", "filaments": filaments}, lambda f: stats[f])
    finally:
        presets.read_filament_printables = saved
    item = result["plates"][0]["items"][0]
    sides = result["nozzleLists"][both["id"]]
    assert sides[0] == "2" and item["nozzle"] == "right"
    assert min(x for x, _y in item["corners"]) >= 25 - 0.05
    left_ex, right_ex = presets.cut_extruders(sides)
    assert left_ex == 2 and right_ex == 1  # slot 0 is the right-only PLA; the next PETG slot is the left nozzle


def test_tpu_slot_is_a_right_nozzle_hotend_without_a_cut():
    """No cut: TPU owns the right nozzle, so that hotend can be TPU High Flow and the slot is valid."""
    cfg = {"nozzle_diameter": ["0.4", "0.4"]}
    materials = ["PETG", "PETG", "PETG", "PETG", "TPU"]
    sides = presets.nozzle_list(materials, [[] for _ in materials])
    note = presets.dual_nozzle_project(cfg, materials, per_slot=True, nozzles=sides)
    assert note is None
    assert cfg["filament_map"] == ["1", "1", "1", "1", "2"]
    assert cfg["filament_map_mode"] == "Manual"
    assert cfg["nozzle_volume_type"] == ["Standard", "TPU High Flow"]
    assert cfg["flush_multiplier"] == ["1", "1"]
    n = len(materials)
    assert len(cfg["flush_volumes_matrix"]) == 2 * n * n
    for nozzle in range(2):
        block = cfg["flush_volumes_matrix"][nozzle * n * n:(nozzle + 1) * n * n]
        for i in range(n):
            for j in range(n):
                assert (block[i * n + j] == "0") is (i == j)


def _round_trip(path):
    """Plate-local part boxes, using the same plate grid Bambu Studio uses."""
    with zipfile.ZipFile(path) as zf:
        model = zf.read("3D/3dmodel.model").decode()
        ms = zf.read("Metadata/model_settings.config").decode()
        assert "Metadata/project_settings.config" in zf.namelist()
        proj = json.loads(zf.read("Metadata/project_settings.config"))
        meshes = {}
        mesh_ids = set()
        for name in zf.namelist():
            if not name.startswith("3D/Objects/"):
                continue
            xml = zf.read(name).decode()
            meshes["/" + name] = np.array(re.findall(r'<vertex x="([-\d.eE+]+)" y="([-\d.eE+]+)"', xml), float)
            mesh_ids.update(re.findall(r'<object id="(\d+)"', xml))
        top_ids = set(re.findall(r'<object id="(\d+)"', model))
        assert mesh_ids.isdisjoint(top_ids), (mesh_ids & top_ids)
    comps = {}
    for oid, body in re.findall(r'<object id="(\d+)"[^>]*>\s*<components>(.*?)</components>', model, re.S):
        comps[oid] = re.findall(r'p:path="([^"]+)"', body)
    tfs = {m[0]: [float(v) for v in m[1].split()] for m in re.findall(r'<item objectid="(\d+)"[^>]*transform="([^"]+)"', model)}
    part_meta = {}
    for oid, body in re.findall(r'<object id="(\d+)">(.*?)</object>', ms, re.S):
        for pid, pbody in re.findall(r'<part id="(\d+)"[^>]*>(.*?)</part>', body, re.S):
            nm = re.search(r'key="name" value="([^"]*)"', pbody)
            ex = re.search(r'key="extruder" value="(\d+)"', pbody)
            part_meta[(oid, pid)] = (nm.group(1) if nm else "", int(ex.group(1)) if ex else 1)
    bed = mesh.printable_size(proj, (350, 320))
    plates_xml = re.findall(r"<plate>(.*?)</plate>", ms, re.S)
    plates_out = []
    for i, pxml in enumerate(plates_xml):
        ox, oy = mesh.plate_origin(i, len(plates_xml), bed)
        parts = []
        for oid in re.findall(r'key="object_id" value="(\d+)"', pxml):
            t = tfs[oid]
            for sub in comps.get(oid) or []:
                xy = meshes[sub]
                wx = xy[:, 0] * t[0] + xy[:, 1] * t[3] + t[9] - ox
                wy = xy[:, 0] * t[1] + xy[:, 1] * t[4] + t[10] - oy
                mid = re.search(r"object_(\d+)\.model", sub).group(1)
                pname, ext = part_meta.get((oid, mid), ("", 1))
                parts.append({"name": pname, "extruder": ext, "minx": float(wx.min()), "maxx": float(wx.max()),
                              "miny": float(wy.min()), "maxy": float(wy.max())})
        plates_out.append(parts)
    return plates_out, proj


def test_exported_plates_hold_their_parts():
    """Round-trip a mixed H2D plate file. Fails on bd5353d: empty plates, TPU on the left edge, purge matrix one nozzle short."""
    both = {**plates.catalog_printer("Bambu Lab H2D · both nozzles (split)", "h2d-both"), "enabled": True, "preset": ""}
    stats = {
        "ins": {"size": [80, 40, 12], "volume_cm3": 1, "area_cm2": 1},
        "knob": {"size": [18, 12, 8], "volume_cm3": 1, "area_cm2": 1},
        "tyre": {"size": [28, 28, 10], "volume_cm3": 1, "area_cm2": 1},
        "wide": {"size": [330, 40, 12], "volume_cm3": 1, "area_cm2": 1},
        "bad": {"size": [340, 30, 10], "volume_cm3": 1, "area_cm2": 1},
    }
    parts = [
        {"name": "insert", "file": "ins", "qty": 4, "role": "main", "group": "drawers", "kind": "other"},
        {"name": "knob", "file": "knob", "qty": 1, "role": "knob", "group": "knob", "kind": "other"},
        {"name": "tyre", "file": "tyre", "qty": 6, "role": "tpu", "group": "wheels", "kind": "other"},
        {"name": "wide-ok", "file": "wide", "qty": 1, "role": "main", "group": "stack", "kind": "other"},
        {"name": "wide-bad", "file": "bad", "qty": 1, "role": "main", "group": "bad", "kind": "other"},
    ]
    settings = {"printers": [both], "mode": "h2d-both", "groupBy": "module", "spacing": 6, "edge": 0}

    def load(_root, rel, st):
        if rel == "bad":
            return _open_sheet()
        w, d, h = st["size"]
        return box(w, d, h)

    def project_stub(s, p, nozzles=None):
        materials = [f.get("material") or "PETG" for f in s["filaments"]]
        if nozzles is None:
            nozzles = presets.nozzle_list(materials, presets.read_filament_printables(p.get("slicer"), [""] * len(materials)))
        cfg = {
            "printable_area": ["0x0", "350x0", "350x320", "0x320"],
            "nozzle_diameter": ["0.4", "0.4"],
            "filament_type": materials,
            "filament_colour": [(f.get("color") or "#808080").upper() for f in s["filaments"]],
            "filament_settings_id": [f.get("name") or "" for f in s["filaments"]],
            "version": "02.08.00.06",
        }
        note = presets.dual_nozzle_project(cfg, materials, p.get("nozzleSide"), p.get("nozzleMode") == "h2d-split", nozzles)
        if note:
            cfg["_tpu_note"] = note
        return cfg, list(cfg["filament_settings_id"])

    saved_load, saved_project = mesh.load_aligned, plates.project_for
    mesh.load_aligned = load
    plates.project_for = project_stub
    try:
        result = plates.plan(parts, settings, lambda f: stats[f])
        out = tempfile.mkdtemp(prefix="h2d-plates-")
        written = plates.export(result, settings, out, "/tmp", lambda f: stats[f], stack_name="syn")
    finally:
        mesh.load_aligned = saved_load
        plates.project_for = saved_project
    assert len(written) == 1, written
    path = written[0]["file"]
    laid, proj = _round_trip(path)
    assert laid and all(laid), laid  # a plate tag with no instances is the empty plate Studio shows
    names = [part["name"] for plate in laid for part in plate]
    assert not any(name.startswith("wide-bad") for name in names)
    assert any("left nozzle" in name for name in names) and any("right nozzle" in name for name in names)
    mapping = [int(v) for v in proj["filament_map"]]
    assert [str(v) for v in mapping] == result["nozzleLists"][both["id"]]
    # Slot 0 (main PETG) stays on the left. Slot 4 (TPU) is the right nozzle. Slot 1 is not forced there.
    assert mapping[0] == 1 and mapping[1] == 1 and mapping[4] == 2
    assert proj["nozzle_volume_type"] == ["Standard", "TPU High Flow"]
    assert proj["flush_multiplier"] == ["1", "1"]
    n = len(proj["filament_settings_id"])
    matrix = proj["flush_volumes_matrix"]
    assert len(matrix) == 2 * n * n
    for nozzle in range(2):
        block = matrix[nozzle * n * n:(nozzle + 1) * n * n]
        for i in range(n):
            for j in range(n):
                assert (block[i * n + j] == "0") is (i == j)
    assert written[0]["warning"] and "filament slot" in written[0]["warning"]
    halves = [part for plate in laid for part in plate if "nozzle" in part["name"]]
    left = next(part for part in halves if "left nozzle" in part["name"])
    right = next(part for part in halves if "right nozzle" in part["name"])
    assert left["extruder"] == 1 and mapping[left["extruder"] - 1] == 1
    assert right["extruder"] == 5 and mapping[right["extruder"] - 1] == 2
    seen = []
    for plate in laid:
        anchors = []
        for part in plate:
            side = mapping[part["extruder"] - 1]
            lo, hi = (0.0, 325.0) if side == 1 else (25.0, 350.0)
            assert part["minx"] >= lo - 0.2 and part["maxx"] <= hi + 0.2, (part, side)
            assert -0.2 <= part["miny"] and part["maxy"] <= 320.2, part
            anchors.append((round(part["minx"], 1), round(part["miny"], 1)))
            seen.append(part["name"])
        if len(anchors) > 1:
            assert len(set(anchors)) == len(anchors), anchors
    assert seen.count("tyre") == 6
    assert all(part["minx"] >= 25 - 0.2 for plate in laid for part in plate if part["name"] == "tyre")


if __name__ == "__main__":
    test_limits_and_single_nozzle_regression()
    test_cut_conserves_a_box()
    test_placed_split_stays_inside_each_nozzle()
    test_3mf_is_one_object_with_two_nozzles()
    test_plan_splits_only_the_wide_part()
    test_edge_inset_and_shared_wide_plate()
    test_tpu_wider_than_the_right_nozzle_is_refused()
    test_right_only_preset_under_another_name_lands_right()
    test_tpu_slot_is_a_right_nozzle_hotend_without_a_cut()
    test_exported_plates_hold_their_parts()
    print("test_h2d_split ok")
