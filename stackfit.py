"""Which design choices fit a printer. Not the slicer handoff.

Legal values live on `catalog`. This module repairs a stack with `normalize` and, when the
fit control is on, attaches a verdict to each of those values. The page only supplies labels.
"""
import copy
import json

import catalog
import plates


def judged_printers(settings, fit_target):
    """The printer the fit control is about.

    A specific id judges that nozzle only. ``every`` (and the old ``all`` value) means a choice
    must fit each enabled printer, not merely one of them.
    """
    enabled = [p for p in settings.get("printers") or [] if p.get("enabled", True)]
    if fit_target and fit_target not in ("every", "all"):
        chosen = [p for p in enabled if p["id"] == fit_target]
        return (chosen or enabled[:1]), "one"
    return enabled, "every"


def normalize(stack):
    """Repair layout, XL height, an unknown height, and facades. The page draws this stack."""
    layers = stack.get("layers") or []
    if not layers:
        return stack
    base = catalog.LAYOUT_FAMILY[layers[0]["layout"]]
    for i, layer in enumerate(layers):
        allowed = catalog.layouts_for(i == 0, base)
        if layer.get("layout") not in allowed:
            layer["layout"] = allowed[0]
        heights = catalog.heights_for(layer["layout"])
        height = int(layer.get("height") or heights[0])
        if height not in heights:
            height = heights[0]
            layer["height"] = height
        patterns = catalog.PATTERNS[height]
        fams = catalog.LAYOUTS[layer["layout"]]
        facades = layer.get("facades") or []
        fixed = []
        for bay in range(len(fams)):
            current = facades[bay] if bay < len(facades) else None
            fixed.append(list(current) if current in patterns else list(patterns[0]))
        layer["facades"] = fixed
    return stack


def _reason(line, size, printer, edge):
    width, depth, height = size
    limit = min(printer["z"], printer.get("maxH") or printer["z"])
    if height > limit:
        return (f'{line["qty"]}× {line["name"]} is {height:.1f} mm tall, over {printer["name"]}’s {limit:.0f} mm limit')
    bed = printer["bed"]
    kept = f" minus {edge:g} mm edge" if edge else ""
    return (f'{line["qty"]}× {line["name"]} is {width:.1f}×{depth:.1f}×{height:.1f} mm and does not fit '
            f'{printer["name"]} ({bed[0]:.0f}×{bed[1]:.0f} mm{kept}) even rotated')


def judge_stack(stack, printers, edge, index, site, stats_fn, fits_whole):
    """Whether every required part of this stack resolves and fits every judged printer.

    Sizes come from ``stats_fn`` (the archive mesh), then ``plates.fits``. A missing file does not fit:
    there is no geometry to print.
    """
    bom = catalog.Bom(index, site or {}, fits_whole).build(stack)
    reasons = []
    for line in bom["parts"]:
        if int(line.get("qty") or 0) <= 0:
            continue
        if not line.get("file"):
            reasons.append(f'{line["group"]}: file not found: {line["name"]}')
            continue
        size = stats_fn(line["file"])["size"]
        for printer in printers:
            if plates.fits(size, printer, edge) is None:
                reasons.append(f'{line["group"]}: {_reason(line, size, printer, edge)}')
                break
    return {"fits": not reasons, "reason": reasons[0] if reasons else "", "reasons": reasons}


def _entry(value, current):
    return {"value": value, "current": value == current}


def choice_frame(stack):
    """The legal values for this stack. No fit verdict. `fit_choices` adds one onto each entry."""
    normalize(stack)
    layers_in = stack.get("layers") or []
    current_depth = int(stack.get("depth") or catalog.DEPTHS[0])
    depth = [_entry(d, current_depth) for d in catalog.DEPTHS]
    current_roof = (stack.get("roof") or {}).get("type") or catalog.ROOFS[0]
    roof = [_entry(name, current_roof) for name in catalog.ROOFS]
    layers = []
    base = catalog.LAYOUT_FAMILY[layers_in[0]["layout"]] if layers_in else "S"
    for i, layer in enumerate(layers_in):
        layouts = [_entry(layout, layer["layout"]) for layout in catalog.layouts_for(i == 0, base)]
        height_now = int(layer["height"])
        heights = [_entry(h, height_now) for h in catalog.heights_for(layer["layout"])]
        types = [_entry(kind, layer.get("type") or "Drawers") for kind in catalog.LAYER_TYPES]
        patterns = catalog.PATTERNS[height_now]
        facades = layer.get("facades") or []
        bays = []
        for bay in range(len(catalog.LAYOUTS[layer["layout"]])):
            current = facades[bay] if bay < len(facades) else patterns[0]
            current_encoded = json.dumps(list(current), separators=(",", ":"))
            bays.append([_entry(json.dumps(pattern, separators=(",", ":")), current_encoded) for pattern in patterns])
        if layer.get("type") == "Sustainers" and catalog.LAYOUT_FAMILY[layer["layout"]] in ("L", "XL"):
            interiors = [_entry(name, layer.get("variant") or "Flat") for name in catalog.SUSTAINER_INTERIORS]
        elif layer.get("type") != "Sustainers":
            interiors = [_entry(name, layer.get("interior") or "none") for name in catalog.DRAWER_INTERIORS]
        else:
            interiors = []
        layers.append({"type": types, "layout": layouts, "height": heights, "facades": bays, "interior": interiors})
    return {"depth": depth, "roof": roof, "layers": layers}


def _stamp(entry, verdict):
    entry["fits"] = verdict["fits"]
    entry["reason"] = "" if verdict["fits"] else verdict["reason"]
    return entry


def fit_choices(stack, printers, edge, index, site, stats_fn, fits_whole):
    """Attach a fit verdict to `choice_frame`. The current value stays even when it does not fit.

    ``printers`` is the selected nozzle, or every enabled printer when the scope says so.
    """
    original = copy.deepcopy(stack)
    frame = choice_frame(original)
    if not printers:
        frame["scope"] = "one"
        return frame
    cache = {}

    def verdict_for(trial):
        normalize(trial)
        key = json.dumps(trial, sort_keys=True, default=str)
        if key not in cache:
            cache[key] = judge_stack(trial, printers, edge, index, site, stats_fn, fits_whole)
        return cache[key]

    def vary(**changes):
        trial = copy.deepcopy(original)
        for name, value in changes.items():
            if name == "depth":
                trial["depth"] = value
            elif name == "roof":
                trial["roof"] = {**(trial.get("roof") or {}), "type": value}
            else:
                index_layer, field, field_value = value
                trial["layers"][index_layer][field] = field_value
        return verdict_for(trial)

    for entry in frame["depth"]:
        _stamp(entry, vary(depth=entry["value"]))
    for entry in frame["roof"]:
        _stamp(entry, vary(roof=entry["value"]))
    for i, layer in enumerate(original.get("layers") or []):
        card = frame["layers"][i]
        for entry in card["layout"]:
            _stamp(entry, vary(layout=(i, "layout", entry["value"])))
        for entry in card["height"]:
            _stamp(entry, vary(height=(i, "height", entry["value"])))
        for entry in card["type"]:
            _stamp(entry, vary(kind=(i, "type", entry["value"])))
        facades = layer.get("facades") or []
        patterns = catalog.PATTERNS[int(layer["height"])]
        for bay, choices in enumerate(card["facades"]):
            for entry in choices:
                trial = copy.deepcopy(original)
                trial["layers"][i]["facades"] = [list(item) for item in facades]
                while len(trial["layers"][i]["facades"]) <= bay:
                    trial["layers"][i]["facades"].append(list(patterns[0]))
                trial["layers"][i]["facades"][bay] = json.loads(entry["value"])
                _stamp(entry, verdict_for(trial))
        field = "variant" if layer.get("type") == "Sustainers" else "interior"
        for entry in card["interior"]:
            _stamp(entry, vary(**{field: (i, field, entry["value"])}))
        current = verdict_for(copy.deepcopy(original))
        prefix = f"L{i + 1} ·"
        card["fits"] = current["fits"]
        card["reasons"] = [reason for reason in current["reasons"] if reason.startswith(prefix)]
    return frame
