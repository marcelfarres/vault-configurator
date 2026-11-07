export type TabId = "stack" | "parts" | "plates" | "assemble";
export type SettingsSection = "printers" | "filaments" | "appearance";
export type ThemeChoice = "light" | "dark" | "system";

export type Printer = {
  id: string;
  name: string;
  profile?: string;
  bed: [number, number];
  z: number;
  maxH?: number;
  enabled?: boolean;
  forExport?: boolean;
  slicer?: string;
  nozzle?: string;
  nozzleSide?: string;
  nozzleMode?: string;
  preset?: string;
  machine?: string;
  origin?: number[];
};

export type Filament = {
  /** Stable id; colour roles point at this, never at the shelf position. */
  id?: string;
  name: string;
  color: string;
  material: string;
  preset: Record<string, string>;
  spool?: number;
  spoolType?: string;
};

export type Layer = {
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

export type Stack = {
  name: string;
  depth: number;
  layers: Layer[];
  roof: { type: string; topHandle?: boolean };
  mods: Record<string, string | boolean>;
};

export type Settings = {
  estimateFromPreset: boolean;
  spoolman: string;
  printers: Printer[];
  mode: string;
  spacing: number;
  edge: number;
  groupBy: string;
  filaments: Filament[];
  roles: Record<string, string>;
  kindRoles: Record<string, string>;
  wallMm: number;
  infill: number;
  secondsPerGram: number;
  density: number;
  presets: Record<string, { byKind?: Record<string, string>; byPart?: Record<string, string> }>;
};

export type Project = {
  id: string;
  name: string;
  savedAt: string;
  stack: Stack;
  overrides: Record<string, { qty?: number; role?: string }>;
  progress: Progress;
};

export type Progress = {
  layoutKey?: string;
  plates?: Record<string, boolean>;
  hardware?: Record<string, { qty?: number; done?: boolean }>;
  assemble?: Record<string, { qty?: number; done?: boolean }>;
};

export type PlannerState = {
  tab: TabId;
  stack: Stack;
  settings: Settings;
  overrides: Record<string, { qty?: number; role?: string }>;
  tests: Record<string, boolean>;
  projects: Project[];
  activeProjectId: string;
  fitOnly: boolean;
  fitTarget: string;
  help: boolean;
  merge: boolean;
  progress: Progress;
};

export type PartLine = {
  group: string;
  name: string;
  qty: number;
  role: string;
  kind?: string;
  file?: string | null;
  note?: string;
  grams?: number;
  seconds?: number;
  size?: number[];
  fits?: Record<string, boolean>;
  site_grams?: number;
};

export type HardwareLine = { item: string; qty: number; notes?: string };

export type Bom = {
  parts: PartLine[];
  hardware: HardwareLine[];
  warnings: string[];
  choices?: {
    depth?: unknown[];
    roof?: unknown[];
    layers?: Array<{
      type?: unknown[];
      layout?: unknown[];
      height?: unknown[];
      facades?: unknown[][];
      interior?: unknown[];
      reasons?: string[];
    }>;
  } | null;
  optionFits?: { layers?: Array<{ reasons?: string[] }> };
  judged?: { scope: string; printers: Array<{ id: string; name: string }> };
  stack?: Stack;
  estimate?: {
    wallMm?: number;
    infill?: number;
    preset?: string | null;
    printer?: string;
    walls?: number;
    lineWidth?: number;
  };
  filamentPresets?: Record<string, string[]>;
};

export type PlateItem = {
  part: string;
  x?: number;
  y?: number;
  rot?: number;
  slot?: number;
  corners?: number[][];
  nozzle?: string;
  splitX?: number;
};

export type Plate = {
  printer: string;
  name?: string;
  slots?: number[];
  items: PlateItem[];
  bed?: [number, number];
  grams?: number;
  seconds?: number;
  height?: number;
  fill?: number;
  diagonal?: boolean;
  origin?: number[];
};

export type Plan = {
  plates: Plate[];
  unplaceable?: Array<{ name: string; qty?: number; size?: number[]; group?: string; reason?: string }>;
  pieces?: number;
  placed?: number;
  fingerprint?: string;
  label?: string;
  synthetic?: boolean;
};

export type PresetRow = { name: string; user?: boolean; printers?: string[]; nozzle?: string; material?: string; nkeys?: number };
export type SlicerInfo = {
  label: string;
  installed?: boolean;
  uploaded?: boolean;
  presets?: PresetRow[];
  filaments?: PresetRow[];
  machines?: PresetRow[];
};
export type PresetMap = Record<string, SlicerInfo>;

export type Meta = {
  defaults: Settings;
  layouts: Record<string, string[]>;
  allowed: Record<string, string[]>;
  patterns: Record<string, number[][]>;
  width: Record<string, number>;
  depths: number[];
  roofs: string[];
  files: number;
  progress?: { done: number; total: number; msg?: string };
  roles: string[];
  roleLabels: Record<string, string>;
  kinds: string[];
  materials: string[];
  printerCatalog: Array<Omit<Printer, "id" | "bed"> & { bed: number[]; name: string }>;
  families: string[];
  layoutFamily: Record<string, string>;
  layerTypes: string[];
  drawerInteriors: string[];
  sustainerInteriors: string[];
  heights: number[];
  build?: string;
  local?: boolean;
  archiveVia?: string;
  archiveReady?: boolean;
  handoff?: string;
  handoffNote?: string;
};

export type Spool = { id: number; name: string; vendor?: string; material?: string; color: string; remaining_g?: number; label?: string };
export type ExportFile = { file: string; plates?: number; items?: number; warning?: string };
