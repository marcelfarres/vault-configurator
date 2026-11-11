import { defaultPlannerState, layerNotes } from "../../planner.mjs";
import type { Bom, Layer, Meta, PlannerState, Stack } from "./types";

export function familyOf(meta: Meta, layout: string): string {
  return meta.layoutFamily?.[layout] || layout;
}

/** The blank roof/mods a fresh stack ships with, from the one place that defines it. */
function blankFinish(): Pick<Stack, "roof" | "mods"> {
  const { roof, mods } = defaultPlannerState(null).stack as Stack;
  return { roof, mods };
}

/** Start over: clear layers, colour overrides and assembly checks (they name
 * layer instances that no longer exist, and an empty stack never reconciles
 * them away), restore the blank finish. Name and depth stay. */
export function applyStartOver(draft: PlannerState): void {
  const blank = blankFinish();
  draft.stack.layers = [];
  draft.overrides = {};
  if (draft.progress) draft.progress.assemble = {};
  draft.stack.roof = { ...blank.roof };
  draft.stack.mods = { ...blank.mods };
}

/**
 * Whether Start over would discard a chosen finish. Derived from the same
 * blank applyStartOver writes: a key the blank carries is customized when its
 * value differs; any other mod key only when truthy (a stored `base: false`
 * is not a choice). topHandle counts only when explicitly off, matching the
 * checkbox rule (`!== false` means on).
 */
export function finishCustomized(stack: Stack): boolean {
  const blank = blankFinish();
  if ((stack.roof?.type || blank.roof.type) !== blank.roof.type) return true;
  if (stack.roof?.topHandle === false) return true;
  const blankMods = blank.mods as Record<string, unknown>;
  return Object.entries(stack.mods || {}).some(([name, value]) =>
    name in blankMods ? value !== blankMods[name] : !!value);
}

const LAYER_GROUP = /^L(\d+) · /;

/**
 * Records keyed `${group}|${name}` (colour overrides, assembly progress)
 * carry the layer number in the catalog group (`L{index + 1} · …`), so any
 * insertion, removal or reorder must renumber the keys or entries silently
 * land on the wrong layer. `mapIndex` receives a 0-based layer index and
 * returns its new index (or indices, when a duplicate inherits a copy), or
 * an empty array to drop it. Keys with no layer prefix pass through unless
 * `keepUntagged` is false — the Undo capture uses that so restoring can
 * never roll back unrelated entries changed in between.
 */
export function remapLayerKeys<T>(
  record: Record<string, T>,
  mapIndex: (index: number) => number[],
  keepUntagged = true,
): Record<string, T> {
  const next: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    const bar = key.indexOf("|");
    const group = bar >= 0 ? key.slice(0, bar) : key;
    const match = LAYER_GROUP.exec(group);
    if (!match) {
      if (keepUntagged) next[key] = value;
      continue;
    }
    for (const target of mapIndex(Number(match[1]) - 1)) {
      next[`L${target + 1} · ${group.slice(match[0].length)}${bar >= 0 ? key.slice(bar) : ""}`] = value;
    }
  }
  return next;
}

/** The tagged entries belonging to one layer (0-based index), keys unchanged. */
export function layerKeySlice<T>(record: Record<string, T>, index: number): Record<string, T> {
  return remapLayerKeys(record, (i) => (i === index ? [index] : []), false);
}

/** `record` with one layer's tagged entries replaced by `from`'s slice. */
export function replaceLayerKeySlice<T>(record: Record<string, T>, from: Record<string, T>, index: number): Record<string, T> {
  return {
    ...remapLayerKeys(record, (i) => (i === index ? [] : [i]), false),
    ...layerKeySlice(from, index),
  };
}

/** Whether two records hold the same tagged entries for one layer. */
export function sameLayerKeySlice<T>(a: Record<string, T>, b: Record<string, T>, index: number): boolean {
  const canonical = (record: Record<string, T>) => JSON.stringify(
    Object.entries(layerKeySlice(record, index)).sort(([x], [y]) => (x < y ? -1 : 1)),
  );
  return canonical(a) === canonical(b);
}

export function newLayer(stack: Stack, meta: Meta): Layer {
  const base = stack.layers[0] ? familyOf(meta, stack.layers[0].layout) : "";
  const layout = base ? meta.allowed[base]?.[0] || "S" : "S";
  const family = familyOf(meta, layout);
  const height = family === "XL" ? 1 : 2;
  const bays = meta.layouts[layout] || [layout];
  return {
    type: "Drawers",
    layout,
    height,
    facades: bays.map(() => [height]),
    interior: "none",
    key: "key",
    labels: true,
    rails: false,
    manualSupports: false,
    variant: "Flat",
    baseplate: false,
    gridW: 1,
    gridD: 1,
    divW: 1,
    divD: 2,
  };
}

export function layoutCatalog(meta: Meta, stack: Stack, index: number): string[] {
  if (index === 0) return meta.families?.length ? meta.families : ["S", "M", "L", "XL"];
  const base = stack.layers[0] ? familyOf(meta, stack.layers[0].layout) : "S";
  return meta.allowed[base] || ["S"];
}

export function heightCatalog(meta: Meta, layout: string): number[] {
  if (familyOf(meta, layout) === "XL") return [1];
  return meta.heights?.length ? meta.heights : [1, 2, 4];
}

export function facadeCatalog(meta: Meta, height: number): string[] {
  const patterns = meta.patterns?.[String(height)] || [[height]];
  return patterns.map((pattern) => JSON.stringify(pattern));
}

export function layerFitNotes(bom: Bom | null, index: number): string[] {
  const matrix = bom?.optionFits?.layers;
  if (matrix) return layerNotes(matrix[index] || { reasons: [] }, [], [], index + 1);
  const ids = (bom?.judged?.printers || []).map((printer) => printer.id);
  return layerNotes(null, bom?.parts || [], ids, index + 1);
}

/** A fit failure, as opposed to a missing file: footprint or height-limit wording from stackfit. */
export function isMisfitNote(note: string): boolean {
  return note.includes("does not fit") || note.includes("mm tall, over");
}
