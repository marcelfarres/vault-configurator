import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reconcileProgress, plateKey, partFitsScope, missingFileLines, layerNotes, migratePrinters, migrateShop, legalExportMode, legalFitTarget, exportCandidates, LEGACY_FILAMENTS, LEGACY_ROLE_NAMES, LEGACY_PRINTER_NAMES, decorateChoices, visiblePartRows, checkedCount, depthLabel, repairStackCatalog, catalogChoicesFor, printerLabel, footprintLine, spoolLabel, normalizeTheme, themeIsDark, THEME_STORAGE_KEY, printersForExport, biggestExportPrinter, scopeLabel, loadPlannerState, defaultPlannerState, ensureFilamentIds, filamentForRole, slotIndexForRole, settingsForApi, removeFilamentById, restoreFilament, parseSettingNumber, printerRemovalNotes, removePrinterById, restorePrinter, tpuRoleWarning } from "../planner.mjs";

const plate = { printer: "u1", slots: [0], items: [{ part: "Guide", x: 1, y: 2, rot: 0 }] };
const key = plateKey(plate);
assert.equal(plateKey({ ...plate, items: [{ part: "Guide", x: 1, y: 3, rot: 0 }] }) !== key, true);

const prev = {
  layoutKey: "aaa",
  plates: { [key]: true, stale: true },
  hardware: { "M4 bolt": { qty: 4, done: true } },
  assemble: { "L1|Box": { qty: 1, done: true } },
};
const same = reconcileProgress(prev, "aaa", [plate], [{ item: "M4 bolt", qty: 4 }]);
assert.equal(same.note, "");
assert.equal(same.progress.plates[key], true);
assert.equal(same.progress.plates.stale, undefined);
assert.equal(same.progress.hardware["M4 bolt"].done, true);
assert.equal(same.progress.assemble["L1|Box"].done, true);

const moved = reconcileProgress(same.progress, "bbb", [plate], [{ item: "M4 bolt", qty: 4 }]);
assert.match(moved.note, /cleared/);
assert.deepEqual(moved.progress.plates, {});
assert.equal(moved.progress.hardware["M4 bolt"].done, true);

const qty = reconcileProgress(moved.progress, "bbb", [plate], [{ item: "M4 bolt", qty: 8 }]);
assert.equal(qty.progress.hardware["M4 bolt"].done, false);
assert.equal(qty.progress.hardware["M4 bolt"].qty, 8);

const asmPrev = reconcileProgress(
  { layoutKey: "aaa", plates: {}, hardware: {}, assemble: { "L1|Box": { qty: 1, done: true } } },
  "aaa",
  null,
  [],
  [{ key: "L1|Box", qty: 2 }],
);
assert.equal(asmPrev.progress.assemble["L1|Box"].done, false);
assert.equal(checkedCount(asmPrev.progress).assemble, 0);
assert.equal(partFitsScope({ file: "a", fits: { u1: true, p1s: false } }, ["u1", "p1s"]), "unfit");
assert.equal(partFitsScope({ file: "a", fits: { u1: true } }, ["u1"]), "fits");
assert.equal(partFitsScope({ file: null }, ["u1"]), "missing");
assert.deepEqual(missingFileLines([{ file: "a", qty: 2 }, { file: "", qty: 3 }, { file: null, qty: 0 }, null]).map((p) => p.qty), [3]);
assert.deepEqual(missingFileLines(null), []);
assert.deepEqual(layerNotes({ reasons: [] }, [{ group: "L1 · S", name: "Box", qty: 1, file: "a", fits: { u1: false } }], ["u1"], 1), []);
assert.deepEqual(layerNotes({ reasons: ["L1 · too wide"] }, [], [], 1), ["L1 · too wide"]);
assert.deepEqual(layerNotes(null, [{ group: "L1 · S", name: "Box", qty: 2, file: "a", fits: { u1: false } }], ["u1"], 1), ["2× Box does not fit"]);

const fleet = [{ id: "u1", bed: [270, 270] }];
const stock = [{ id: "h2c", bed: [325, 320], z: 320 }, { id: "kobrax", bed: [260, 260], z: 260 }];
const migrated = migratePrinters(stock, fleet);
assert.equal(migrated[0].id, "u1");
assert.notEqual(migrated, fleet);
migrated[0].bed[0] = 1;
assert.equal(fleet[0].bed[0], 270);
const resized = [{ id: "h2c", bed: [300, 320], z: 320 }, { id: "kobrax", bed: [260, 260], z: 260 }];
assert.equal(migratePrinters(resized, fleet), resized);

const marked = decorateChoices([
  { value: "S", fits: true, current: false },
  { value: "XL", fits: false, current: true, reason: "418.8 mm does not fit" },
  { value: "L", fits: false, current: false, reason: "too wide" },
], true);
assert.equal(marked.items.find((item) => item.value === "XL").disabled, false);
assert.equal(marked.items.find((item) => item.value === "XL").mark, "does not fit");
assert.equal(marked.items.find((item) => item.value === "L").disabled, true);
assert.equal(marked.items.find((item) => item.value === "S").disabled, false);
const off = decorateChoices([{ value: "XL", fits: false, current: true }], false);
assert.equal(off.items[0].disabled, false);
assert.equal(off.warning, "");
const none = decorateChoices([
  { value: "XL", fits: false, current: true },
  { value: "S", fits: false, current: false },
], true);
assert.match(none.warning, /stays selected/);
const parts = [{ name: "XL7 Module 1F", fits: false }, { name: "Runner Stopper", fits: true }];
assert.deepEqual(visiblePartRows(parts).map((part) => part.name), ["XL7 Module 1F", "Runner Stopper"]);

const depths = [3, 4, 5, 6, 7];
const roofs = ["none", "grid", "table", "bowl", "undertable", "heavyweight"];
assert.deepEqual(depths.map(depthLabel), [
  "3 · 156.1 mm",
  "4 · 198.1 mm",
  "5 · 240.1 mm",
  "6 · 282.1 mm",
  "7 · 324.1 mm",
]);

const saved = { depth: 0, layers: [], roof: { type: "", topHandle: false } };
repairStackCatalog(saved, depths, roofs);
assert.equal(saved.depth, 5);
assert.equal(saved.roof.type, "none");
assert.equal(saved.roof.topHandle, false);
const keptDepth = { depth: 7, roof: { type: "grid" } };
repairStackCatalog(keptDepth, depths, roofs);
assert.equal(keptDepth.depth, 7);
assert.equal(keptDepth.roof.type, "grid");
const narrow = { depth: 9, roof: { type: "attic" } };
repairStackCatalog(narrow, [4, 6], ["bowl"]);
assert.equal(narrow.depth, 4);
assert.equal(narrow.roof.type, "bowl");
const bare = { depth: "4" };
repairStackCatalog(bare, depths, roofs);
assert.equal(bare.depth, "4");
assert.equal(bare.roof.type, "none");

const fresh = catalogChoicesFor("depth", { choices: null, catalog: depths, fitOnly: false, current: 5 });
assert.deepEqual(fresh.options.map((option) => option.value), depths);
assert.equal(fresh.options.find((option) => option.value === 5).selected, true);
assert.ok(fresh.options.every((option) => !option.disabled && option.mark === ""));

const cleared = catalogChoicesFor("depth", { choices: { depth: [] }, catalog: depths, fitOnly: true, current: 7 });
assert.deepEqual(cleared.options.map((option) => option.value), depths);
assert.equal(cleared.options.find((option) => option.value === 7).selected, true);
assert.ok(cleared.options.every((option) => !option.disabled && option.mark === ""));

const judged = depths.map((value) => ({
  value,
  fits: value <= 5,
  reason: value > 5 ? `${value} does not fit` : "",
}));
const fromBom = catalogChoicesFor("depth", { choices: { depth: judged }, catalog: depths, fitOnly: true, current: 7 });
assert.deepEqual(fromBom.options.map((option) => option.value), depths);
assert.equal(fromBom.options.find((option) => option.value === 7).disabled, false);
assert.equal(fromBom.options.find((option) => option.value === 7).selected, true);
assert.equal(fromBom.options.find((option) => option.value === 7).mark, "does not fit");
assert.equal(fromBom.options.find((option) => option.value === 6).disabled, true);
assert.equal(fromBom.options.find((option) => option.value === 6).mark, "");
assert.equal(fromBom.options.find((option) => option.value === 5).disabled, false);

const unfiltered = catalogChoicesFor("depth", { choices: { depth: judged }, catalog: depths, fitOnly: false, current: 7 });
assert.deepEqual(unfiltered.options.map((option) => option.value), depths);
assert.ok(unfiltered.options.every((option) => !option.disabled && option.mark === ""));
assert.equal(unfiltered.options.find((option) => option.value === 7).selected, true);

const partial = [
  { value: 7, fits: false, reason: "too deep" },
  { value: 3, fits: true },
];
const keptOff = catalogChoicesFor("depth", { choices: { depth: partial }, catalog: depths, fitOnly: false, current: 7 });
assert.deepEqual(keptOff.options.map((option) => option.value), [7, 3]);
assert.ok(keptOff.options.every((option) => !option.disabled && option.mark === ""));
const keptOn = catalogChoicesFor("depth", { choices: { depth: partial }, catalog: depths, fitOnly: true, current: 3 });
assert.deepEqual(keptOn.options.map((option) => option.value), [7, 3]);
assert.equal(keptOn.options[0].disabled, true);
assert.equal(keptOn.options[1].disabled, false);
assert.equal(keptOn.options[1].selected, true);

const roof = catalogChoicesFor("roof", { choices: null, catalog: roofs, fitOnly: true, current: "none" });
assert.deepEqual(roof.options.map((option) => option.value), roofs);
assert.equal(roof.options.find((option) => option.value === "none").selected, true);
assert.ok(roof.options.every((option) => !option.disabled));

assert.equal(printerLabel({ name: "U1", profile: "Snapmaker U1" }), "U1");
assert.equal(printerLabel({ name: "Snapmaker U1", profile: "Snapmaker U1" }), "Snapmaker U1");
assert.equal(printerLabel({ name: "Bambu Lab H2D · left nozzle" }), "Bambu Lab H2D · left nozzle");
assert.equal(printerLabel({ profile: "Snapmaker U1" }), "");
assert.equal(footprintLine("every", { name: "U1" }), "Fits every enabled printer — change this with the All printers dropdown in the header.");
assert.equal(footprintLine("u1", { name: "U1", profile: "Snapmaker U1" }), "Fits U1 — change this with the All printers dropdown in the header.");
assert.equal(footprintLine("u1", { profile: "Snapmaker U1" }), "Fits the selected printer — change this with the All printers dropdown in the header.");
assert.equal(spoolLabel({ name: "Charcoal", material: "PLA" }), "Charcoal · PLA");
assert.equal(spoolLabel({ name: "Silver Grey", material: "TPU" }), "Silver Grey · TPU");
assert.equal(spoolLabel({ name: "Cream", material: "" }), "Cream");
assert.equal(THEME_STORAGE_KEY, "vault-theme");
assert.equal(normalizeTheme(null), "system");
assert.equal(normalizeTheme("nope"), "system");
assert.equal(normalizeTheme("light"), "light");
assert.equal(themeIsDark("dark", false), true);
assert.equal(themeIsDark("light", true), false);
assert.equal(themeIsDark("system", true), true);
assert.equal(themeIsDark("system", false), false);
assert.equal(themeIsDark(undefined, true), true);

assert.deepEqual(LEGACY_FILAMENTS.map((row) => row.name), ["light grey", "dark grey", "black", "orange", "black (soft)"]);
assert.deepEqual(LEGACY_FILAMENTS.map((row) => row.color), ["#9da3a8", "#4a4d50", "#222426", "#ff7a1a", "#1a1a1a"]);
assert.deepEqual(LEGACY_ROLE_NAMES, ["Elegoo", "PETG accent", "TPU tyres", "Body", "Drawer interior", "Knobs & handles", "Knobs", "Accent", "TPU"]);
assert.deepEqual(LEGACY_PRINTER_NAMES, {
  u1: "Snapmaker U1",
  p1s: "Bambu Lab P1S",
  "h2d-left": "Bambu Lab H2D · left nozzle",
  "h2d-right": "Bambu Lab H2D · right nozzle",
});

const shopDefaults = {
  filaments: [
    { name: "Charcoal", color: "#2a2b2e", material: "PLA", preset: {} },
    { name: "Cream", color: "#ece6d9", material: "PLA", preset: {} },
    { name: "Gold", color: "#c8a256", material: "PLA", preset: {} },
    { name: "Army Blue", color: "#3b4f6b", material: "PLA", preset: {} },
    { name: "Silver Grey", color: "#a9adb3", material: "TPU", preset: {} },
  ],
  printers: [
    { id: "u1", name: "U1" },
    { id: "p1s", name: "P1S" },
  ],
};
const savedShop = {
  filaments: [
    { name: "light grey", color: "#9da3a8", material: "PETG", preset: { u1: "keep" } },
    { name: "Cream already", color: "#ffffff", material: "PLA" },
    { name: "Body", color: "#111111", material: "PETG" },
    { name: "orange", color: "#ff7a1a", material: "ASA" },
    { name: "black (soft)", color: "#1a1a1a", material: "TPU" },
  ],
  printers: [
    { id: "u1", name: "Snapmaker U1", bed: [270, 270] },
    { id: "p1s", name: "Shop P1S", bed: [256, 256] },
  ],
};
migrateShop(savedShop, shopDefaults);
assert.equal(savedShop.filaments[0].name, "Charcoal");
assert.equal(savedShop.filaments[0].color, "#2a2b2e");
assert.equal(savedShop.filaments[0].material, "PLA");
assert.deepEqual(savedShop.filaments[0].preset, { u1: "keep" });
assert.equal(savedShop.filaments[1].name, "Cream already");
assert.equal(savedShop.filaments[2].name, "Gold");
assert.equal(savedShop.filaments[2].color, "#c8a256");
assert.equal(savedShop.filaments[2].material, "PLA");
assert.equal(savedShop.filaments[3].name, "orange");
assert.equal(savedShop.filaments[3].material, "ASA");
assert.equal(savedShop.filaments[4].name, "Silver Grey");
assert.equal(savedShop.printers[0].name, "U1");
assert.deepEqual(savedShop.printers[0].bed, [270, 270]);
assert.equal(savedShop.printers[0].forExport, undefined);
assert.equal(savedShop.printers[1].name, "Shop P1S");
assert.equal(shopDefaults.filaments[0].name, "Charcoal");

const aimed = {
  mode: "p1s",
  printers: [
    { id: "u1", enabled: true, forExport: true },
    { id: "p1s", enabled: false, forExport: true },
  ],
};
assert.equal(legalExportMode(aimed), "both");
assert.equal(aimed.mode, "both");
const tickedOff = {
  mode: "u1",
  printers: [
    { id: "u1", enabled: true, forExport: false },
    { id: "p1s", enabled: true },
  ],
};
assert.equal(legalExportMode(tickedOff), "both");
const kept = {
  mode: "u1",
  printers: [
    { id: "u1", enabled: true },
    { id: "p1s", enabled: true, forExport: false },
  ],
};
assert.equal(legalExportMode(kept), "u1");
assert.equal(legalExportMode({ mode: "both", printers: [] }), "both");
assert.deepEqual(exportCandidates(kept).map((printer) => printer.id), ["u1"]);

const u1 = { id: "u1", name: "U1", bed: [270, 270], enabled: true, forExport: true };
const p1s = { id: "p1s", name: "P1S", bed: [256, 256], enabled: true, forExport: false };
const h2d = { id: "h2d-left", name: "H2D left", bed: [325, 320], enabled: true, forExport: true };
assert.deepEqual(printersForExport({ printers: [u1, p1s, h2d], mode: "both" }).map((p) => p.id), ["u1", "h2d-left"]);
assert.deepEqual(printersForExport({ printers: [u1, h2d], mode: "h2d-left" }).map((p) => p.id), ["h2d-left"]);
assert.deepEqual(printersForExport({ printers: [u1, { ...h2d, forExport: false }], mode: "h2d-left" }), []);
assert.equal(biggestExportPrinter({ printers: [u1, h2d], mode: "both" }).id, "h2d-left");
assert.equal(biggestExportPrinter({ printers: [u1, { ...h2d, forExport: false }], mode: "both" }).id, "u1");
assert.equal(biggestExportPrinter({ printers: [u1], mode: "p1s" }), null);
assert.equal(scopeLabel({ scope: "every", printers: [u1, p1s] }), "every enabled printer");
assert.equal(scopeLabel({ scope: "one", printers: [{ name: "U1", profile: "Snapmaker U1" }] }), "U1");
assert.equal(scopeLabel(null), "the selected printer");

const readerMeta = {
  defaults: {
    ...shopDefaults,
    printers: [{ id: "u1", name: "U1", bed: [270, 270], enabled: true }, { id: "p1s", name: "P1S", bed: [256, 256], enabled: true }],
    spoolman: "",
    groupBy: "color",
    roles: { main: 0, box: 1, knob: 2, accent: 3, tpu: 4 },
    mode: "both",
  },
  depths,
  roofs,
};
const loaded = loadPlannerState(JSON.stringify({
  tab: "shop",
  fitTarget: "all",
  stack: { name: "kept", depth: 0, layers: [], roof: { type: "" } },
  settings: {
    printers: [{ id: "u1", name: "Snapmaker U1", bed: [270, 270], enabled: true }],
    filaments: [
      { name: "light grey", color: "#9da3a8", material: "PETG" },
      { name: "Cream already", color: "#ffffff", material: "PLA" },
      { name: "Body", color: "#111111", material: "PETG" },
      { name: "orange", color: "#ff7a1a", material: "ASA" },
      { color: "#111111" },
    ],
    roles: { main: 0, box: 1, knob: 2, accent: 3, tpu: 4 },
    mode: "retired",
  },
}), readerMeta);
assert.equal(loaded.tab, "stack");
assert.equal(loaded.fitTarget, "every");
assert.equal(loaded.settings.mode, "both");
assert.equal(loaded.settings.filaments[4].material, "PLA");
assert.equal(loaded.settings.printers[0].name, "U1");
assert.equal(loaded.stack.depth, 5);
assert.equal(loaded.stack.name, "kept");

const illegalAim = loadPlannerState({
  tab: "stack",
  fitTarget: "gone",
  stack: { name: "kept", depth: 5, layers: [], roof: { type: "none", topHandle: true }, mods: {} },
  settings: {
    printers: [
      { id: "u1", name: "U1", enabled: false, forExport: true },
      { id: "p1s", name: "P1S", enabled: true, forExport: false },
    ],
    filaments: shopDefaults.filaments,
    roles: { main: 0, box: 1, knob: 2, accent: 3, tpu: 4 },
    mode: "u1",
  },
}, readerMeta);
assert.equal(illegalAim.settings.mode, "both");
assert.equal(illegalAim.fitTarget, "every");
const blankState = defaultPlannerState({ printers: [], mode: "missing" });
assert.equal(blankState.settings.mode, "both");
assert.equal(blankState.fitTarget, "every");

const classic = readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.match(classic, /function load\(\)\{const raw=localStorage\.getItem\(STORAGE_KEY\);if\(raw&&!localStorage\.getItem\('vault-configurator-backup-v1'\)\)localStorage\.setItem\('vault-configurator-backup-v1',raw\);return loadPlannerState\(raw,META\)\}/);
assert.match(classic, /function defaultState\(\)\{return defaultPlannerState\(META\.defaults\)\}/);
assert.equal(classic.includes("material||'PETG'"), false);
assert.equal(classic.includes("state.fitTarget='every'"), false);
assert.equal(classic.includes("state.fitTarget||'all'"), false);

const styles = readFileSync(new URL("../web/src/styles.css", import.meta.url), "utf8");
const root = cssBlock(styles, ":root");
const dark = cssBlock(styles, "html.dark");
const part = cssBlock(styles, ".bed-part");
const strokeWidth = cssDecl(part, "stroke-width");
assert.match(strokeWidth, /^[0-9.]+px$/);
assert.ok(Number.parseFloat(strokeWidth) >= 2, strokeWidth);
assert.equal(cssDecl(part, "vector-effect"), "non-scaling-stroke");
assert.equal(cssDecl(part, "stroke"), "var(--bed-outline)");

const lightBed = oklchToLinear(cssDecl(root, "--bed"));
const darkBed = oklchToLinear(cssDecl(dark, "--bed"));
const lightEdge = paintedEdge(cssDecl(root, "--bed-outline"), lightBed);
const darkEdge = paintedEdge(cssDecl(dark, "--bed-outline"), darkBed);
const spools = {
  charcoal: hexToLinear("#2a2b2e"),
  cream: hexToLinear("#ece6d9"),
  gold: hexToLinear("#c8a256"),
  navy: hexToLinear("#3b4f6b"),
};
// Dark plate: the edge has to separate charcoal and navy. Cream stays readable from its fill.
assertContrast("dark edge on plate", luminance(darkEdge), luminance(darkBed));
assertContrast("dark edge on charcoal", luminance(darkEdge), luminance(spools.charcoal));
assertContrast("dark edge on navy", luminance(darkEdge), luminance(spools.navy));
assert.ok(contrastRatio(luminance(spools.cream), luminance(darkBed)) >= 4.5, "dark plate moved toward cream");
// Light plate: the edge has to separate cream and gold. Charcoal stays readable from its fill.
assertContrast("light edge on plate", luminance(lightEdge), luminance(lightBed));
assertContrast("light edge on cream", luminance(lightEdge), luminance(spools.cream));
assertContrast("light edge on gold", luminance(lightEdge), luminance(spools.gold));
assertContrast("charcoal on light plate", luminance(spools.charcoal), luminance(lightBed));

console.log("test_planner_ui ok");

function cssBlock(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(escaped + "\\s*\\{([^}]*)\\}"));
  assert.ok(match, selector);
  return match[1];
}

function cssDecl(block, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(escaped + "\\s*:\\s*([^;]+);"));
  assert.ok(match, name);
  return match[1].trim();
}

function assertContrast(label, a, b) {
  const ratio = contrastRatio(a, b);
  assert.ok(ratio >= 3, `${label} contrast ${ratio.toFixed(2)} is below 3`);
}

function contrastRatio(a, b) {
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function luminance(linear) {
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function paintedEdge(value, bed) {
  const parsed = parseOklch(value);
  return parsed.rgb.map((channel, index) => channel * parsed.alpha + bed[index] * (1 - parsed.alpha));
}

function parseOklch(value) {
  const match = value.match(/^oklch\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*([0-9.]+)(%)?)?\s*\)$/);
  assert.ok(match, value);
  const alpha = match[4] == null ? 1 : match[5] ? Number(match[4]) / 100 : Number(match[4]);
  return { rgb: oklchToLinear(value), alpha };
}

function oklchToLinear(value) {
  const match = String(value).match(/^oklch\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/);
  assert.ok(match, value);
  const L = Number(match[1]);
  const C = Number(match[2]);
  const h = Number(match[3]);
  const rad = (h * Math.PI) / 180;
  const a = C * Math.cos(rad);
  const b = C * Math.sin(rad);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s3 = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s3,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s3,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s3,
  ];
}

function hexToLinear(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return [channel(((n >> 16) & 255) / 255), channel(((n >> 8) & 255) / 255), channel((n & 255) / 255)];
}

// Filament ids: roles point at a spool, not at a shelf position (#20).
const idSettings = {
  filaments: [
    { name: "Charcoal", color: "#111111", material: "PLA", preset: {} },
    { name: "Cream", color: "#eeeeee", material: "PLA", preset: {} },
    { name: "Gold", color: "#c8a256", material: "PLA", preset: {} },
  ],
  roles: { main: 2, box: 1 },
};
ensureFilamentIds(idSettings);
assert.equal(idSettings.filaments.every((f) => typeof f.id === "string" && f.id), true);
assert.equal(new Set(idSettings.filaments.map((f) => f.id)).size, 3);
assert.equal(idSettings.roles.main, idSettings.filaments[2].id);
assert.equal(filamentForRole(idSettings, "main").name, "Gold");
assert.equal(slotIndexForRole(idSettings, "main"), 2);
const goldId = idSettings.filaments[2].id;
idSettings.filaments.reverse();
assert.equal(filamentForRole(idSettings, "main").name, "Gold", "reordering the shelf must not retarget a role");
assert.equal(settingsForApi(idSettings).roles.main, 0, "the server still receives the slot index of the same spool");
assert.equal(idSettings.roles.main, goldId, "settingsForApi must not mutate stored roles");
const removed = removeFilamentById(idSettings, goldId);
assert.equal(removed.filament.name, "Gold");
assert.deepEqual(removed.affectedRoles, ["main"]);
assert.equal(filamentForRole(idSettings, "main").name, idSettings.filaments[0].name);
assert.equal(removeFilamentById(idSettings, "missing"), null);
assert.equal(removeFilamentById({ filaments: [{ id: "only", name: "x" }], roles: {} }, "only"), null, "the last filament stays");

// Spool removal is undoable: the spool returns to its shelf slot and roles that fell back
// point at it again, unless the user reassigned them in between (Copilot review, PR #25).
const undoShelf = {
  filaments: [{ id: "charcoal", name: "Charcoal" }, { id: "gold", name: "Gold" }, { id: "cream", name: "Cream" }],
  roles: { main: "gold", box: "cream" },
};
const spoolRemoved = removeFilamentById(undoShelf, "gold");
assert.equal(undoShelf.roles.main, "charcoal", "the role falls back to the first remaining spool");
restoreFilament(undoShelf, spoolRemoved);
assert.deepEqual(undoShelf.filaments.map((f) => f.id), ["charcoal", "gold", "cream"], "undo returns the spool to its shelf position");
assert.equal(undoShelf.roles.main, "gold", "undo points the fallen-back role back at the restored spool");
restoreFilament(undoShelf, spoolRemoved);
assert.equal(undoShelf.filaments.length, 3, "double undo does not duplicate the spool");
const spoolRemovedAgain = removeFilamentById(undoShelf, "gold");
undoShelf.roles.main = "cream";
restoreFilament(undoShelf, spoolRemovedAgain);
assert.equal(undoShelf.roles.main, "cream", "undo does not overwrite a role reassigned after removal");

// Add -> remove -> add: the second add must not reuse the removed spool's id while its
// Undo is still pending, or restoring it would collide and lose the original spool.
const addShelf = {
  filaments: [{ id: "charcoal", name: "Charcoal", color: "#222222", material: "PLA", preset: {} }],
  roles: { main: "charcoal" },
};
addShelf.filaments.push({ name: "New filament", color: "#8a8f96", material: "PLA", preset: {} });
ensureFilamentIds(addShelf);
const addedSpool = addShelf.filaments[1];
assert.equal(addedSpool.id, "new-filament");
addedSpool.name = "Gold";
addedSpool.color = "#d4af37";
addShelf.roles.main = addedSpool.id;
const addedRemoved = removeFilamentById(addShelf, addedSpool.id);
assert.equal(addShelf.roles.main, "charcoal");
addShelf.filaments.push({ name: "New filament", color: "#8a8f96", material: "PLA", preset: {} });
ensureFilamentIds(addShelf, [addedRemoved.filament.id]);
assert.notEqual(addShelf.filaments[1].id, "new-filament", "the second add cannot take the pending undo spool's id");
restoreFilament(addShelf, addedRemoved);
assert.equal(addShelf.filaments.length, 3, "undo still restores the original spool after the second add");
assert.equal(new Set(addShelf.filaments.map((f) => f.id)).size, 3, "ids stay unique");
assert.equal(filamentForRole(addShelf, "main").name, "Gold", "the restored spool keeps its own data and role");
assert.equal(filamentForRole(addShelf, "main").color, "#d4af37");

const migratedIds = loadPlannerState(JSON.stringify({
  stack: { name: "kept", depth: 5, layers: [], roof: { type: "none" }, mods: {} },
  settings: {
    printers: readerMeta.defaults.printers,
    filaments: [
      { name: "A", color: "#111111", material: "PLA" }, { name: "B", color: "#222222", material: "PLA" },
      { name: "C", color: "#333333", material: "PLA" }, { name: "D", color: "#444444", material: "PLA" },
      { name: "E", color: "#555555", material: "TPU" },
    ],
    roles: { main: 4, box: 1, knob: 2, accent: 3, tpu: 4 },
    mode: "both",
  },
}), readerMeta);
assert.equal(filamentForRole(migratedIds.settings, "main").name, "E", "numeric saved roles migrate to the spool they pointed at");
assert.equal(defaultPlannerState(readerMeta.defaults).settings.roles.box, defaultPlannerState(readerMeta.defaults).settings.filaments[1].id);

// A spool deleted on purpose stays deleted on reload; the legacy short-shelf reset must not
// resurrect it or wipe custom roles now that shelves carry stable ids (Copilot review, PR #25).
const shortShelf = loadPlannerState(JSON.stringify({
  stack: { name: "kept", depth: 5, layers: [], roof: { type: "none" }, mods: {} },
  settings: {
    printers: readerMeta.defaults.printers,
    filaments: [
      { id: "gold", name: "Gold", color: "#d4af37", material: "PLA" }, { id: "silver", name: "Silver", color: "#c0c0c0", material: "PLA" },
      { id: "bronze", name: "Bronze", color: "#cd7f32", material: "PLA" }, { id: "copper", name: "Copper", color: "#b87333", material: "TPU" },
    ],
    roles: { main: "gold", box: "silver", knob: "bronze", accent: "bronze", tpu: "copper" },
    mode: "both",
  },
}), readerMeta);
assert.equal(shortShelf.settings.filaments.length, 4, "a deleted spool stays deleted on reload");
assert.equal(filamentForRole(shortShelf.settings, "main").name, "Gold", "custom roles on a short id shelf survive reload");
const legacyShort = loadPlannerState(JSON.stringify({
  stack: { name: "kept", depth: 5, layers: [], roof: { type: "none" }, mods: {} },
  settings: {
    printers: readerMeta.defaults.printers,
    filaments: [
      { name: "A", color: "#111111", material: "PLA" }, { name: "B", color: "#222222", material: "PLA" },
      { name: "C", color: "#333333", material: "PLA" },
    ],
    roles: { main: 2, box: 1, knob: 2, accent: 1, tpu: 2 },
    mode: "both",
  },
}), readerMeta);
assert.equal(legacyShort.settings.filaments.length, readerMeta.defaults.filaments.length, "a short shelf without ids is still a legacy save and resets");

// A no-tall tick on a printer with z <= 1 used to save maxH 0 or negative, which downstream
// reads as "no limit" (maxH or z) but the server's positive check rejects outright. Loading
// such a save writes the limit back to z instead of bricking every request.
const brokenLimitSettings = JSON.parse(JSON.stringify(readerMeta.defaults));
brokenLimitSettings.printers[0].maxH = 0;
if (brokenLimitSettings.printers[1]) brokenLimitSettings.printers[1].maxH = -5;
const brokenLimit = loadPlannerState(JSON.stringify({
  stack: { name: "kept", depth: 5, layers: [], roof: { type: "none" }, mods: {} },
  settings: brokenLimitSettings,
}), readerMeta);
assert.equal(brokenLimit.settings.printers[0].maxH, brokenLimit.settings.printers[0].z, "maxH 0 loads as no limit (z), not a server-rejected 0");
if (brokenLimit.settings.printers[1]) assert.equal(brokenLimit.settings.printers[1].maxH, brokenLimit.settings.printers[1].z, "a negative maxH loads as z too");

// Renaming a spool to a legacy role name must not make reload overwrite it: a row with a
// stable id was saved by current code, so migrateShop leaves it alone. The same row without
// an id is a legacy save and still upgrades to the current default (Copilot review, PR #25).
const renamedRow = { id: "charcoal", name: "TPU", color: "#123456", material: "TPU", preset: {} };
const renamedSettings = { filaments: [renamedRow], printers: [] };
migrateShop(renamedSettings, readerMeta.defaults);
assert.equal(renamedSettings.filaments[0].name, "TPU", "an id-bearing row renamed to a legacy role name keeps its name");
assert.equal(renamedSettings.filaments[0].material, "TPU");
assert.equal(renamedSettings.filaments[0].color, "#123456");
const legacyNamedSettings = { filaments: [{ name: "TPU", color: "#123456", material: "TPU", preset: {} }], printers: [] };
migrateShop(legacyNamedSettings, readerMeta.defaults);
assert.equal(legacyNamedSettings.filaments[0].name, readerMeta.defaults.filaments[0].name, "the same row without an id is still a legacy save and upgrades");

// Number fields never save NaN or a non-positive dimension (#20).
assert.deepEqual(parseSettingNumber("220", { label: "Bed X", min: 0, exclusiveMin: true }), { ok: true, value: 220 });
assert.equal(parseSettingNumber("", { label: "Bed X" }).ok, false, "cleared field is not 0");
assert.match(parseSettingNumber("abc", { label: "Bed X" }).error, /Bed X needs a number/);
assert.match(parseSettingNumber("0", { label: "Bed X", min: 0, exclusiveMin: true }).error, /above 0/);
assert.equal(parseSettingNumber("0", { label: "Part spacing", min: 0 }).ok, true, "zero spacing is legal");
assert.match(parseSettingNumber("-1", { label: "Part spacing", min: 0 }).error, /at least 0/);
assert.match(parseSettingNumber("2", { label: "Infill", min: 0, max: 1 }).error, /at most 1/, "infill is a fraction: 2 is not 200%");
assert.deepEqual(parseSettingNumber("1", { label: "Infill", min: 0, max: 1 }), { ok: true, value: 1 });

// Printer removal is undoable; the TPU role warns on a rigid spool (#20).
const undoFleet = { printers: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }] };
const removedPrinterRow = removePrinterById(undoFleet, "b");
assert.equal(removedPrinterRow.printer.name, "B");
assert.deepEqual(undoFleet.printers.map((p) => p.id), ["a", "c"]);
restorePrinter(undoFleet, removedPrinterRow);
assert.deepEqual(undoFleet.printers.map((p) => p.id), ["a", "b", "c"], "undo restores the printer in place");
restorePrinter(undoFleet, removedPrinterRow);
assert.equal(undoFleet.printers.length, 3, "double undo does not duplicate");
assert.equal(removePrinterById(undoFleet, "missing"), null);

// Removing the printer that export/fit point at explains itself, and undo restores those
// selections unless the user changed them in between (Copilot review, PR #25).
const impactNotes = printerRemovalNotes({ mode: "u1" }, { fitTarget: "u1" }, [{ printer: "u1" }, { printer: "p1" }], { id: "u1", enabled: true, forExport: true }).join(" ");
assert.match(impactNotes, /only printer parts are sent to/);
assert.match(impactNotes, /fit-check target/);
assert.match(impactNotes, /1 plate in the current plan/);
assert.deepEqual(printerRemovalNotes({ mode: "both" }, { fitTarget: "every" }, [], { id: "x", enabled: false, forExport: false }), [], "an unused printer needs no warning");
const selSettings = { printers: [{ id: "u1", name: "U1", enabled: true, forExport: true }, { id: "p1", name: "P1", enabled: true, forExport: true }], mode: "u1" };
const selState = { settings: selSettings, fitTarget: "u1" };
const selRemoved = removePrinterById(selSettings, "u1", selState);
legalExportMode(selSettings); legalFitTarget(selState);
assert.equal(selSettings.mode, "both");
assert.equal(selState.fitTarget, "every");
restorePrinter(selSettings, selRemoved, selState);
assert.equal(selSettings.mode, "u1", "undo restores the export selection, not just the printer");
assert.equal(selState.fitTarget, "u1", "undo restores the fit target, not just the printer");
const selRemovedAgain = removePrinterById(selSettings, "u1", selState);
legalExportMode(selSettings); legalFitTarget(selState);
selSettings.mode = "p1"; selState.fitTarget = "p1";
restorePrinter(selSettings, selRemovedAgain, selState);
assert.equal(selSettings.mode, "p1", "undo does not overwrite an export selection made after removal");
assert.equal(selState.fitTarget, "p1", "undo does not overwrite a fit target made after removal");

const rigidTpu = { filaments: [{ id: "pla", name: "Rigid", material: "PLA" }], roles: { tpu: "pla" } };
assert.match(tpuRoleWarning(rigidTpu), /flexible/);
const flexTpu = { filaments: [{ id: "flex", name: "Flex", material: "TPU 95A" }], roles: { tpu: "flex" } };
assert.equal(tpuRoleWarning(flexTpu), "");
assert.equal(tpuRoleWarning({ filaments: [], roles: {} }), "");

// Repairing a missing/duplicate id must never steal a later spool's valid id (review, PR #25).
const collide = {
  filaments: [
    { id: "a", name: "A", color: "#111111", material: "PLA", preset: {} },
    { id: "a", name: "Cream", color: "#222222", material: "PLA", preset: {} },
    { id: "cream", name: "Custom", color: "#333333", material: "PLA", preset: {} },
  ],
  roles: { box: "cream" },
};
ensureFilamentIds(collide);
assert.equal(collide.filaments[2].id, "cream", "the first owner of a valid id keeps it");
assert.notEqual(collide.filaments[1].id, "cream", "the duplicate gets a fresh id, not a later spool's");
assert.equal(new Set(collide.filaments.map((f) => f.id)).size, 3, "ids stay unique");
assert.equal(filamentForRole(collide, "box").name, "Custom", "an unrelated role keeps its spool");
const idlessFirst = {
  filaments: [
    { name: "Cream", color: "#222222", material: "PLA", preset: {} },
    { id: "cream", name: "Custom", color: "#333333", material: "PLA", preset: {} },
  ],
  roles: { box: "cream" },
};
ensureFilamentIds(idlessFirst);
assert.equal(filamentForRole(idlessFirst, "box").name, "Custom", "an id-less row cannot take the next spool's id either");
assert.match(readFileSync(new URL("../index.html", import.meta.url), "utf8"), /#addFilament'\)\.onclick=[\s\S]{0,200}ensureFilamentIds\(state\.settings,removedFilament\?\[removedFilament\.filament\.id\]:\[\]\)/, "classic mints an id when a filament is added, reserving the pending undo spool's id");
