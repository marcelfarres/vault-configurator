"""STL loading, part statistics cache, XY alignment and 3MF plate writing.

Everything here is numpy + stdlib. Meshes are kept as (triangles, 3, 3) float arrays.
"""
import json
import math
import os
import time
import zipfile
from xml.sax.saxutils import escape

import numpy as np

STL_DTYPE = np.dtype([("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")])


def read_stl(path, tries=4):
    """Binary STL -> (n_tris, 3, 3) float64 array. Retries because Google Drive
    streams files on first access and sometimes fails the first open."""
    for i in range(tries):
        try:
            with open(path, "rb") as f:
                f.read(80)
                n = int.from_bytes(f.read(4), "little")
                data = np.fromfile(f, dtype=STL_DTYPE, count=n)
            if len(data) != n:
                raise OSError(f"short STL read {len(data)}/{n}")
            return data["v"].astype(np.float64)
        except OSError:
            if i == tries - 1:
                raise
            time.sleep(1.5)


def mesh_volume(tri):
    return float(np.einsum("ij,ij->i", tri[:, 0], np.cross(tri[:, 1], tri[:, 2])).sum() / 6.0)


def best_xy_angle(points):
    """Rotation (degrees, about Z) that gives the minimum-area XY bounding box.
    The STLs come out of CAD at arbitrary world rotations; this re-squares them.
    ponytail: grid-decimated point set + angle sweep, not an exact rotating calipers."""
    xy = points[:, :2]

    def sweep(pts, angles):
        a = np.radians(angles)
        c, s = np.cos(a), np.sin(a)
        x = pts[:, 0:1] * c - pts[:, 1:2] * s
        y = pts[:, 0:1] * s + pts[:, 1:2] * c
        area = (x.max(0) - x.min(0)) * (y.max(0) - y.min(0))
        return float(angles[int(np.argmin(area))])

    pts = np.unique(np.round(xy, 0), axis=0)  # 1 mm grid, usually a few thousand points
    if len(pts) > 20000:
        pts = pts[np.random.default_rng(0).choice(len(pts), 20000, replace=False)]
    coarse = sweep(pts, np.arange(0, 90, 0.5))
    # refine on the exact points that sit near the coarse bbox edges (the ones that define it)
    a = math.radians(coarse)
    rx = xy[:, 0] * math.cos(a) - xy[:, 1] * math.sin(a)
    ry = xy[:, 0] * math.sin(a) + xy[:, 1] * math.cos(a)
    band = (rx < rx.min() + 3) | (rx > rx.max() - 3) | (ry < ry.min() + 3) | (ry > ry.max() - 3)
    edge = np.unique(xy[band], axis=0)
    if len(edge) > 50000:
        edge = edge[np.random.default_rng(0).choice(len(edge), 50000, replace=False)]
    fine = sweep(edge, np.arange(coarse - 0.6, coarse + 0.6, 0.01))
    return round(fine % 90, 2)


def rotate_z(tri, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    out = tri.copy()
    out[..., 0] = tri[..., 0] * c - tri[..., 1] * s
    out[..., 1] = tri[..., 0] * s + tri[..., 1] * c
    return out


class StatsCache:
    """Per-file geometry facts (bbox after alignment, volume, triangle count)."""

    def __init__(self, root, cache_file):
        self.root = root
        self.cache_file = cache_file
        self.data = {}
        if os.path.exists(cache_file):
            with open(cache_file, encoding="utf-8") as f:  # older caches also keyed by mtime: drop it
                self.data = {k if k.count("|") == 1 else k.rsplit("|", 1)[0]: v for k, v in json.load(f).items()}

    def _key(self, rel):
        # path + size, not mtime: the archive is read-only, and copying it to a NAS changes every mtime
        return f"{rel}|{os.stat(os.path.join(self.root, rel)).st_size}"

    def get(self, rel):
        key = self._key(rel)
        if key not in self.data or "topx" not in self.data[key]:
            self.data[key] = self._compute(rel)
            self.save()
        return self.data[key]

    def _compute(self, rel):
        tri = read_stl(os.path.join(self.root, rel))
        pts = tri.reshape(-1, 3)
        angle = best_xy_angle(pts)
        r = rotate_z(tri, angle).reshape(-1, 3)
        mn, mx = r.min(0), r.max(0)
        area = float(np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1).sum() / 2)
        top = r[r[:, 2] > mx[2] - 1.0]  # where the highest 1 mm of the part sits in its footprint (0..1): a wedge's vertical edge
        ext = np.maximum(mx - mn, 1e-9)
        return {
            "tris": int(len(tri)),
            "angle": angle,
            "size": [round(float(v), 2) for v in (mx - mn)],
            "volume_cm3": round(abs(mesh_volume(tri)) / 1000.0, 2),
            "area_cm2": round(area / 100.0, 1),
            "topx": round(float((top[:, 0].mean() - mn[0]) / ext[0]), 3),
            "topy": round(float((top[:, 1].mean() - mn[1]) / ext[1]), 3),
        }

    def save(self):
        os.makedirs(os.path.dirname(self.cache_file), exist_ok=True)
        tmp = self.cache_file + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.data, f)
        os.replace(tmp, self.cache_file)


def thumb_png(tri, size=256, points=180000):
    """Shaded isometric silhouette as a grey+alpha PNG. Tint it in the browser (CSS multiply).
    ponytail: point-splat renderer, no rasteriser; fine for 160 px thumbnails."""
    import struct
    import zlib
    a, b, c = tri[:, 0], tri[:, 1], tri[:, 2]
    n = np.cross(b - a, c - a)
    area = np.linalg.norm(n, axis=1)
    nrm = n / np.maximum(area, 1e-9)[:, None]
    cnt = np.maximum(1, np.round(area / max(area.sum(), 1e-9) * points)).astype(int)
    idx = np.repeat(np.arange(len(tri)), cnt)
    rng = np.random.default_rng(0)
    s = np.sqrt(rng.random(len(idx)))
    r2 = rng.random(len(idx))
    u, v, w = 1 - s, s * (1 - r2), s * r2  # uniform barycentric sampling
    pts = a[idx] * u[:, None] + b[idx] * v[:, None] + c[idx] * w[:, None]
    cz, sz = math.cos(math.radians(-35)), math.sin(math.radians(-35))
    ct, st = math.cos(math.radians(32)), math.sin(math.radians(32))

    def view(p):  # screen x, screen y (up), depth towards the viewer
        x, y, z = p[:, 0] * cz - p[:, 1] * sz, p[:, 0] * sz + p[:, 1] * cz, p[:, 2]
        return np.stack([x, y * ct + z * st, -y * st + z * ct], 1)

    vp, vn = view(pts), view(nrm[idx])
    lo, hi = vp[:, :2].min(0), vp[:, :2].max(0)
    scale = (size - 10) / max(float((hi - lo).max()), 1e-9)
    px = (4 + (vp[:, 0] - lo[0]) * scale).astype(int)
    py = (size - 5 - (vp[:, 1] - lo[1]) * scale).astype(int)
    light = np.array([-0.35, 0.55, 0.75]); light /= np.linalg.norm(light)
    shade = (70 + 185 * np.clip(np.abs(vn @ light), 0, 1)).astype(np.uint8)
    order = np.argsort(vp[:, 2])  # far first, near overwrites
    img = np.zeros((size, size, 2), np.uint8)
    for dy in (0, 1):
        for dx in (0, 1):
            yy, xx = np.clip(py[order] + dy, 0, size - 1), np.clip(px[order] + dx, 0, size - 1)
            img[yy, xx, 0] = shade[order]
            img[yy, xx, 1] = 255
    raw = b"".join(b"\x00" + img[r].tobytes() for r in range(size))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 4, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))


def load_aligned(root, rel, stats):
    """Mesh rotated to its squared-up orientation and moved so min corner is at origin."""
    tri = rotate_z(read_stl(os.path.join(root, rel)), stats["angle"])
    tri -= tri.reshape(-1, 3).min(0)
    return tri


# ---------------------------------------------------------------- 3MF writing

CONTENT_TYPES = (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
    '<Default Extension="config" ContentType="text/xml"/>'
    "</Types>"
)
RELS = (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Target="/3D/3dmodel.model" Id="rel-1" '
    'Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>'
    "</Relationships>"
)


def _mesh_xml(tri):
    """Deduplicate vertices and emit <mesh> XML. C-level % formatting keeps this fast."""
    flat = tri.reshape(-1, 3)
    verts, inv = np.unique(np.round(flat, 3), axis=0, return_inverse=True)
    inv = inv.reshape(-1, 3)
    v_xml = ('<vertex x="%.3f" y="%.3f" z="%.3f"/>\n' * len(verts)) % tuple(verts.ravel())
    t_xml = ('<triangle v1="%d" v2="%d" v3="%d"/>\n' * len(inv)) % tuple(inv.ravel())
    return f"<mesh><vertices>\n{v_xml}</vertices><triangles>\n{t_xml}</triangles></mesh>"


MODEL_NS = ('xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" '
            'xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" '
            'xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p"')
REL_MODEL = "http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"


def _uuid(n):
    return f"{n:08x}-0000-4000-8000-000000000000"


PLATE_GAP = 0.2  # Bambu/Orca lay plates out at 1.2 × bed size steps (measured on real projects)


def plate_origin(i, n, bed):
    """World origin of plate i (0-based) of n, as Bambu Studio arranges them: ceil(sqrt(n)) columns,
    x to the right, y downwards."""
    cols = math.ceil(math.sqrt(n))
    return ((i % cols) * bed[0] * (1 + PLATE_GAP), -(i // cols) * bed[1] * (1 + PLATE_GAP))


def printable_size(project, default):
    """The slicer's own printable area (from the machine preset in the project config): it decides where the
    slicer draws plate N, so plates must be offset by THAT size, not by the packing bed."""
    pts = (project or {}).get("printable_area") or []
    try:
        xs, ys = zip(*[(float(a), float(b)) for a, b in (p.split("x") for p in pts)])
        return (max(xs) - min(xs), max(ys) - min(ys))
    except (ValueError, TypeError):
        return tuple(default)


def verify_3mf(path, bed=None, tol=0.05, reach=None):
    """Read an exported 3MF the way the slicer does and list every piece that is not entirely on its plate.

    Independent of how the file was written: plate N is taken from model_settings.config, the plate grid
    from the project's printable_area (Bambu/Orca: stride = 1.2 x bed, ceil(sqrt(plates)) columns, x right,
    y down), and each piece's footprint from its real vertices through its build transform.
    reach = (x, y, w, d): the part of each plate the printer can print on (one nozzle of a dual-nozzle
    printer), relative to the plate's corner; default the whole plate.
    Returns [] when every piece is inside, else [{plate, name, overhang_mm}]."""
    import re
    with zipfile.ZipFile(path) as z:
        model = z.read("3D/3dmodel.model").decode()
        ms = z.read("Metadata/model_settings.config").decode()
        proj = json.loads(z.read("Metadata/project_settings.config")) if "Metadata/project_settings.config" in z.namelist() else {}
        comp = {}
        for oid, body in re.findall(r'<object id="(\d+)"[^>]*>\s*<components>(.*?)</components>', model, re.S):
            comp[oid] = re.findall(r'p:path="([^"]+)"', body)
        tf = {m[0]: [float(v) for v in m[1].split()] for m in re.findall(r'<item objectid="(\d+)"[^>]*transform="([^"]+)"', model)}
        names = dict(re.findall(r'<object id="(\d+)">\s*<metadata key="name" value="([^"]*)"', ms))
        meshes = {}
        for sub in {path for paths in comp.values() for path in paths}:
            xml = z.read(sub.lstrip("/")).decode()
            xy = np.array(re.findall(r'<vertex x="([-\d.eE+]+)" y="([-\d.eE+]+)"', xml), dtype=float)
            meshes[sub] = xy
    pts = [tuple(float(c) for c in p.split("x")) for p in proj.get("printable_area") or []]
    if pts:
        xs, ys = zip(*pts)
        x0, y0, w, d = min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)
    elif bed:  # no project config (no slicer presets found): the slicer then uses the bed the file was laid out for
        x0, y0, (w, d) = 0.0, 0.0, bed
    else:
        return []
    rx, ry, rw, rd = (x0 + reach[0], y0 + reach[1], reach[2], reach[3]) if reach else (x0, y0, w, d)
    plates = re.findall(r"<plate>(.*?)</plate>", ms, re.S)
    cols = math.ceil(math.sqrt(len(plates))) if plates else 1
    problems = []
    for i, p in enumerate(plates):
        px, py = (i % cols) * w * (1 + PLATE_GAP), -(i // cols) * d * (1 + PLATE_GAP)
        for oid in re.findall(r'key="object_id" value="(\d+)"', p):
            paths = comp.get(oid) or []
            pieces = [meshes.get(path) for path in paths]
            t = tf.get(oid)
            if t is None or not pieces or any(xy is None or not len(xy) for xy in pieces):
                problems.append({"plate": i + 1, "name": names.get(oid, oid), "overhang_mm": None})
                continue
            xy = np.concatenate(pieces, axis=0)
            wx = xy[:, 0] * t[0] + xy[:, 1] * t[3] + t[9]   # 3MF row-vector transform: x' = x*m00 + y*m10 + tx
            wy = xy[:, 0] * t[1] + xy[:, 1] * t[4] + t[10]
            over = max(px + rx - wx.min(), wx.max() - (px + rx + rw), py + ry - wy.min(), wy.max() - (py + ry + rd))
            if over > tol:
                problems.append({"plate": i + 1, "name": names.get(oid, oid), "overhang_mm": round(float(over), 2)})
    return problems


def write_3mf(path, objects, plates, bed, title="", project=None):
    """objects: [{name, mesh (tri array at print orientation, min corner at origin), extruder (1-based)}]
    plates:  [{name, items: [(object_index, x, y, rot_deg)]}]  positions are plate-local, bottom-left based
    bed:     (x, y) size used to offset plates the way the slicer does; overridden by the project's
             printable_area when a project config is given (the slicer lays plates out by its own bed).

    Mirrors the layout Bambu Studio writes itself (production extension: one mesh file per object
    under 3D/Objects, referenced by a component; ids/extruders repeated in model_settings.config),
    which Bambu Studio, OrcaSlicer and Anycubic Slicer Next all load."""
    head = f'<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" {MODEL_NS}>\n'
    app = "BambuStudio-" + ((project or {}).get("version") or "02.08.00.06")  # slicers only load plates/config from files they recognise as their own
    model = [head, f'<metadata name="Application">{app}</metadata>\n<metadata name="BambuStudio:3mfVersion">1</metadata>\n',
             f'<metadata name="Title">{escape(title)}</metadata>\n<resources>\n']
    build, settings, assemble, files, rels, plate_cfg = [], [], [], {}, [], []
    # each mesh is stored once (3D/Objects/object_N.model); every printed piece is its own top-level object that
    # references it through a component, so the slicer lists "L3 Box 1F" per piece instead of "Instance 2"
    def part_list(obj):
        # "parts" is Bambu's cut-to-parts: one object, several meshes and nozzles.
        # A bare mesh stays one part, which is what every existing export writes.
        if obj.get("parts"):
            return obj["parts"]
        return [{"name": obj["name"], "mesh": obj["mesh"], "extruder": obj.get("extruder", 1)}]

    mesh_id_of = {}
    next_mesh = 1
    for k, obj in enumerate(objects):
        stored = []
        for part in part_list(obj):
            mesh_id = next_mesh
            next_mesh += 1
            stored.append((mesh_id, part))
            sub = f"3D/Objects/object_{mesh_id}.model"
            files[sub] = f'{head}<metadata name="BambuStudio:3mfVersion">1</metadata>\n<resources>\n<object id="{mesh_id}" p:UUID="{_uuid(mesh_id)}" type="model">{_mesh_xml(part["mesh"])}</object>\n</resources>\n<build/>\n</model>\n'
            rels.append(f'<Relationship Target="/{sub}" Id="rel-{mesh_id}" Type="{REL_MODEL}"/>')
        mesh_id_of[k] = stored
    # Instance ids have to start past every mesh id. A cut object has two meshes, so
    # len(objects) collides with the last mesh and Studio drops or mis-places that instance.
    oid = next_mesh - 1
    grid = printable_size(project, bed)
    plates = [pl for pl in plates if pl.get("items")]
    for pi, plate in enumerate(plates):
        ox, oy = plate_origin(pi, len(plates), grid)
        bed_type = (project or {}).get("curr_bed_type") or "Textured PEI Plate"
        plate_cfg.append(f'<plate>\n<metadata key="plater_id" value="{pi + 1}"/>\n<metadata key="plater_name" value="{escape(plate["name"])}"/>\n<metadata key="locked" value="false"/>\n'
                         f'<metadata key="bed_type" value="{escape(bed_type)}"/>\n')
        for (k, x, y, rot) in plate["items"]:
            oid += 1
            obj, stored = objects[k], mesh_id_of[k]
            name = escape(obj["name"])
            components = []
            part_xml = []
            cfg_meta = "".join(f'<metadata key="{escape(kk)}" value="{escape(str(v))}"/>\n' for kk, v in (obj.get("config") or {}).items())
            for mesh_id, part in stored:
                pname, ext = escape(part["name"]), int(part.get("extruder", 1))
                components.append(f'<component p:path="/3D/Objects/object_{mesh_id}.model" objectid="{mesh_id}" p:UUID="{_uuid(100000 + oid + mesh_id)}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>\n')
                part_xml.append(f'<part id="{mesh_id}" subtype="normal_part">\n<metadata key="name" value="{pname}"/>\n<metadata key="extruder" value="{ext}"/>\n'
                                f'<metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n'
                                f'<mesh_stat edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>\n</part>\n')
            first_ext = int(stored[0][1].get("extruder", 1))
            model.append(f'<object id="{oid}" p:UUID="{_uuid(oid)}" type="model">\n<components>\n' + "".join(components) + '</components>\n</object>\n')
            settings.append(f'<object id="{oid}">\n<metadata key="name" value="{name}"/>\n<metadata key="extruder" value="{first_ext}"/>\n{cfg_meta}'
                            + "".join(part_xml) + '</object>\n')
            a = math.radians(rot)
            c, s = math.cos(a), math.sin(a)
            tf = f"{c:.6f} {s:.6f} 0 {-s:.6f} {c:.6f} 0 0 0 1 {ox + x:.3f} {oy + y:.3f} 0"  # rotate about Z, then translate
            build.append(f'<item objectid="{oid}" p:UUID="{_uuid(200000 + oid)}" transform="{tf}" printable="1"/>\n')
            assemble.append(f'<assemble_item object_id="{oid}" instance_id="0" transform="{tf}" offset="0 0 0"/>\n')
            plate_cfg.append(f'<model_instance>\n<metadata key="object_id" value="{oid}"/>\n<metadata key="instance_id" value="0"/>\n<metadata key="identify_id" value="{100 * oid}"/>\n</model_instance>\n')
        plate_cfg.append("</plate>\n")
    model.append(f'</resources>\n<build p:UUID="{_uuid(99)}">\n' + "".join(build) + "</build>\n</model>\n")
    cfg = ['<?xml version="1.0" encoding="UTF-8"?>\n<config>\n', *settings, *plate_cfg, "<assemble>\n", *assemble, "</assemble>\n</config>\n"]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED, compresslevel=4) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("3D/3dmodel.model", "".join(model))
        z.writestr("3D/_rels/3dmodel.model.rels", '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' + "\n".join(rels) + "\n</Relationships>")
        for sub, xml in files.items():
            z.writestr(sub, xml)
        z.writestr("Metadata/model_settings.config", "".join(cfg))
        if project:  # full printer/process/filament config -> the slicer opens it as a project with these presets
            z.writestr("Metadata/project_settings.config", json.dumps(project, indent=4, ensure_ascii=False))


if __name__ == "__main__":  # self-check: a unit cube round-trips through the writer
    cube = np.array([
        [[0, 0, 0], [1, 1, 0], [1, 0, 0]], [[0, 0, 0], [0, 1, 0], [1, 1, 0]],
        [[0, 0, 1], [1, 0, 1], [1, 1, 1]], [[0, 0, 1], [1, 1, 1], [0, 1, 1]],
        [[0, 0, 0], [1, 0, 0], [1, 0, 1]], [[0, 0, 0], [1, 0, 1], [0, 0, 1]],
        [[0, 1, 0], [1, 1, 1], [1, 1, 0]], [[0, 1, 0], [0, 1, 1], [1, 1, 1]],
        [[0, 0, 0], [0, 0, 1], [0, 1, 1]], [[0, 0, 0], [0, 1, 1], [0, 1, 0]],
        [[1, 0, 0], [1, 1, 1], [1, 0, 1]], [[1, 0, 0], [1, 1, 0], [1, 1, 1]],
    ], dtype=float)
    assert abs(mesh_volume(cube) - 1.0) < 1e-9
    for deg in (0, 10, 30, 45, 60):
        rot = rotate_z(cube * 100, deg)
        fixed = rotate_z(rot, best_xy_angle(rot.reshape(-1, 3))).reshape(-1, 3)
        assert np.allclose(fixed.max(0) - fixed.min(0), 100, atol=0.05), (deg, fixed.max(0) - fixed.min(0))
    import tempfile
    p = os.path.join(tempfile.gettempdir(), "vault_selfcheck.3mf")
    write_3mf(p, [{"name": "cube", "mesh": cube, "extruder": 2, "config": {"wall_loops": "4"}}],
              [{"name": "p1", "items": [(0, 0, 0, 0), (0, 5, 0, 90)]}, {"name": "p2", "items": [(0, 10, 10, 0)]}, {"name": "p3", "items": [(0, 1, 1, 0)]}], (330, 320), "test")
    with zipfile.ZipFile(p) as z:
        names = set(z.namelist())
        assert {"3D/3dmodel.model", "3D/_rels/3dmodel.model.rels", "3D/Objects/object_1.model", "Metadata/model_settings.config", "[Content_Types].xml", "_rels/.rels"} <= names
        xml = z.read("3D/Objects/object_1.model").decode()
        assert xml.count("<vertex ") == 8 and xml.count("<triangle ") == 12
        main = z.read("3D/3dmodel.model").decode()
        assert main.count("<item ") == 4 and main.count("<components>") == 4 and main.count('p:path="/3D/Objects/object_1.model"') == 4  # one named object per piece, one mesh
        assert "406.000 10.000 0" in main and "1.000 -383.000 0" in main  # plate 2 at x+396, plate 3 at y-384
        cfg = z.read("Metadata/model_settings.config").decode()
        assert cfg.count("<model_instance>") == 4 and cfg.count("<plate>") == 3 and cfg.count('key="name" value="cube"') == 8 and 'extruder" value="2"' in cfg
        assert '<metadata key="wall_loops" value="4"/>' in cfg
    assert plate_origin(0, 2, (260, 260)) == (0, 0) and plate_origin(1, 2, (260, 260)) == (312, 0)
    assert printable_size({"printable_area": ["0x0", "330x0", "330x320", "0x320"]}, (325, 320)) == (330, 320)  # H2C: plates stride by 330, parts pack in 325
    assert printable_size({}, (325, 320)) == (325, 320)
    # the plate verifier: a cube well inside plate 1 passes; the same cube pushed 30 mm past plate 2's edge is caught
    proj = {"printable_area": ["0x0", "330x0", "330x320", "0x320"]}
    write_3mf(p, [{"name": "cube", "mesh": cube * 50}], [{"name": "p1", "items": [(0, 10, 10, 0)]}, {"name": "p2", "items": [(0, 310, 10, 0)]}], (330, 320), "t", proj)
    bad = verify_3mf(p)
    assert [(b["plate"], b["overhang_mm"]) for b in bad] == [(2, 30.0)], bad
    write_3mf(p, [{"name": "cube", "mesh": cube * 50}], [{"name": "p1", "items": [(0, 10, 10, 0)]}, {"name": "p2", "items": [(0, 270, 260, 90)]}], (330, 320), "t", proj)
    assert verify_3mf(p) == [], verify_3mf(p)  # rotated 90 deg about its corner, still inside
    print("mesh.py self-check ok")
