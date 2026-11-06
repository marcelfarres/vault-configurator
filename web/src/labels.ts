import { catalogChoicesFor, depthLabel } from "../../planner.mjs";
import type { Filament, Settings } from "./types";

export const ROLE_SHORT: Record<string, string> = {
  main: "Body",
  box: "Drawer interior",
  knob: "Knobs",
  accent: "Accent",
  tpu: "TPU",
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
  const index = settings.roles?.[role] ?? 0;
  return settings.filaments?.[index]?.color || "#c9ccd0";
}

export function filamentAt(settings: Settings, role: string): Filament | undefined {
  const index = settings.roles?.[role] ?? 0;
  return settings.filaments?.[index];
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
