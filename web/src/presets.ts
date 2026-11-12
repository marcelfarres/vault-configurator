import type { PresetMap, PresetRow, Printer } from "./types";

export function slicerOf(presets: PresetMap, printer: Printer) {
  return printer.slicer ? presets[printer.slicer] : undefined;
}

export function presetsFor(presets: PresetMap, printer: Printer, kind: "presets" | "filaments" | "machines" = "presets"): PresetRow[] {
  const slicer = slicerOf(presets, printer);
  const rows = slicer?.[kind] || [];
  return rows.filter((row) => {
    const profile = (printer.profile || "").toLowerCase();
    const matchesProfile = !profile || (row.printers || []).some((name) => name.toLowerCase().includes(profile));
    const matchesNozzle = !printer.nozzle || row.nozzle === printer.nozzle || row.nozzle === "";
    if (kind === "machines") return (row.name || "").toLowerCase().includes(profile);
    return matchesProfile && matchesNozzle;
  });
}
