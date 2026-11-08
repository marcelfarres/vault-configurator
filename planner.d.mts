type ExportPrinter = {
  id: string;
  name?: string;
  bed?: number[];
  enabled?: boolean;
  forExport?: boolean;
};

type ExportSettings = {
  printers?: ExportPrinter[];
  mode?: string;
};

type ChoiceSpec = {
  choices?: Record<string, unknown> | null;
  catalog?: unknown[];
  fitOnly?: boolean;
  current?: unknown;
};

type ChoiceResult = {
  warning: string;
  options: Array<{
    value: string | number;
    disabled: boolean;
    selected: boolean;
    mark: string;
    reason: string;
  }>;
};

type ProgressBlob = {
  layoutKey?: string;
  plates?: Record<string, boolean>;
  hardware?: Record<string, { qty?: number; done?: boolean }>;
  assemble?: Record<string, { qty?: number; done?: boolean }>;
};

type PlannerBlob = {
  tab: string;
  stack: StackBlob;
  settings: SettingsBlob;
  overrides: Record<string, { qty?: number; role?: string }>;
  tests: Record<string, boolean>;
  projects: ProjectBlob[];
  activeProjectId: string;
  fitOnly: boolean;
  fitTarget: string;
  help: boolean;
  merge: boolean;
  progress: ProgressBlob;
};

type StackBlob = {
  name: string;
  depth: number;
  layers: LayerBlob[];
  roof: { type: string; topHandle?: boolean };
  mods: Record<string, string | boolean>;
};

type LayerBlob = {
  type: string;
  layout: string;
  height: number;
  facades: number[][];
  interior: string;
  key: string;
  labels: boolean;
  rails: boolean;
  manualSupports: boolean;
  variant: string;
  baseplate: boolean;
  gridW: number;
  gridD: number;
  divW: number;
  divD: number;
  dividers?: boolean;
  gridHeight?: string;
};

type SettingsBlob = {
  estimateFromPreset: boolean;
  spoolman: string;
  printers: PrinterBlob[];
  mode: string;
  spacing: number;
  edge: number;
  groupBy: string;
  filaments: FilamentBlob[];
  roles: Record<string, string>;
  kindRoles: Record<string, string>;
  wallMm: number;
  infill: number;
  secondsPerGram: number;
  density: number;
  presets: Record<string, { byKind?: Record<string, string>; byPart?: Record<string, string> }>;
};

type PrinterBlob = ExportPrinter & {
  name: string;
  profile?: string;
  bed: [number, number];
  z: number;
  maxH?: number;
  slicer?: string;
  nozzle?: string;
  nozzleSide?: string;
  nozzleMode?: string;
  preset?: string;
  machine?: string;
  origin?: number[];
};

type FilamentBlob = {
  id?: string;
  name: string;
  color: string;
  material: string;
  preset: Record<string, string>;
  spool?: number;
  spoolType?: string;
};

type ProjectBlob = {
  id: string;
  name: string;
  savedAt: string;
  stack: StackBlob;
  overrides: Record<string, { qty?: number; role?: string }>;
  progress: ProgressBlob;
};

export const THEME_STORAGE_KEY: string;
  export const STORAGE_KEY: string;
  export function normalizeTheme(value: unknown): "light" | "dark" | "system";
  export function themeIsDark(preference: unknown, prefersDark: boolean): boolean;
  export function printerLabel(printer: { name?: string | null } | null | undefined): string;
  export function footprintLine(fitTarget: string, printer: { name?: string | null } | null | undefined): string;
  export function spoolLabel(filament: { name?: string; material?: string } | null | undefined): string;
  export function exportCandidates(settings: ExportSettings | null | undefined): ExportPrinter[];
  export function legalExportMode(settings: ExportSettings | null | undefined): string;
  export function legalFitTarget(state: { fitTarget?: string; settings?: ExportSettings } | null | undefined): string;
  export function printersForExport(settings: ExportSettings | null | undefined): ExportPrinter[];
  export function biggestExportPrinter(settings: ExportSettings | null | undefined): ExportPrinter | null;
  export function scopeLabel(judged: { scope?: string; printers?: Array<{ name?: string }> } | null | undefined): string;
  export function catalogChoicesFor(name: string, spec: ChoiceSpec): ChoiceResult;
  export function loadPlannerState(raw: string | null, meta: unknown): PlannerBlob;
  export function defaultPlannerState(defaults: unknown): PlannerBlob;
  export function ensureFilamentIds<T extends { filaments?: FilamentBlob[]; roles?: Record<string, unknown> }>(settings: T | null | undefined, extraReserved?: string[]): T;
  export function filamentForRole(settings: { filaments?: FilamentBlob[]; roles?: Record<string, unknown> } | null | undefined, role: string): FilamentBlob | undefined;
  export function slotIndexForRole(settings: { filaments?: FilamentBlob[]; roles?: Record<string, unknown> } | null | undefined, role: string): number;
  export function settingsForApi<T extends { roles?: Record<string, unknown> } | null | undefined>(settings: T): T extends object ? Omit<T, "roles"> & { roles: Record<string, number> } : T;
  export function removeFilamentById(settings: { filaments?: FilamentBlob[]; roles?: Record<string, unknown> } | null | undefined, id: string): { filament: FilamentBlob; index: number; affectedRoles: string[]; fallbackId: string } | null;
  export function restoreFilament<T extends { filaments?: FilamentBlob[]; roles?: Record<string, unknown> }>(settings: T, removed: { filament: FilamentBlob; index: number; affectedRoles?: string[]; fallbackId?: string } | null | undefined): T;
  export function parseSettingNumber(raw: unknown, options?: { label?: string; min?: number; exclusiveMin?: boolean; max?: number }): { ok: true; value: number } | { ok: false; error: string };
  export function printerRemovalNotes(settings: { mode?: string } | null | undefined, state: { fitTarget?: string } | null | undefined, plates: Array<{ printer?: string }> | null | undefined, printer: PrinterBlob | null | undefined): string[];
  export function removePrinterById(settings: { printers?: PrinterBlob[]; mode?: string } | null | undefined, id: string, state?: { fitTarget?: string } | null): { printer: PrinterBlob; index: number; mode?: string; fitTarget?: string } | null;
  export function restorePrinter<T extends { printers?: PrinterBlob[]; mode?: string }>(settings: T, removed: { printer: PrinterBlob; index: number; mode?: string; fitTarget?: string } | null | undefined, state?: { fitTarget?: string } | null): T;
  export function tpuRoleWarning(settings: { filaments?: FilamentBlob[]; roles?: Record<string, unknown> } | null | undefined): string;
  export function reconcileProgress(progress: unknown, fingerprint: string, plates: unknown, hardware: unknown, assemble: unknown): { progress: ProgressBlob; note: string };
  export function plateKey(plate: { printer?: string; slots?: number[]; items?: Array<{ part?: string; x?: number; y?: number; rot?: number }> }): string;
  export function partFitsScope(part: { file?: string | null; fits?: Record<string, boolean> } | null, ids: string[]): "missing" | "fits" | "unfit" | "unknown";
  export function layerNotes(layerEntry: { reasons?: string[] } | null, parts: unknown, ids: string[], layerNumber: number): string[];
  export function depthLabel(depth: number | string): string;
  export function checkedCount(progress: ProgressBlob | null | undefined): { plates: number; hardware: number; assemble: number };
  export function visiblePartRows<T>(parts: T[] | null | undefined): T[];
  export function repairStackCatalog(stack: { depth?: unknown; roof?: { type?: string; topHandle?: boolean } }, depths: unknown[], roofs: string[]): unknown;
