import assert from "node:assert/strict";
import { reconcileProgress, plateKey, partFitsScope, migratePrinters, decorateChoices, visiblePartRows, checkedCount } from "../planner.mjs";

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

console.log("test_planner_ui ok");
