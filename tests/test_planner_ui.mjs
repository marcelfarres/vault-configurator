import assert from "node:assert/strict";
import { reconcileProgress, plateKey, partFitsScope, layerNotes, migratePrinters, decorateChoices, visiblePartRows, checkedCount, depthLabel, repairStackCatalog, catalogChoicesFor } from "../planner.mjs";

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

console.log("test_planner_ui ok");
