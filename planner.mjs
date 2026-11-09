/** Pure helpers for saved progress, plate keys, theme, and the shop. No DOM, no network. */

export const THEME_STORAGE_KEY = "vault-theme";
export const STORAGE_KEY = "vault-configurator";

/** light | dark | system. Anything else, including a missing value, is System. */
export function normalizeTheme(value) {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

/** Whether the page should use the dark palette. System follows the OS flag passed in. */
export function themeIsDark(preference, prefersDark) {
  const mode = normalizeTheme(preference);
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return !!prefersDark;
}

/** The shop Name field, unchanged. Profiles and slicer preset ids are not display names. */
export function printerLabel(printer) {
  if (!printer || printer.name == null || printer.name === "") return "";
  return String(printer.name);
}

/**
 * Footprint sentence for the All printers dropdown.
 * `fitTarget` is already `every` or one enabled printer id. This does not write state.
 */
export function footprintLine(fitTarget, printer) {
  const name = fitTarget === "every" ? "every enabled printer" : printerLabel(printer) || "the selected printer";
  return `Fits ${name} — change this with the All printers dropdown in the header.`;
}

/** Shelf stock as shown on a Parts role dropdown: nickname, then material. */
export function spoolLabel(filament) {
  const name = filament && filament.name ? String(filament.name) : "Unnamed";
  const material = filament && filament.material ? String(filament.material) : "";
  return material ? `${name} · ${material}` : name;
}

/** Enabled shop printers ticked for this export. A missing forExport counts as ticked. Does not read mode. */
export function exportCandidates(settings) {
  const s = settings || {};
  return (s.printers || []).filter((printer) => printer && printer.enabled !== false && printer.forExport !== false);
}

/**
 * `both`, or one id that is enabled and ticked for export. Anything else becomes `both`.
 * A missing `forExport` counts as ticked. This writes the settings object; it does not read the page.
 */
export function legalExportMode(settings) {
  if (!settings) return "both";
  const live = exportCandidates(settings);
  if (settings.mode !== "both" && !live.some((printer) => printer.id === settings.mode)) settings.mode = "both";
  return settings.mode || "both";
}

/** `every`, or one enabled printer id. `all`, empty, and a missing id become `every`. Writes the state object. */
export function legalFitTarget(state) {
  if (!state) return "every";
  const enabled = ((state.settings && state.settings.printers) || []).filter((printer) => printer && printer.enabled !== false);
  const target = state.fitTarget;
  if (!target || target === "all" || target === "every" || !enabled.some((printer) => printer.id === target)) state.fitTarget = "every";
  return state.fitTarget;
}

/** Export list after mode. A missing forExport counts as ticked. Does not write settings. */
export function printersForExport(settings) {
  const live = exportCandidates(settings);
  const mode = settings && settings.mode;
  if (mode && mode !== "both") return live.filter((printer) => printer.id === mode);
  return live;
}

/** Biggest bed in the export list. Same rule the server uses for the weight estimate. */
export function biggestExportPrinter(settings) {
  const printers = printersForExport(settings);
  if (!printers.length) return null;
  return printers.reduce((best, printer) => {
    const area = (printer.bed?.[0] || 0) * (printer.bed?.[1] || 0);
    const bestArea = (best.bed?.[0] || 0) * (best.bed?.[1] || 0);
    return area > bestArea ? printer : best;
  });
}

/** Fit-control sentence. Uses the shop name, including a name the user typed. */
export function scopeLabel(judged) {
  if (!judged) return "the selected printer";
  if (judged.scope === "every") return "every enabled printer";
  return printerLabel((judged.printers || [])[0]) || "the selected printer";
}

export function plateKey(plate) {
  const items = (plate.items || [])
    .map((item) => `${item.part}@${item.x},${item.y},${item.rot}`)
    .sort()
    .join("|");
  const slots = (plate.slots || []).join(",");
  return `${plate.printer}|${slots}|${items}`;
}

export function reconcileProgress(progress, fingerprint, plates, hardware, assemble) {
  const prev = progress || { layoutKey: "", plates: {}, hardware: {}, assemble: {} };
  let note = "";
  let plateDone = { ...(prev.plates || {}) };
  if (plates) {
    if (prev.layoutKey && prev.layoutKey !== fingerprint) {
      plateDone = {};
      note = "Plate checks cleared because the layout changed.";
    }
    const alive = new Set(plates.map(plateKey));
    plateDone = Object.fromEntries(Object.entries(plateDone).filter(([key, done]) => done && alive.has(key)));
  }
  const hardwareDone = {};
  for (const row of hardware || []) {
    const old = (prev.hardware || {})[row.item];
    const sameQty = !!old && Number(old.qty) === Number(row.qty);
    hardwareDone[row.item] = { qty: Number(row.qty), done: sameQty && !!old.done };
  }
  let assembleDone = { ...(prev.assemble || {}) };
  if (assemble) {
    assembleDone = {};
    for (const row of assemble) {
      const old = (prev.assemble || {})[row.key];
      const sameQty = !!old && Number(old.qty) === Number(row.qty);
      assembleDone[row.key] = { qty: Number(row.qty), done: sameQty && !!old.done };
    }
  }
  return {
    progress: {
      ...prev,
      layoutKey: plates ? (fingerprint || "") : (prev.layoutKey || ""),
      plates: plateDone,
      hardware: hardwareDone,
      assemble: assembleDone,
    },
    note,
  };
}

/** missing | fits | unfit. A part fits the judged set only when every id fits. */
export function partFitsScope(part, ids) {
  if (!part || !part.file) return "missing";
  if (!ids || !ids.length || !part.fits) return "unknown";
  return ids.every((id) => part.fits[id]) ? "fits" : "unfit";
}

/** BOM lines that need a file the archive does not have. They cannot be planned or exported. */
export function missingFileLines(parts) {
  return (parts || []).filter((part) => part && !part.file && Number(part.qty || 0) > 0);
}

/**
 * Layer warning text. A fit matrix owns the sentence, including when `reasons` is empty.
 * Without a matrix, the page falls back to part fit.
 */
export function layerNotes(layerEntry, parts, ids, layerNumber) {
  if (layerEntry && Array.isArray(layerEntry.reasons)) return layerEntry.reasons.slice();
  const prefix = `L${layerNumber} ·`;
  const notes = [];
  for (const part of parts || []) {
    if (!String(part.group || "").startsWith(prefix)) continue;
    const fit = partFitsScope(part, ids);
    if (fit === "missing") notes.push(`File not found: ${part.name}`);
    else if (fit === "unfit") notes.push(`${part.qty}× ${part.name} does not fit`);
  }
  return notes;
}

/** Shelf rows shipped before nicknames. A saved row is still one of these only when every field matches. */
export const LEGACY_FILAMENTS = [
  { name: "light grey", color: "#9da3a8", material: "PETG" },
  { name: "dark grey", color: "#4a4d50", material: "PETG" },
  { name: "black", color: "#222426", material: "PETG" },
  { name: "orange", color: "#ff7a1a", material: "PETG" },
  { name: "black (soft)", color: "#1a1a1a", material: "TPU" },
];

/** Inventory that was named as a colour role, or an old brand default. Exact name only. */
export const LEGACY_ROLE_NAMES = [
  "Elegoo",
  "PETG accent",
  "TPU tyres",
  "Body",
  "Drawer interior",
  "Knobs & handles",
  "Knobs",
  "Accent",
  "TPU",
];

/** Display names the sample fleet used before the Name field was the label. */
export const LEGACY_PRINTER_NAMES = {
  u1: "Snapmaker U1",
  p1s: "Bambu Lab P1S",
  "h2d-left": "Bambu Lab H2D · left nozzle",
  "h2d-right": "Bambu Lab H2D · right nozzle",
};

function sameShelf(row, legacy) {
  return !!row && !!legacy
    && row.name === legacy.name
    && String(row.color || "").toLowerCase() === legacy.color
    && row.material === legacy.material;
}

/**
 * Replace a saved shop row with the current default, in one assignment, when that row is still a default.
 * A hand-edited name, colour, or material stays. Missing `forExport` is left missing.
 * A row carrying a stable id was saved by current code, so its fields are the user's — never
 * replace it, even when its name happens to match a legacy role name.
 */
export function migrateShop(settings, defaults) {
  if (!settings || !defaults) return settings;
  const nextFilaments = Array.isArray(defaults.filaments) ? defaults.filaments : [];
  if (Array.isArray(settings.filaments)) {
    settings.filaments = settings.filaments.map((row, index) => {
      const fresh = nextFilaments[index];
      const legacy = LEGACY_FILAMENTS[index];
      const stillDefault = sameShelf(row, legacy) || LEGACY_ROLE_NAMES.includes(row && row.name);
      if (!fresh || !stillDefault || (row && row.id)) return row;
      return { ...JSON.parse(JSON.stringify(fresh)), preset: (row && row.preset) || {} };
    });
  }
  const nextPrinters = Array.isArray(defaults.printers) ? defaults.printers : [];
  if (Array.isArray(settings.printers)) {
    settings.printers = settings.printers.map((row) => {
      const fresh = nextPrinters.find((printer) => printer.id === row.id);
      const legacyName = LEGACY_PRINTER_NAMES[row.id];
      if (!fresh || !legacyName || row.name !== legacyName) return row;
      return { ...row, name: fresh.name };
    });
  }
  return settings;
}

function filamentSlug(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Give every filament a stable id and point colour roles at ids, not shelf positions.
 * A numeric saved role is converted once, to the spool it pointed at. Reordering or
 * removing shelf stock afterwards cannot retarget a role.
 */
export function ensureFilamentIds(settings, extraReserved) {
  if (!settings || !Array.isArray(settings.filaments)) return settings;
  // Reserve every id already present up front: repairing an earlier missing/duplicate id
  // must never steal a later spool's valid id (the first owner of a duplicate keeps it).
  // Callers may reserve more ids (a spool whose removal can still be undone) so a freshly
  // minted spool cannot take an id that Undo is about to restore.
  const reserved = new Set(settings.filaments.map((filament) => filament.id).filter((id) => typeof id === "string" && id));
  (extraReserved || []).forEach((id) => { if (typeof id === "string" && id) reserved.add(id); });
  const used = new Set();
  settings.filaments.forEach((filament) => {
    let id = typeof filament.id === "string" && filament.id ? filament.id : "";
    if (!id || used.has(id)) {
      const base = filamentSlug(filament.name) || "filament";
      let n = 2;
      id = base;
      while (used.has(id) || reserved.has(id)) id = `${base}-${n++}`;
      filament.id = id;
    }
    used.add(filament.id);
  });
  if (!settings.roles || typeof settings.roles !== "object") settings.roles = {};
  Object.keys(settings.roles).forEach((role) => {
    const value = settings.roles[role];
    if (typeof value === "number") {
      const hit = settings.filaments[value];
      settings.roles[role] = hit ? hit.id : (settings.filaments[0]?.id ?? "");
    } else if (typeof value !== "string" || !settings.filaments.some((filament) => filament.id === value)) {
      settings.roles[role] = settings.filaments[0]?.id ?? "";
    }
  });
  return settings;
}

/** The spool a colour role points at. Falls back to the first spool, as the index-based code did. */
export function filamentForRole(settings, role) {
  const filaments = (settings && settings.filaments) || [];
  const value = settings && settings.roles ? settings.roles[role] : undefined;
  if (typeof value === "string") {
    const hit = filaments.find((filament) => filament.id === value);
    if (hit) return hit;
  }
  if (typeof value === "number" && filaments[value]) return filaments[value];
  return filaments[0];
}

/** Shelf position of a role's spool. This is the slicer slot/extruder index the server expects. */
export function slotIndexForRole(settings, role) {
  const index = ((settings && settings.filaments) || []).indexOf(filamentForRole(settings, role));
  return index < 0 ? 0 : index;
}

/** Settings as the Python planner expects them: roles as slot indexes. Stored state keeps ids. */
export function settingsForApi(settings) {
  if (!settings) return settings;
  const copy = JSON.parse(JSON.stringify(settings));
  const roles = {};
  Object.keys(copy.roles || {}).forEach((role) => { roles[role] = slotIndexForRole(copy, role); });
  copy.roles = roles;
  return copy;
}

/** Remove a spool by id. Roles that used it fall back to the first remaining spool and are reported. */
export function removeFilamentById(settings, id) {
  const filaments = (settings && settings.filaments) || [];
  if (filaments.length < 2) return null;
  const index = filaments.findIndex((filament) => filament.id === id);
  if (index < 0) return null;
  const [filament] = filaments.splice(index, 1);
  const fallback = filaments[0]?.id ?? "";
  const affectedRoles = [];
  Object.keys(settings.roles || {}).forEach((role) => {
    if (settings.roles[role] === id) {
      settings.roles[role] = fallback;
      affectedRoles.push(role);
    }
  });
  return { filament, index, affectedRoles, fallbackId: fallback };
}

/** Undo a spool removal. A spool that is back already is not duplicated. An affected role is
 * pointed back at the restored spool only while it still sits at the removal fallback — a role
 * the user reassigned since (the UIs also drop it from affectedRoles) is left alone. */
export function restoreFilament(settings, removed) {
  if (!settings || !removed || !removed.filament) return settings;
  if (!Array.isArray(settings.filaments)) settings.filaments = [];
  if (settings.filaments.some((filament) => filament.id === removed.filament.id)) return settings;
  const index = Math.max(0, Math.min(removed.index || 0, settings.filaments.length));
  settings.filaments.splice(index, 0, removed.filament);
  if (!settings.roles || typeof settings.roles !== "object") settings.roles = {};
  (removed.affectedRoles || []).forEach((role) => {
    if (settings.roles[role] === removed.fallbackId) settings.roles[role] = removed.filament.id;
  });
  return settings;
}

/** Parse a settings number field. Empty or non-numeric text is an error, never 0 or NaN. */
export function parseSettingNumber(raw, options = {}) {
  const label = options.label || "Value";
  const text = typeof raw === "string" ? raw.trim() : raw;
  if (text === "" || text == null) return { ok: false, error: `${label} needs a number.` };
  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false, error: `${label} needs a number.` };
  if (options.min != null) {
    if (options.exclusiveMin && value <= options.min) return { ok: false, error: `${label} must be above ${options.min}.` };
    if (!options.exclusiveMin && value < options.min) return { ok: false, error: `${label} must be at least ${options.min}.` };
  }
  if (options.max != null && value > options.max) return { ok: false, error: `${label} must be at most ${options.max}.` };
  return { ok: true, value };
}

/** What a printer is currently used for, spelled out before it is removed (#20). Empty when unused. */
export function printerRemovalNotes(settings, state, plates, printer) {
  if (!printer) return [];
  const notes = [];
  if (printer.enabled !== false) notes.push("enabled");
  if (settings && settings.mode === printer.id) notes.push("the only printer parts are sent to — export will switch to all printers");
  else if (printer.enabled !== false && printer.forExport !== false) notes.push("ticked for export");
  if (state && state.fitTarget === printer.id) notes.push("the fit-check target — fit will switch to every printer");
  const planned = (plates || []).filter((plate) => plate && plate.printer === printer.id).length;
  if (planned) notes.push(`${planned} plate${planned === 1 ? "" : "s"} in the current plan — replanning will be needed`);
  return notes;
}

/**
 * Remove a printer, returning it with its position so the UI can offer undo.
 * Selections that pointed at it (export mode, fit target) are captured so undo can put them back.
 */
export function removePrinterById(settings, id, state) {
  const printers = (settings && settings.printers) || [];
  const index = printers.findIndex((printer) => printer.id === id);
  if (index < 0) return null;
  const [printer] = printers.splice(index, 1);
  const removed = { printer, index };
  if (settings.mode === id) removed.mode = id;
  if (state && state.fitTarget === id) removed.fitTarget = id;
  return removed;
}

/** Undo a printer removal. A printer that is back already is not duplicated, and a selection the
 * user changed since the removal is not overwritten — only one still sitting at the post-removal
 * fallback ("both" / "every") is restored. */
export function restorePrinter(settings, removed, state) {
  if (!settings || !removed || !removed.printer) return settings;
  if (!Array.isArray(settings.printers)) settings.printers = [];
  if (settings.printers.some((printer) => printer.id === removed.printer.id)) return settings;
  const index = Math.max(0, Math.min(removed.index || 0, settings.printers.length));
  settings.printers.splice(index, 0, removed.printer);
  if (removed.mode && settings.mode === "both") settings.mode = removed.mode;
  if (removed.fitTarget && state && state.fitTarget === "every") state.fitTarget = removed.fitTarget;
  return settings;
}

/** The designer's TPU parts (springs, tyres) only work in a flexible filament. */
export function tpuRoleWarning(settings) {
  const filament = filamentForRole(settings, "tpu");
  if (!filament) return "";
  const material = String(filament.material || "").toUpperCase();
  if (material.includes("TPU") || material.includes("TPE")) return "";
  return `TPU parts will print in ${filament.material || "a rigid filament"} — springs and tyres need a flexible filament.`;
}

/** Replace the untouched upstream H2C + Kobra pair with the fleet. A resized or extended list is kept. */
export function migratePrinters(saved, fleet) {
  if (!Array.isArray(saved) || saved.length !== 2 || !Array.isArray(fleet)) return saved;
  const h2c = saved.find((printer) => printer.id === "h2c");
  const kobra = saved.find((printer) => printer.id === "kobrax");
  if (!h2c || !kobra) return saved;
  const bed = (printer, x, y) => printer.bed && printer.bed[0] === x && printer.bed[1] === y;
  if (bed(h2c, 325, 320) && h2c.z === 320 && bed(kobra, 260, 260)) return JSON.parse(JSON.stringify(fleet));
  return saved;
}

/** The parts list always includes every required part. The fit control disables choices; it does not hide rows. */
export function visiblePartRows(parts) {
  return (parts || []).slice();
}

/**
 * When the fit control is on, a choice that does not fit is disabled unless it is the current
 * saved or imported value. That value stays selected and is marked.
 */
export function decorateChoices(entries, filterOn) {
  const items = (entries || []).map((entry) => {
    const current = !!entry.current;
    const fits = !!entry.fits;
    return {
      ...entry,
      current,
      fits,
      disabled: !!(filterOn && !fits && !current),
      mark: current && !fits ? "does not fit" : "",
    };
  });
  const warning = filterOn && items.length > 0 && !items.some((item) => item.fits)
    ? "No choice here fits the selected printer. The current one stays selected."
    : "";
  return { items, warning };
}

export function depthLabel(depth) {
  const n = Number(depth);
  return `${n} · ${(156.1 + (n - 3) * 42).toFixed(1)} mm`;
}

function listed(list, prefer) {
  const found = list.find((value) => String(value) === String(prefer));
  return found !== undefined ? found : list[0];
}

/** Replace a depth or roof that is not in the meta catalog. Called when a stack is loaded. */
export function repairStackCatalog(stack, depths, roofs) {
  if (!stack) return stack;
  const depthList = Array.isArray(depths) ? depths : [];
  const roofList = Array.isArray(roofs) ? roofs : [];
  if (depthList.length && !depthList.some((value) => String(value) === String(stack.depth))) stack.depth = listed(depthList, 5);
  if (!stack.roof || typeof stack.roof !== "object") stack.roof = { type: roofList.length ? listed(roofList, "none") : "none", topHandle: true };
  else if (roofList.length && !roofList.includes(stack.roof.type)) stack.roof.type = listed(roofList, "none");
  return stack;
}

/**
 * Options for one Design select. A non-empty BOM choice list wins; otherwise `catalog` is the meta list.
 * Fit flags mark or disable. They do not drop values.
 */
export function catalogChoicesFor(name, spec) {
  const choices = spec && spec.choices;
  const fromBom = choices && choices[name];
  const catalog = Array.isArray(spec && spec.catalog) ? spec.catalog : [];
  const source = Array.isArray(fromBom) && fromBom.length ? fromBom : catalog.map((value) => ({ value }));
  const current = spec ? spec.current : undefined;
  const entries = source.map((entry) => ({
    ...entry,
    current: String(entry.value) === String(current),
  }));
  const judged = entries.some((entry) => Object.prototype.hasOwnProperty.call(entry, "fits"));
  const decorated = judged && spec && spec.fitOnly ? decorateChoices(entries, true) : null;
  const rows = decorated ? decorated.items : entries;
  return {
    warning: decorated ? decorated.warning : "",
    options: rows.map((entry) => ({
      value: entry.value,
      disabled: !!(decorated && entry.disabled),
      selected: String(entry.value) === String(current),
      mark: (decorated && entry.mark) || "",
      reason: entry.reason || "",
    })),
  };
}

export function checkedCount(progress) {
  const plates = Object.values((progress && progress.plates) || {}).filter(Boolean).length;
  const hardware = Object.values((progress && progress.hardware) || {}).filter((row) => row && row.done).length;
  const assemble = Object.values((progress && progress.assemble) || {}).filter((row) => row && row.done).length;
  return { plates, hardware, assemble };
}

const TABS = ["stack", "parts", "plates", "assemble"];

export function defaultPlannerState(defaults) {
  const state = {
    tab: "stack",
    stack: {
      name: "my-vault",
      depth: 5,
      layers: [],
      roof: { type: "none", topHandle: true },
      mods: { backbone: "none", pegboard: "none" },
    },
    settings: JSON.parse(JSON.stringify(defaults || {})),
    overrides: {},
    tests: {},
    projects: [],
    activeProjectId: "",
    fitOnly: false,
    fitTarget: "every",
    help: true,
    merge: false,
    progress: { layoutKey: "", plates: {}, hardware: {}, assemble: {} },
  };
  legalExportMode(state.settings);
  ensureFilamentIds(state.settings);
  legalFitTarget(state);
  return state;
}

/** Saved browser state, with shop and catalog migrations applied. `raw` may be a JSON string. */
export function loadPlannerState(raw, meta) {
  const defaults = meta && meta.defaults;
  const fresh = () => defaultPlannerState(defaults);
  if (!defaults) return fresh();
  try {
    const saved = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!saved || !saved.stack || !saved.settings) return fresh();
    const blank = JSON.parse(JSON.stringify(defaults));
    saved.settings = { ...blank, ...saved.settings };
    // A short shelf used to mean a pre-5-spool legacy save and was reset to defaults. A shelf whose
    // spools carry stable ids is a current save: the user may have deleted a spool on purpose, and
    // resetting would resurrect it and wipe their role assignments.
    const shelf = saved.settings.filaments;
    const idShelf = Array.isArray(shelf) && shelf.length > 0 && shelf.every((filament) => filament && typeof filament.id === "string" && filament.id);
    if (!idShelf && (!shelf || shelf.length < 5 || !("box" in (saved.settings.roles || {})))) {
      saved.settings.filaments = blank.filaments;
      saved.settings.roles = blank.roles;
    }
    saved.settings.printers = (saved.settings.printers || []).map((printer) => ({
      ...(blank.printers.find((row) => row.id === printer.id) || {}),
      ...printer,
    }));
    if (!saved.settings.spoolman) saved.settings.spoolman = blank.spoolman || "";
    saved.settings.printers.forEach((printer) => {
      // Downstream reads maxH as "or z", so a non-positive saved limit (from ticking
      // "No tall parts" on a printer with z <= 1) means no limit. Write that back
      // before the server's positive-dimension check can reject every request.
      if (printer.maxH != null && !(printer.maxH > 0)) printer.maxH = printer.z;
      if (printer.id === "h2c" && printer.bed && printer.bed[0] === 330) {
        printer.bed = [325, 320];
        printer.z = 320;
        printer.maxH = Math.min(printer.maxH || 320, 320);
      }
    });
    saved.settings.printers = migratePrinters(saved.settings.printers, blank.printers);
    migrateShop(saved.settings, blank);
    saved.settings.filaments.forEach((filament) => {
      filament.preset = filament.preset || {};
      filament.material = filament.material || "PLA";
    });
    saved.settings.presets = saved.settings.presets || {};
    saved.settings.kindRoles = saved.settings.kindRoles || {};
    saved.tests = saved.tests || {};
    saved.tab = TABS.includes(saved.tab) ? saved.tab : "stack";
    if (!["color", "module", "size"].includes(saved.settings.groupBy)) saved.settings.groupBy = "color";
    saved.projects = Array.isArray(saved.projects) ? saved.projects : [];
    saved.activeProjectId = saved.activeProjectId || "";
    saved.fitOnly = !!saved.fitOnly;
    saved.help = saved.help !== false;
    saved.merge = !!saved.merge;
    saved.overrides = saved.overrides || {};
    repairStackCatalog(saved.stack, (meta && meta.depths) || [], (meta && meta.roofs) || []);
    if (!saved.stack.mods) saved.stack.mods = { backbone: "none", pegboard: "none" };
    saved.progress = saved.progress && typeof saved.progress === "object"
      ? saved.progress
      : { layoutKey: "", plates: {}, hardware: {}, assemble: {} };
    saved.progress.plates = saved.progress.plates || {};
    saved.progress.hardware = saved.progress.hardware || {};
    saved.progress.assemble = saved.progress.assemble || {};
    legalExportMode(saved.settings);
    ensureFilamentIds(saved.settings);
    legalFitTarget(saved);
    return saved;
  } catch {
    return fresh();
  }
}
