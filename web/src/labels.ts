import { catalogChoicesFor, depthLabel, filamentForRole } from "../../planner.mjs";
import type { ExportState, Filament, Layer, Settings } from "./types";

export const ROLE_SHORT: Record<string, string> = {
  main: "Body",
  box: "Drawer interior",
  knob: "Knobs",
  accent: "Accent details",
  tpu: "Tyres (TPU)",
};

export const ROOF_LABEL: Record<string, string> = {
  none: "None",
  grid: "Grid",
  table: "Flat",
  bowl: "Bowl",
  undertable: "Under-table",
  heavyweight: "Heavyweight",
};

export const LAYOUT_LABEL: Record<string, string> = {
  S: "S",
  M: "M",
  L: "L",
  XL: "XL",
  SS: "L width · two S bays",
  SM: "XL width · S + M bays",
};

export const INTERIOR_LABEL: Record<string, string> = {
  none: "empty",
  baseplate: "Gridfinity baseplate",
  baseplate1h: "baseplate · 1 handle",
  baseplate2h: "baseplate · 2 handles",
  grid: "grid dividers",
  Flat: "flat",
  Dividers: "dividers",
  Sealed: "sealed",
};

export const SHEET_H: Record<number, number> = { 1: 51.5, 2: 99.5, 4: 195.5 };

export const ROOF_MM: Record<string, number> = { none: 0, grid: 15, table: 12, bowl: 22, undertable: 12, heavyweight: 60 };

/** How plates are grouped (Settings.groupBy): the Plates packing select and its collapsed summary read these. */
export const GROUP_BY_LABEL: Record<string, string> = {
  color: "one colour",
  size: "big and small",
  module: "keep a module together",
};

/** The one view of what exported files mean right now: footer line, result
 * headline and tone, and the Plates-tab warning when they are outdated.
 * A new ExportState fails here at compile time, in one place. */
export const EXPORT_STATE_VIEW: Record<ExportState, {
  line: (files: number) => string;
  headline: string;
  tone: "ok" | "warn";
  tabTitle?: string;
}> = {
  none: { line: () => "nothing exported yet", headline: "", tone: "ok" },
  current: {
    line: (files) => `${files} ${files === 1 ? "file" : "files"} exported`,
    headline: "Exported — matches your current stack.",
    tone: "ok",
  },
  stale: {
    line: () => "exported files are for an earlier build",
    headline: "Stack changed since this export — export again before printing.",
    tone: "warn",
    tabTitle: "Exported files are for an earlier build",
  },
  test: {
    line: () => "test plates exported",
    headline: "Test plates exported — not your stack export.",
    tone: "warn",
  },
  "test-stale": {
    line: () => "test plates exported for an earlier selection",
    headline: "Test plates exported for an earlier selection.",
    tone: "warn",
    tabTitle: "Test plates are for an earlier selection",
  },
};

/** "2U · 99.5 mm": the unit count with the designer's sheet height beside it. */
export function heightLabel(height: number | string): string {
  const mm = SHEET_H[Number(height)];
  return mm === undefined ? `${height}U` : `${height}U · ${mm} mm`;
}

/** Overall stack height, as the Preview reports it: sheet heights, 5 mm between layers, roof. */
export function stackHeightMm(layers: Array<{ height: number }>, roof: string | undefined): number {
  return layers.reduce((sum, layer) => sum + (SHEET_H[layer.height] || 0), 0)
    + Math.max(0, layers.length - 1) * 5
    + (ROOF_MM[roof || "none"] || 0);
}

/** One scannable line for a collapsed layer row: boxes, interior, and a non-default lock. */
export function layerSummary(layer: Layer): string {
  const parts: string[] = [];
  if (layer.type === "Sustainers") {
    // Mirror catalog.py: L/XL bodies take the variant, S/M bodies take the
    // dividers flag; the other setting is stored but inactive.
    if (layer.layout === "L" || layer.layout === "XL") parts.push(INTERIOR_LABEL[layer.variant] || "flat");
    else if (layer.dividers) parts.push("dividers");
  } else {
    const boxes = (layer.facades || []).reduce((sum, bay) => sum + bay.length, 0);
    if (boxes > 1) parts.push(`${boxes} boxes`);
    parts.push(layer.interior === "grid" ? `grid ${layer.gridW}×${layer.gridD}` : (INTERIOR_LABEL[layer.interior] || layer.interior));
    if (layer.key === "hidden") parts.push("hidden key");
    else if (layer.key === "none") parts.push("no lock");
  }
  return parts.join(" · ");
}

export type ChoiceOption = {
  value: string | number;
  disabled: boolean;
  selected: boolean;
  mark: string;
  reason: string;
  label: string;
};

export type ChoiceView = { warning: string; options: ChoiceOption[] };

export function labeledChoices(
  name: string,
  spec: { choices?: Record<string, unknown> | null; catalog?: unknown[]; fitOnly?: boolean; current?: unknown },
  labelOf: (value: string | number) => string,
): ChoiceView {
  const view = catalogChoicesFor(name, spec);
  return {
    warning: view.warning,
    options: view.options.map((option) => ({ ...option, label: labelOf(option.value) })),
  };
}

export function depthOptionLabel(depth: string | number): string {
  return `${depth} units · ${depthLabel(depth).split(" · ")[1] || ""}`;
}

export function patternName(value: string | number): string {
  try {
    const parts = JSON.parse(String(value)) as number[];
    return `${parts.join("+")}U`;
  } catch {
    return String(value);
  }
}

export function roleColor(settings: Settings, role: string): string {
  return filamentAt(settings, role)?.color || "#c9ccd0";
}

export function filamentAt(settings: Settings, role: string): Filament | undefined {
  return filamentForRole(settings, role) as Filament | undefined;
}

export function fmtH(sec: number): string {
  const minutes = Math.round(sec / 60);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export function depthMm(depth: number): string {
  return (156.1 + (Number(depth) - 3) * 42).toFixed(1);
}

export function layerTitle(layer: { layout: string; type: string }): string {
  const kind = layer.type === "Sustainers" ? "sustainer" : "drawer";
  return `${layer.layout} ${kind}`;
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
