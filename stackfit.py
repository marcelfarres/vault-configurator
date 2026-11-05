"""Which design choices fit a printer. Not the slicer handoff.

The page repairs a layer with the same rules before the round trip (`fixLayer`).
Unknown heights become 1 here and there. Choice lists are this catalog; the page
only supplies display labels.
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
    """Same layout/height/facade repair the page applies before it draws a layer."""
    layers = stack.get("layers") or []
    if not layers:
        return stack
    base = catalog.LAYOUT_FAMILY[layers[0]["layout"]]
    for i, layer in enumerate(layers):
        allowed = catalog.ALLOWED_LAYOUTS[base] if i else ["S", "M", "L", "XL"]
        if layer.get("layout") not in allowed:
            layer["layout"] = allowed[0]
        if catalog.LAYOUT_FAMILY[layer["layout"]] == "XL":
            layer["height"] = 1
        height = int(layer.get("height") or 1)
        if height not in catalog.PATTERNS:
            height = 1
            layer["height"] = 1
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


def _option(value, current, verdict):
    return {"value": value, "fits": verdict["fits"], "current": value == current, "reason": "" if verdict["fits"] else verdict["reason"]}


def fit_choices(stack, printers, edge, index, site, stats_fn, fits_whole):
    """Legal choices for the current stack, each judged by the real parts that choice would require.

    The current value is always returned, even when it does not fit, so a saved or imported stack is
    not rewritten. ``printers`` is the selected nozzle, or every enabled printer when the scope says so.
    """
    if not printers:
        return {"depth": [], "roof": [], "layers": [], "scope": "one"}
    original = copy.deepcopy(stack)
    normalize(original)
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

    current_depth = int(original.get("depth") or 3)
    depth = [_option(d, current_depth, vary(depth=d)) for d in (3, 4, 5, 6, 7)]
    current_roof = (original.get("roof") or {}).get("type") or "none"
    roof = [_option(name, current_roof, vary(roof=name)) for name in ("none", "grid", "table", "bowl", "undertable", "heavyweight")]
    layers = []
    base = catalog.LAYOUT_FAMILY[original["layers"][0]["layout"]] if original.get("layers") else "S"
    for i, layer in enumerate(original.get("layers") or []):
        allowed = ["S", "M", "L", "XL"] if i == 0 else list(catalog.ALLOWED_LAYOUTS[base])
        layouts = [_option(layout, layer["layout"], vary(layout=(i, "layout", layout))) for layout in allowed]
        heights = [1] if catalog.LAYOUT_FAMILY[layer["layout"]] == "XL" else [1, 2, 4]
        height = [_option(h, int(layer["height"]), vary(height=(i, "height", h))) for h in heights]
        types = [_option(kind, layer.get("type") or "Drawers", vary(kind=(i, "type", kind))) for kind in ("Drawers", "Sustainers")]
        patterns = catalog.PATTERNS[int(layer["height"])]
        bays = []
        facades = layer.get("facades") or []
        for bay in range(len(catalog.LAYOUTS[layer["layout"]])):
            current = facades[bay] if bay < len(facades) else patterns[0]
            choices = []
            for pattern in patterns:
                trial = copy.deepcopy(original)
                trial["layers"][i]["facades"] = [list(item) for item in facades]
                while len(trial["layers"][i]["facades"]) <= bay:
                    trial["layers"][i]["facades"].append(list(patterns[0]))
                trial["layers"][i]["facades"][bay] = list(pattern)
                encoded = json.dumps(pattern, separators=(",", ":"))
                current_encoded = json.dumps(list(current), separators=(",", ":"))
                choices.append(_option(encoded, current_encoded, verdict_for(trial)))
            bays.append(choices)
        if layer.get("type") == "Sustainers" and catalog.LAYOUT_FAMILY[layer["layout"]] in ("L", "XL"):
            interiors = [_option(name, layer.get("variant") or "Flat", vary(variant=(i, "variant", name))) for name in ("Flat", "Dividers", "Sealed")]
        elif layer.get("type") != "Sustainers":
            interiors = [_option(name, layer.get("interior") or "none", vary(interior=(i, "interior", name)))
                         for name in ("none", "baseplate", "baseplate1h", "baseplate2h", "grid")]
        else:
            interiors = []
        current = verdict_for(copy.deepcopy(original))
        prefix = f"L{i + 1} ·"
        layers.append({"fits": current["fits"], "reasons": [r for r in current["reasons"] if r.startswith(prefix)],
                       "type": types, "layout": layouts, "height": height, "facades": bays, "interior": interiors})
    return {"depth": depth, "roof": roof, "layers": layers}
