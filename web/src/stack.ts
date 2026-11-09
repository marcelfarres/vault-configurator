import { layerNotes } from "../../planner.mjs";
import type { Bom, Layer, Meta, Stack } from "./types";

export function familyOf(meta: Meta, layout: string): string {
  return meta.layoutFamily?.[layout] || layout;
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
