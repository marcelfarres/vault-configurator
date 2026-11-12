import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { App } from "./App";
import { applyBomResult, applyPlanProgress, signature } from "./store";
import { remapLayerKeys } from "./stack";
import type { Meta, PlannerState } from "./types";

// jsdom has no WebGL; the dialog lifecycle is what is under test, so stub the three.js surface Viewer touches.
vi.mock("three", () => {
  const vec = () => ({ x: 0, y: 0, z: 0, set() {}, clone() { return vec(); }, sub() { return vec(); }, add() { return vec(); }, copy() { return vec(); }, setFromSpherical() { return vec(); } });
  return {
    WebGLRenderer: class { setSize() {} render() {} dispose() {} },
    Scene: class { add() {} },
    Color: class {},
    PerspectiveCamera: class { up = vec(); position = vec(); aspect = 1; updateProjectionMatrix() {} },
    HemisphereLight: class {},
    DirectionalLight: class { position = vec(); },
    Vector3: class { x = 0; y = 0; z = 0; },
    Spherical: class {},
    Mesh: class { geometry = { dispose() {} }; },
    MeshStandardMaterial: class {},
  };
});
vi.mock("three/addons/controls/OrbitControls.js", () => ({
  OrbitControls: class { enableDamping = false; target = { set() {} }; update() {} dispose() {} },
}));
vi.mock("three/addons/loaders/STLLoader.js", () => ({
  STLLoader: class { loadAsync() { return new Promise(() => undefined); } },
}));

const printers = [
  { id: "u1", name: "U1", profile: "Snapmaker U1", bed: [270, 270] as [number, number], z: 270, maxH: 270, enabled: true, forExport: true, slicer: "orca", nozzle: "0.4", preset: "" },
  { id: "p1s", name: "P1S", profile: "Bambu Lab P1S", bed: [256, 256] as [number, number], z: 256, maxH: 256, enabled: true, forExport: true, slicer: "bambu", nozzle: "0.4", preset: "" },
  { id: "h2d-left", name: "H2D left", profile: "Bambu Lab H2D", bed: [325, 320] as [number, number], z: 320, maxH: 320, enabled: true, forExport: false, slicer: "bambu", nozzle: "0.4", preset: "" },
];

const filaments = [
  { name: "Charcoal", color: "#2a2b2e", material: "PLA", preset: {} },
  { name: "Cream", color: "#ece6d9", material: "PLA", preset: {} },
  { name: "Gold", color: "#c8a256", material: "PLA", preset: {} },
  { name: "Army Blue", color: "#3b4f6b", material: "PLA", preset: {} },
  { name: "Silver Grey", color: "#a9adb3", material: "TPU", preset: {} },
];

const meta = {
  defaults: {
    estimateFromPreset: true,
    spoolman: "",
    printers,
    mode: "both",
    spacing: 6,
    edge: 0,
    groupBy: "color",
    filaments,
    roles: { main: "charcoal", box: "cream", knob: "gold", accent: "army-blue", tpu: "silver-grey" },
    kindRoles: {},
    wallMm: 0.8,
    infill: 0.21,
    secondsPerGram: 90,
    density: 1.27,
    presets: {},
  },
  layouts: { S: ["S"], M: ["M"], L: ["L"], XL: ["XL"], SS: ["S", "S"], SM: ["S", "M"] },
  allowed: { S: ["S"], M: ["M"], L: ["L", "SS"], XL: ["XL", "SM"] },
  patterns: { 1: [[1]], 2: [[2], [1, 1]], 4: [[4], [2, 2]] },
  width: { S: 164.8, M: 254, L: 329.6, XL: 418.8 },
  depths: [3, 4, 5, 6, 7],
  roofs: ["none", "grid", "table", "bowl", "undertable", "heavyweight"],
  files: 0,
  roles: ["main", "box", "knob", "accent", "tpu"],
  roleLabels: {},
  kinds: ["module"],
  materials: ["PLA", "PETG", "TPU"],
  printerCatalog: [],
  families: ["S", "M", "L", "XL"],
  layoutFamily: { S: "S", M: "M", L: "L", XL: "XL", SS: "L", SM: "XL" },
  layerTypes: ["Drawers", "Sustainers"],
  drawerInteriors: ["none", "baseplate", "grid"],
  sustainerInteriors: ["Flat", "Dividers", "Sealed"],
  heights: [1, 2, 4],
  archiveVia: "environment",
  archiveReady: false,
  handoff: "none",
  handoffNote: "Download the 3MF.",
  local: true,
} as Meta;

function json(data: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }));
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/meta")) return json(meta);
    if (url.includes("/api/presets")) return json({});
    if (url.includes("/api/progress")) return json({ done: 0, total: 0 });
    if (url.includes("/api/spoolman")) return json({ spools: [{ id: 7, name: "Galaxy Black", vendor: "Acme", material: "PETG", color: "#101010", remaining_g: 500, label: "Acme Galaxy Black · PETG · 500 g" }] });
    if (url.includes("/api/bom")) {
      const body = JSON.parse(String(init?.body || "{}")) as { stack?: unknown; settings?: { printers?: Array<{ id: string; name: string; enabled?: boolean }> } };
      const judged = (body.settings?.printers || []).filter((printer) => printer.enabled !== false).map((printer) => ({ id: printer.id, name: printer.name }));
      return json({ parts: [], hardware: [], warnings: [], choices: null, stack: body.stack, judged: { scope: "every", printers: judged }, estimate: { wallMm: 0.8, infill: 0.21, preset: null, printer: "P1S" } });
    }
    if (url.includes("/api/plan")) return json({ plan: { plates: [], unplaceable: [], pieces: 0, placed: 0, fingerprint: "abc" } });
    if (url.includes("/api/sample_plan")) return json({ synthetic: true, label: "Synthetic rectangles on a U1 bed. Not VAULT parts.", unplaceable: [], plates: [{ printer: "u1", name: "Charcoal", slots: [0], bed: [270, 270], items: [{ part: "synthetic large", slot: 0, corners: [[8, 8], [120, 8], [120, 70], [8, 70]] }] }] });
    return json({ error: url }, 500);
  }));
});

test("design, settings theme, and export list follow the shop rules", async () => {
  const user = userEvent.setup();
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Compose your stack" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "1 Design" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tab", { name: "4 Assemble" })).toHaveAttribute("data-tab", "assemble");
  expect(screen.queryByRole("tab", { name: /settings/i })).not.toBeInTheDocument();
  expect(screen.queryByText("Manage shop")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
  expect(screen.getByText("Only offer choices that fit")).toBeInTheDocument();
  const enabled = screen.getByRole("group", { name: "Enabled printers" });
  expect(within(enabled).getByText("U1")).toBeInTheDocument();
  expect(within(enabled).getByText("P1S")).toBeInTheDocument();
  expect(within(enabled).getByText("H2D left")).toBeInTheDocument();
  expect(within(enabled).queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "U1" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Snapmaker U1" })).not.toBeInTheDocument();
  expect(screen.getByText("VAULT_ARCHIVE is set, but that folder does not contain 01. DRAWERS.", { exact: false })).toBeInTheDocument();
  expect(screen.getByText(/Unraid/)).toBeInTheDocument();

  const depth = screen.getByLabelText("Depth");
  expect(within(depth).getAllByRole("option")).toHaveLength(5);
  expect(screen.getByLabelText("Roof")).not.toBeDisabled();

  await user.click(screen.getByRole("button", { name: "Add layer" }));
  expect(screen.getByText("Fits every enabled printer — change this with the All printers dropdown in the header.")).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Judge fit against"), "u1");
  expect(screen.getByText("Fits U1 — change this with the All printers dropdown in the header.")).toBeInTheDocument();
  expect(screen.queryByText("Fits every enabled printer — change this with the All printers dropdown in the header.")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Edit S drawer" })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByLabelText("Type")).toBeInTheDocument();
  expect(screen.getByLabelText("Width")).toBeInTheDocument();
  expect(screen.getByLabelText("Height")).toBeInTheDocument();
  expect(screen.getByLabelText("Lock")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "labels" })).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "geared rails" })).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "manual support wall" })).toBeInTheDocument();

  await user.click(screen.getByText("Depth"));
  expect(screen.getByRole("heading", { name: "Depth" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Settings" }));
  expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
  expect(screen.getByLabelText("Name for u1")).toHaveValue("U1");
  expect(screen.getByLabelText("Profile for u1")).toHaveValue("Snapmaker U1");
  await user.click(screen.getByRole("button", { name: "Appearance" }));
  expect(screen.getByText("System follows your OS light/dark setting.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Dark" }));
  expect(document.documentElement).toHaveClass("dark");
  expect(localStorage.getItem("vault-theme")).toBe("dark");
  await user.click(screen.getByRole("button", { name: "Light" }));
  expect(document.documentElement).not.toHaveClass("dark");
  await user.click(screen.getByRole("button", { name: "System" }));
  expect(localStorage.getItem("vault-theme")).toBe("system");
  await user.click(screen.getByRole("button", { name: "Close settings" }));

  await user.click(screen.getByRole("tab", { name: "3 Plates" }));
  const send = screen.getByLabelText("Pack plates for");
  expect([...send.querySelectorAll("option")].map((option) => option.value)).toEqual(["both", "u1", "p1s"]);
  expect(screen.getByRole("button", { name: "Export H2D left" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "Export U1" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("Packing with U1, P1S. Each part is packed once, shared between them to balance print time.")).toBeInTheDocument();
  expect(screen.getByLabelText("Judge fit against").querySelector("option[value='h2d-left']")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Show a sample plate" }));
  expect(await screen.findByRole("heading", { name: "Example plate layout" })).toBeInTheDocument();
  expect(screen.getByText(/1 example plate shown/)).toBeInTheDocument();
  expect(screen.queryByText(/plates marked printed/)).not.toBeInTheDocument();
  expect(screen.queryByText(/1 plate planned/)).not.toBeInTheDocument();
});

test("patch writes a legal export mode and fit target into saved state", async () => {
  const user = userEvent.setup();
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "plates",
    fitTarget: "h2d-left",
    stack: { name: "my-vault", depth: 5, layers: [], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: { ...meta.defaults, mode: "u1" },
  }));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Plates & export" })).toBeInTheDocument();
  expect(screen.getByLabelText("Pack plates for")).toHaveValue("u1");
  expect(screen.getByLabelText("Judge fit against")).toHaveValue("h2d-left");
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(screen.getByRole("checkbox", { name: "Enabled H2D left" }));
  await user.click(screen.getByRole("button", { name: "Close settings" }));
  const afterFit = JSON.parse(localStorage.getItem("vault-configurator") || "{}");
  expect(afterFit.fitTarget).toBe("every");
  expect(afterFit.settings.mode).toBe("u1");
  await user.click(screen.getByRole("button", { name: "Export U1" }));
  const afterExport = JSON.parse(localStorage.getItem("vault-configurator") || "{}");
  expect(afterExport.settings.printers.find((printer: { id: string }) => printer.id === "u1").forExport).toBe(false);
  expect(afterExport.settings.mode).toBe("both");
  expect(screen.getByLabelText("Pack plates for")).toHaveValue("both");
  expect(screen.getByLabelText("Judge fit against")).toHaveValue("every");
});

test("removing the printer export and fit point at says so, and undo restores both", async () => {
  const user = userEvent.setup();
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "plates",
    fitTarget: "u1",
    stack: { name: "my-vault", depth: 5, layers: [], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: { ...meta.defaults, mode: "u1" },
  }));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Plates & export" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(screen.getByRole("button", { name: "Remove U1" }));
  expect(screen.getByText(/only printer parts are sent to/)).toBeInTheDocument();
  expect(screen.getByText(/fit-check target/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Remove U1" }));
  const afterRemove = JSON.parse(localStorage.getItem("vault-configurator") || "{}");
  expect(afterRemove.settings.printers.some((printer: { id: string }) => printer.id === "u1")).toBe(false);
  expect(afterRemove.settings.mode).toBe("both");
  expect(afterRemove.fitTarget).toBe("every");
  await user.click(screen.getByRole("button", { name: "Undo" }));
  const afterUndo = JSON.parse(localStorage.getItem("vault-configurator") || "{}");
  expect(afterUndo.settings.printers.some((printer: { id: string }) => printer.id === "u1")).toBe(true);
  expect(afterUndo.settings.mode).toBe("u1");
  expect(afterUndo.fitTarget).toBe("u1");
});

test("undo after the user re-picks a fit target keeps the newer choice", async () => {
  const user = userEvent.setup();
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "plates",
    fitTarget: "u1",
    stack: { name: "my-vault", depth: 5, layers: [], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: { ...meta.defaults, mode: "u1" },
  }));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Plates & export" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(screen.getByRole("button", { name: "Remove U1" }));
  await user.click(screen.getByRole("button", { name: "Remove U1" }));
  // The user picks a new fit target in the header, then switches back to All printers:
  // that explicit "every" is a newer choice, not the untouched removal fallback.
  await user.selectOptions(screen.getByLabelText("Judge fit against"), "p1s");
  await user.selectOptions(screen.getByLabelText("Judge fit against"), "every");
  await user.click(screen.getByRole("button", { name: "Undo" }));
  const afterUndo = JSON.parse(localStorage.getItem("vault-configurator") || "{}");
  expect(afterUndo.settings.printers.some((printer: { id: string }) => printer.id === "u1")).toBe(true);
  expect(afterUndo.fitTarget).toBe("every");
  expect(afterUndo.settings.mode).toBe("u1");
});

test("ticking No tall parts on a printer with Z of 1 still saves a positive limit", async () => {
  const user = userEvent.setup();
  const tinyPrinters = printers.map((printer) => printer.id === "u1" ? { ...printer, z: 1, maxH: 1 } : printer);
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "stack",
    stack: { name: "my-vault", depth: 5, layers: [], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: { ...meta.defaults, printers: tinyPrinters },
  }));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Compose your stack" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(screen.getByText("No tall parts, nozzle and process preset"));
  await user.click(screen.getAllByRole("checkbox", { name: /No tall parts/ })[0]);
  const afterTick = JSON.parse(localStorage.getItem("vault-configurator") || "{}");
  const u1 = afterTick.settings.printers.find((printer: { id: string }) => printer.id === "u1");
  expect(u1.maxH).toBeGreaterThan(0);
  expect(u1.maxH).toBeLessThan(1);
});

test("number fields revert invalid dimensions and only persist valid commits", async () => {
  const user = userEvent.setup();
  const savedPrinter = () => JSON.parse(localStorage.getItem("vault-configurator") || "{}").settings.printers.find((printer: { id: string }) => printer.id === "u1");
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "stack",
    stack: { name: "my-vault", depth: 5, layers: [], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: { ...meta.defaults },
  }));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Compose your stack" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Settings" }));

  const bedX = screen.getByRole("spinbutton", { name: "Bed X for u1" });
  await user.clear(bedX);
  await user.type(bedX, "0{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent("Bed X must be above 0.");
  expect(bedX).toHaveValue(270);
  expect(savedPrinter().bed[0]).toBe(270);

  const bedY = screen.getByRole("spinbutton", { name: "Bed Y for u1" });
  await user.clear(bedY);
  await user.tab();
  expect(screen.getByText("Bed Y needs a number.")).toBeInTheDocument();
  expect(bedY).toHaveValue(270);
  expect(savedPrinter().bed[1]).toBe(270);

  const z = screen.getByRole("spinbutton", { name: "Z for u1" });
  await user.clear(z);
  await user.type(z, "300");
  await user.tab();
  expect(z).toHaveValue(300);
  expect(savedPrinter().z).toBe(300);
});

test("controls that cannot act are disabled before interaction", async () => {
  const user = userEvent.setup();
  const layer = {
    type: "Drawers", layout: "S", height: 2, facades: [[1, 1]], interior: "none", key: "key",
    labels: true, rails: false, manualSupports: false, variant: "Flat", baseplate: false,
    gridW: 1, gridD: 1, divW: 1, divD: 2,
  };
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "stack",
    stack: { name: "my-vault", depth: 5, layers: [layer], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: { ...meta.defaults },
  }));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Compose your stack" })).toBeInTheDocument();
  await user.click(screen.getByText("Load"));
  expect(screen.getByRole("button", { name: "Working copy" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Delete saved" })).toBeDisabled();
  await user.click(screen.getByText("Load"));
  await user.click(screen.getByRole("button", { name: /Edit .*drawer/i }));
  const rails = screen.getByRole("checkbox", { name: /geared rails/ });
  expect(rails).toBeChecked();
  expect(rails).toBeDisabled();
  await user.click(screen.getByRole("tab", { name: "3 Plates" }));
  const exportTests = await screen.findByRole("button", { name: "Export test plates" });
  expect(exportTests).toBeDisabled();
  await user.click(screen.getByRole("checkbox", { name: "module" }));
  expect(exportTests).toBeEnabled();
});

test("geared rails stays toggleable when only one bay is split", async () => {
  const user = userEvent.setup();
  const layer = {
    type: "Drawers", layout: "SS", height: 2, facades: [[1, 1], [2]], interior: "none", key: "key",
    labels: true, rails: false, manualSupports: false, variant: "Flat", baseplate: false,
    gridW: 1, gridD: 1, divW: 1, divD: 2,
  };
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "stack",
    stack: { name: "my-vault", depth: 5, layers: [layer], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: { ...meta.defaults },
  }));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Compose your stack" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Edit .*drawer/i }));
  // The split bay always gets rails in the BOM; the toggle still decides the unsplit bay.
  const rails = screen.getByRole("checkbox", { name: /geared rails \(split bays always include them\)/ });
  expect(rails).not.toBeChecked();
  expect(rails).toBeEnabled();
  await user.click(rails);
  expect(JSON.parse(localStorage.getItem("vault-configurator") || "{}").stack.layers[0].rails).toBe(true);
});

test("the layer grip reorders from the keyboard and keeps focus on the moved layer", async () => {
  const user = userEvent.setup();
  const layer = (height: number) => ({
    type: "Drawers", layout: "S", height, facades: [[height]], interior: "none", key: "key",
    labels: true, rails: false, manualSupports: false, variant: "Flat", baseplate: false,
    gridW: 1, gridD: 1, divW: 1, divD: 2,
  });
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "stack",
    stack: { name: "my-vault", depth: 5, layers: [layer(1), layer(4)], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: { ...meta.defaults },
  }));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Compose your stack" })).toBeInTheDocument();
  // Rows render top-first, so the first grip belongs to the top layer (index 1, height 4).
  const grips = screen.getAllByRole("button", { name: /Reorder .*arrow keys/ });
  expect(grips).toHaveLength(2);
  grips[0].focus();
  expect(grips[0]).toHaveFocus();
  // Two rapid ArrowDowns (toward the base: index 1 -> 0) with no frame between
  // them: the second must land on the moved layer's grip and stop at the
  // boundary, not swap the layers back.
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  const saved = JSON.parse(localStorage.getItem("vault-configurator") || "{}");
  expect(saved.stack.layers.map((row: { height: number }) => row.height)).toEqual([4, 1]);
  expect(document.activeElement?.getAttribute("data-grip-index")).toBe("0");
  // Activation opens the editor, as the grip's name ("Activate to edit") says.
  expect(screen.getAllByRole("button", { name: /Edit .*drawer/i }).every((btn) => btn.getAttribute("aria-expanded") === "false")).toBe(true);
  await user.click(screen.getAllByRole("button", { name: /Activate to edit/ })[0]);
  expect(screen.getAllByRole("button", { name: /Edit .*drawer/i }).some((btn) => btn.getAttribute("aria-expanded") === "true")).toBe(true);
});

test("loading Spoolman spools can fill a filament slot", async () => {
  const user = userEvent.setup();
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "stack",
    stack: { name: "my-vault", depth: 5, layers: [], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: { ...meta.defaults, spoolman: "http://spoolman.test" },
  }));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Compose your stack" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(screen.getByRole("button", { name: "Filaments" }));
  await user.click(screen.getByText("Spoolman"));
  await user.click(screen.getByRole("button", { name: "Load spools" }));
  const select = await screen.findByRole("combobox", { name: "Spool for Charcoal" });
  await user.selectOptions(select, "7");
  const saved = JSON.parse(localStorage.getItem("vault-configurator") || "{}");
  const row = saved.settings.filaments.find((filament: { id: string }) => filament.id === "charcoal");
  expect(row).toMatchObject({ name: "Acme Galaxy Black", material: "PETG", color: "#101010", spool: 7 });
});

test("a BOM failure is shown in the header status", async () => {
  const layer = {
    type: "Drawers", layout: "S", height: 2, facades: [[2]], interior: "none", key: "key",
    labels: true, rails: false, manualSupports: false, variant: "Flat", baseplate: false,
    gridW: 1, gridD: 1, divW: 1, divD: 2,
  };
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "stack",
    stack: { name: "my-vault", depth: 5, layers: [layer], roof: { type: "none", topHandle: true }, mods: {} },
    settings: meta.defaults,
  }));
  const base = vi.mocked(fetch).getMockImplementation()!;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    if (String(input).includes("/api/bom")) return json({ error: "boom stack" }, 500);
    return base(input, init);
  }));
  render(<App />);
  expect(await screen.findByText("boom stack")).toBeInTheDocument();
});

test("assembly counts ignore checks left over from an earlier stack", async () => {
  const user = userEvent.setup();
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "stack",
    stack: { name: "my-vault", depth: 5, layers: [], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: { ...meta.defaults },
    progress: { layoutKey: "", plates: {}, hardware: { Screws: { qty: 4, done: true } }, assemble: { "L1|Box": { qty: 1, done: true } } },
  }));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Compose your stack" })).toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "4 Assemble" }));
  expect(screen.getByText(/0\/0 hardware lines · 0\/0 assembly lines checked/)).toBeInTheDocument();
});

function stubBom(parts: unknown[], hardware: unknown[], extra: Record<string, unknown> = {}) {
  const base = vi.mocked(fetch).getMockImplementation()!;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const response = await base(input, init);
    if (!String(input).includes("/api/bom")) return response;
    const body = await response.json() as Record<string, unknown>;
    return json({ ...body, parts, hardware, ...extra });
  }));
}

test("each step ends with a readiness line and a next action that never blocks, with millimetres beside the U counts", async () => {
  const user = userEvent.setup();
  const layer = (height: number) => ({
    type: "Drawers", layout: "S", height, facades: [[height]], interior: "none", key: "key",
    labels: true, rails: false, manualSupports: false, variant: "Flat", baseplate: false,
    gridW: 1, gridD: 1, divW: 1, divD: 2,
  });
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "stack",
    stack: { name: "my-vault", depth: 5, layers: [layer(2), layer(1)], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: meta.defaults,
  }));
  stubBom(
    [
      { group: "L1 Drawer", name: "Box", qty: 2, role: "box", file: "box.stl", size: [100, 100, 40] },
      { group: "L1 Drawer", name: "Knob", qty: 1, role: "knob", file: "", size: [10, 10, 10] },
    ],
    [],
    // A height-limit failure: stackfit words it "mm tall, over … limit", never "does not fit".
    { optionFits: { layers: [{ reasons: ["L1 Drawer: 1× S5 Module 2F is 272.0 mm tall, over U1's 270 mm limit"] }, { reasons: [] }] } },
  );
  render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  // 99.5 + 51.5 mm of sheet plus 5 mm between the two layers.
  expect(await screen.findByText("2 layers · 3U · 156.0 mm tall · 1 layer does not fit your printers.")).toBeInTheDocument();
  expect(screen.getByText("2U · 99.5 mm")).toBeInTheDocument();
  expect(screen.getByText("1U · 51.5 mm")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Continue to Parts & colours" }));
  expect(await screen.findByRole("heading", { name: "Parts & colours" })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("heading", { name: "Parts & colours" })).toHaveFocus());
  // The Box has no fit data (`unknown`), so it is not counted as not fitting.
  expect(await screen.findByText("3 pieces · 1 part has its file missing from the archive.")).toBeInTheDocument();
  expect(screen.getByText("fit not checked")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Review plates" }));
  expect(await screen.findByRole("heading", { name: "Plates & export" })).toBeInTheDocument();
  expect(screen.getByText(/nothing exported yet\. You can start assembling before you export\./)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Continue to assemble" }));
  expect(await screen.findByRole("heading", { name: "Assemble" })).toBeInTheDocument();
});

test("Assembly complete appears only once every hardware and assembly line is checked", async () => {
  const user = userEvent.setup();
  const layer = {
    type: "Drawers", layout: "S", height: 2, facades: [[2]], interior: "none", key: "key",
    labels: true, rails: false, manualSupports: false, variant: "Flat", baseplate: false,
    gridW: 1, gridD: 1, divW: 1, divD: 2,
  };
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "assemble",
    stack: { name: "my-vault", depth: 5, layers: [layer], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: meta.defaults,
    progress: { layoutKey: "", plates: {}, hardware: { Screws: { qty: 4, done: true } }, assemble: { "L1 Drawer|Box": { qty: 1, done: false } } },
  }));
  stubBom([{ group: "L1 Drawer", name: "Box", qty: 1, role: "box", file: "box.stl" }], [{ item: "Screws", qty: 4 }]);
  render(<App />);
  expect(await screen.findByText(/1\/1 hardware lines · 0\/1 assembly lines checked/)).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Have 4 Screws" })).toBeChecked();
  expect(screen.getByText("L1 Drawer · 0/1")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Assembly complete" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("checkbox", { name: "1× Box" }));
  expect(screen.getByRole("heading", { name: "Assembly complete" })).toBeInTheDocument();
  await user.click(screen.getByRole("checkbox", { name: "Hide checked" }));
  expect(screen.queryByRole("checkbox", { name: "1× Box" })).not.toBeInTheDocument();
  expect(screen.getByText("L1 Drawer · 1/1")).toBeInTheDocument();
  await user.click(screen.getByRole("checkbox", { name: "Hide checked" }));
  await user.click(screen.getByRole("checkbox", { name: "1× Box" }));
  expect(screen.queryByRole("heading", { name: "Assembly complete" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("checkbox", { name: "1× Box" }));
  await user.click(screen.getByRole("button", { name: "Review checklist again" }));
  expect(screen.queryByRole("heading", { name: "Assembly complete" })).not.toBeInTheDocument();
  expect(screen.getByText(/0\/1 hardware lines · 0\/1 assembly lines checked/)).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "1× Box" })).not.toBeChecked();
});

test("Assembly complete is not claimed while the BOM still belongs to an earlier signature", async () => {
  const user = userEvent.setup();
  const layer = {
    type: "Drawers", layout: "S", height: 2, facades: [[2]], interior: "none", key: "key",
    labels: true, rails: false, manualSupports: false, variant: "Flat", baseplate: false,
    gridW: 1, gridD: 1, divW: 1, divD: 2,
  };
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "assemble",
    stack: { name: "my-vault", depth: 5, layers: [layer], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: meta.defaults,
    progress: { layoutKey: "", plates: {}, hardware: { Screws: { qty: 4, done: true } }, assemble: { "L1 Drawer|Box": { qty: 1, done: true } } },
  }));
  const hold = { on: false };
  const base = vi.mocked(fetch).getMockImplementation()!;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    if (String(input).includes("/api/bom") && hold.on) return new Promise<Response>(() => undefined);
    const response = await base(input, init);
    if (!String(input).includes("/api/bom")) return response;
    const body = await response.json() as Record<string, unknown>;
    return json({ ...body, parts: [{ group: "L1 Drawer", name: "Box", qty: 1, role: "box", file: "box.stl" }], hardware: [{ item: "Screws", qty: 4 }] });
  }));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Assembly complete" })).toBeInTheDocument();
  // A signature change (fit target) starts a new BOM; while it is in flight the
  // previous BOM and its checks must not claim the new configuration is built.
  hold.on = true;
  await user.selectOptions(screen.getByLabelText("Judge fit against"), "u1");
  expect(screen.queryByRole("heading", { name: "Assembly complete" })).not.toBeInTheDocument();
});

test("the Plates footer does not count files exported for an earlier build", async () => {
  const user = userEvent.setup();
  const layer = {
    type: "Drawers", layout: "S", height: 2, facades: [[2]], interior: "none", key: "key",
    labels: true, rails: false, manualSupports: false, variant: "Flat", baseplate: false,
    gridW: 1, gridD: 1, divW: 1, divD: 2,
  };
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "plates",
    stack: { name: "my-vault", depth: 5, layers: [layer], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: meta.defaults,
  }));
  stubBom([{ group: "L1 Drawer", name: "Box", qty: 1, role: "main", file: "box.stl", kind: "module" }], []);
  const base = vi.mocked(fetch).getMockImplementation()!;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/export_status")) return json({ running: false, percent: 100, result: { plan: { plates: [], unplaceable: [], pieces: 0, placed: 0, fingerprint: "abc" }, files: [{ file: "stack-u1.3mf", plates: 1, items: 2 }], seconds: 1, zip: "stack.zip" } });
    if (url.includes("/api/export")) return json({ ok: true });
    return base(input, init);
  }));
  render(<App />);
  await screen.findByRole("heading", { name: "Plates & export" });
  await user.click(screen.getByRole("button", { name: "Export 3MF" }));
  expect(await screen.findByText(/1 file exported\./, undefined, { timeout: 5000 })).toBeInTheDocument();
  expect(screen.getByText("Exported — matches your current stack.")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "3 Plates" })).not.toHaveAttribute("title");
  // Changing the fit target changes the signature: the export no longer matches this build.
  await user.selectOptions(screen.getByLabelText("Judge fit against"), "u1");
  expect(screen.getByText(/exported files are for an earlier build/)).toBeInTheDocument();
  expect(screen.getByText("Stack changed since this export — export again before printing.")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "3 Plates" })).toHaveAttribute("title", "Exported files are for an earlier build");
  expect(screen.queryByText(/1 file exported\./)).not.toBeInTheDocument();
});

test("an export that finishes after the build changed does not overwrite the newer plan", async () => {
  const user = userEvent.setup();
  const layer = {
    type: "Drawers", layout: "S", height: 2, facades: [[2]], interior: "none", key: "key",
    labels: true, rails: false, manualSupports: false, variant: "Flat", baseplate: false,
    gridW: 1, gridD: 1, divW: 1, divD: 2,
  };
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "plates",
    stack: { name: "my-vault", depth: 5, layers: [layer], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: meta.defaults,
  }));
  let releaseStatus: (() => void) | undefined;
  stubBom([{ group: "L1 Drawer", name: "Box", qty: 1, role: "main", file: "box.stl", kind: "module" }], []);
  const base = vi.mocked(fetch).getMockImplementation()!;
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/export_status")) {
      // Held open until the test releases it: the export of the old build is still running.
      return new Promise<Response>((resolve) => {
        releaseStatus = () => void json({ running: false, percent: 100, result: { plan: { plates: [{ printer: "u1", items: [] }], unplaceable: [{ name: "Roof" }], pieces: 1, placed: 0, fingerprint: "export-plan" }, files: [{ file: "stack-u1.3mf", plates: 1, items: 2 }], seconds: 1, zip: "stack.zip" } }).then(resolve);
      });
    }
    if (url.includes("/api/export")) return json({ ok: true });
    return base(input, init);
  }));
  render(<App />);
  await screen.findByRole("heading", { name: "Plates & export" });
  await user.click(screen.getByRole("button", { name: "Export 3MF" }));
  await waitFor(() => expect(releaseStatus).toBeDefined(), { timeout: 5000 });
  // The build changes mid-export; the plan effect answers with the new plan (0 plates).
  await user.selectOptions(screen.getByLabelText("Judge fit against"), "u1");
  expect(await screen.findByText(/0 plates planned/)).toBeInTheDocument();
  releaseStatus!();
  // The finished export keeps its files, labeled stale, but must not replace the plan.
  expect(await screen.findByText(/exported files are for an earlier build/)).toBeInTheDocument();
  expect(screen.getByText(/0 plates planned/)).toBeInTheDocument();
  expect(screen.queryByText(/1 plate planned/)).not.toBeInTheDocument();
});

test("a test-plate export neither replaces the stack plan nor counts as the stack export", async () => {
  const user = userEvent.setup();
  const layer = {
    type: "Drawers", layout: "S", height: 2, facades: [[2]], interior: "none", key: "key",
    labels: true, rails: false, manualSupports: false, variant: "Flat", baseplate: false,
    gridW: 1, gridD: 1, divW: 1, divD: 2,
  };
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "plates",
    stack: { name: "my-vault", depth: 5, layers: [layer], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: meta.defaults,
  }));
  stubBom([{ group: "L1 Drawer", name: "Box", qty: 1, role: "main", file: "box.stl", kind: "module" }], []);
  const base = vi.mocked(fetch).getMockImplementation()!;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/export_status")) return json({ running: false, percent: 100, result: { plan: { plates: [{ printer: "u1", items: [] }], unplaceable: [], pieces: 1, placed: 1, fingerprint: "test-plan" }, files: [{ file: "test-module.3mf", plates: 1, items: 1 }], seconds: 1, zip: "test.zip" } });
    if (url.includes("/api/export")) return json({ ok: true });
    return base(input, init);
  }));
  render(<App />);
  await screen.findByRole("heading", { name: "Plates & export" });
  expect(await screen.findByText(/0 plates planned/)).toBeInTheDocument();
  await user.click(screen.getByRole("checkbox", { name: "module" }));
  await user.click(screen.getByRole("button", { name: "Export test plates" }));
  expect(await screen.findByText(/test plates exported\./, undefined, { timeout: 5000 })).toBeInTheDocument();
  // The stack plan (0 plates from /api/plan) survives; the test plan is not shown as it.
  expect(screen.getByText(/0 plates planned/)).toBeInTheDocument();
  expect(screen.queryByText(/1 plate planned/)).not.toBeInTheDocument();
  // Changing the picked test groups makes those files an earlier selection.
  await user.click(screen.getByRole("checkbox", { name: "module" }));
  expect(screen.getByText(/test plates exported for an earlier selection/)).toBeInTheDocument();
});

test("Plates blocks export and says why when part files are missing from the archive", async () => {
  const user = userEvent.setup();
  const layer = {
    type: "Drawers", layout: "S", height: 2, facades: [[2]], interior: "none", key: "key",
    labels: true, rails: false, manualSupports: false, variant: "Flat", baseplate: false,
    gridW: 1, gridD: 1, divW: 1, divD: 2,
  };
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "plates",
    stack: { name: "my-vault", depth: 5, layers: [layer], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: meta.defaults,
  }));
  stubBom(
    [
      { group: "L1 Drawer", name: "Box", qty: 2, role: "box", file: "box.stl", kind: "module" },
      { group: "L1 Drawer", name: "S5 Module 2F", qty: 3, role: "main", file: "", kind: "module" },
    ],
    [],
  );
  render(<App />);
  await screen.findByRole("heading", { name: "Plates & export" });
  expect(await screen.findByText(/3 pieces have no file in the archive, so nothing can be exported yet/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Export 3MF" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Point the planner at your VAULT folder" }));
  expect(await screen.findByRole("heading", { name: "Compose your stack" })).toBeInTheDocument();
});

test("Plates explains an empty stack instead of leaving Preview and Export unexplained", async () => {
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "plates",
    stack: { name: "my-vault", depth: 5, layers: [], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: meta.defaults,
  }));
  render(<App />);
  await screen.findByRole("heading", { name: "Plates & export" });
  expect(screen.getByText("Nothing to export yet — add a layer on Design.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Export 3MF" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Preview plates" })).toBeDisabled();
});

test("removing the last layer disables Preview and Export before the BOM catches up", async () => {
  const user = userEvent.setup();
  const layer = {
    type: "Drawers", layout: "S", height: 2, facades: [[2]], interior: "none", key: "key",
    labels: true, rails: false, manualSupports: false, variant: "Flat", baseplate: false,
    gridW: 1, gridD: 1, divW: 1, divD: 2,
  };
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "stack",
    stack: { name: "my-vault", depth: 5, layers: [layer], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: meta.defaults,
  }));
  stubBom([{ group: "L1 Drawer", name: "Box", qty: 1, role: "main", file: "box.stl", kind: "module" }], []);
  render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  await user.click(screen.getByRole("tab", { name: "3 Plates" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Export 3MF" })).toBeEnabled());
  await user.click(screen.getByRole("tab", { name: "1 Design" }));
  // Synchronous clicks: the debounced BOM clear has not run yet, so the old BOM still has parts.
  fireEvent.click(screen.getByRole("button", { name: "Remove S drawer" }));
  fireEvent.click(screen.getByRole("tab", { name: "3 Plates" }));
  expect(screen.getByText("Nothing to export yet — add a layer on Design.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Export 3MF" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Preview plates" })).toBeDisabled();
});

test("Save confirms, and the saved project appears in Load next to the working copy", async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument();
  await user.click(screen.getByText("Load"));
  expect(screen.getByRole("button", { name: "Working copy" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "my-vault" })).toBeInTheDocument();
  expect(screen.getByText(/working copy autosaves as you go/)).toBeInTheDocument();
});

test("collapsed layer rows summarise boxes, interior, and a non-default lock", async () => {
  const drawer = {
    type: "Drawers", layout: "S", height: 2, facades: [[1, 1]], interior: "grid", key: "hidden",
    labels: true, rails: false, manualSupports: false, variant: "Flat", baseplate: false,
    gridW: 2, gridD: 3, divW: 1, divD: 2,
  };
  // Catalog gates: L bodies take the variant (flag inactive), S bodies take
  // the dividers flag (variant inactive) — the summary must agree.
  const sealedSustainer = {
    type: "Sustainers", layout: "L", height: 1, facades: [[1]], interior: "none", key: "key",
    labels: true, rails: false, manualSupports: false, variant: "Sealed", baseplate: false,
    gridW: 1, gridD: 1, divW: 1, divD: 2, dividers: true,
  };
  const dividedSustainer = {
    type: "Sustainers", layout: "S", height: 1, facades: [[1]], interior: "none", key: "key",
    labels: true, rails: false, manualSupports: false, variant: "Sealed", baseplate: false,
    gridW: 1, gridD: 1, divW: 1, divD: 2, dividers: true,
  };
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "stack",
    stack: { name: "my-vault", depth: 5, layers: [drawer, sealedSustainer, dividedSustainer], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: meta.defaults,
  }));
  stubBom([], []);
  render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  expect(screen.getByText("2 boxes · grid 2×3 · hidden key")).toBeInTheDocument();
  expect(screen.getByText("sealed")).toBeInTheDocument();
  expect(screen.getByText("dividers")).toBeInTheDocument();
});

const hardenDrawer = {
  type: "Drawers", layout: "S", height: 2, facades: [[1, 1]], interior: "grid", key: "hidden",
  labels: true, rails: false, manualSupports: false, variant: "Flat", baseplate: false,
  gridW: 2, gridD: 3, divW: 1, divD: 2,
};
const hardenSustainer = {
  type: "Sustainers", layout: "L", height: 1, facades: [[1]], interior: "none", key: "key",
  labels: true, rails: false, manualSupports: false, variant: "Sealed", baseplate: false,
  gridW: 1, gridD: 1, divW: 1, divD: 2, dividers: true,
};

function seedStack(layers: unknown[]) {
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "stack",
    stack: { name: "my-vault", depth: 5, layers, roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: meta.defaults,
  }));
  stubBom([], []);
}
const hardenDivided = {
  type: "Sustainers", layout: "S", height: 1, facades: [[1]], interior: "none", key: "key",
  labels: true, rails: false, manualSupports: false, variant: "Sealed", baseplate: false,
  gridW: 1, gridD: 1, divW: 1, divD: 2, dividers: true,
};

test("removing a layer offers Undo, and Undo restores it in place", async () => {
  const user = userEvent.setup();
  // Middle-of-three: an append-on-restore implementation would put "sealed"
  // on top instead of back between its neighbours.
  seedStack([hardenDrawer, hardenSustainer, hardenDivided]);
  const { container } = render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  const summaries = () => [...container.querySelectorAll(".layer-summary")].map((node) => node.textContent);
  expect(summaries()).toEqual(["dividers", "sealed", "2 boxes · grid 2×3 · hidden key"]);
  await user.click(screen.getByRole("button", { name: "Edit S sustainer" }));
  await user.click(screen.getByRole("button", { name: "Remove L sustainer" }));
  expect(screen.getByText(/L sustainer removed\./)).toBeInTheDocument();
  expect(summaries()).toEqual(["dividers", "2 boxes · grid 2×3 · hidden key"]);
  await user.click(screen.getByRole("button", { name: "Undo" }));
  expect(summaries()).toEqual(["dividers", "sealed", "2 boxes · grid 2×3 · hidden key"]);
  // The open editor still targets the same (top) layer after removal and restore.
  expect(screen.getByRole("button", { name: "Edit S sustainer" })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: "Edit L sustainer" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText(/L sustainer removed\./)).not.toBeInTheDocument();
});

test("Start over clears nothing until it is confirmed by count", async () => {
  const user = userEvent.setup();
  seedStack([hardenDrawer, hardenSustainer]);
  render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  await user.click(screen.getByRole("button", { name: "Start over" }));
  expect(screen.getByText(/Start over removes 2 layers/)).toBeInTheDocument();
  expect(screen.getByText("sealed")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Keep my stack" }));
  expect(screen.queryByText(/Start over removes 2 layers/)).not.toBeInTheDocument();
  expect(screen.getByText("sealed")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Start over" }));
  await user.click(screen.getByRole("button", { name: "Start over" }));
  expect(screen.getAllByText(/No layers yet/).length).toBeGreaterThan(0);
  expect(screen.queryByText("sealed")).not.toBeInTheDocument();
});

test("Duplicate layer opens an independent clone beneath the original", async () => {
  const user = userEvent.setup();
  seedStack([hardenDrawer]);
  const { container } = render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  const summaries = () => [...container.querySelectorAll(".layer-summary")].map((node) => node.textContent);
  await user.click(screen.getByRole("button", { name: "Edit S drawer" }));
  await user.click(screen.getByRole("button", { name: "Duplicate layer" }));
  expect(summaries()).toEqual(["2 boxes · grid 2×3 · hidden key", "2 boxes · grid 2×3 · hidden key"]);
  // The clone (second row, directly beneath) is the open editor, not the original.
  const editors = screen.getAllByRole("button", { name: "Edit S drawer" });
  expect(editors[0]).toHaveAttribute("aria-expanded", "false");
  expect(editors[1]).toHaveAttribute("aria-expanded", "true");
  // Editing the clone's nested facades must not leak into the original:
  // structuredClone keeps shared references shared, so a shallow duplicate fails here.
  await user.selectOptions(screen.getByLabelText("Facades"), "[2]");
  expect(summaries()).toEqual(["2 boxes · grid 2×3 · hidden key", "grid 2×3 · hidden key"]);
});

test("? buttons ask for help without toggling their field", async () => {
  const user = userEvent.setup();
  seedStack([hardenDrawer]);
  render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  // Tab order: the field comes before its ? button in the DOM.
  const depthField = screen.getByLabelText("Depth");
  const depthHelp = screen.getByRole("button", { name: "Help: Depth" });
  expect(depthField.compareDocumentPosition(depthHelp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await user.click(depthHelp);
  expect(screen.getByRole("heading", { name: "Depth" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Back to Depth" }));
  expect(depthHelp).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Edit S drawer" }));
  const labels = screen.getByRole("checkbox", { name: "labels" });
  expect(labels).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Help: labels" }));
  expect(screen.getByRole("heading", { name: "Labels" })).toBeInTheDocument();
  expect(labels).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Back to labels" }));
  expect(screen.getByRole("button", { name: "Help: labels" })).toHaveFocus();
  expect(labels).toBeChecked();
});

test("Start over also confirms before discarding a roof-only design", async () => {
  const user = userEvent.setup();
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "stack",
    stack: { name: "my-vault", depth: 5, layers: [], roof: { type: "grid", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    overrides: { anything: "red" },
    settings: meta.defaults,
  }));
  stubBom([], []);
  render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  await user.click(screen.getByRole("button", { name: "Start over" }));
  expect(screen.getByText(/discards colour overrides, and resets the roof and mods/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Keep my stack" }));
  expect(screen.getByLabelText("Roof")).toHaveValue("grid");
});

test("replacing the stack clears a pending layer Undo", async () => {
  const user = userEvent.setup();
  seedStack([hardenDrawer]);
  render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  await user.click(screen.getByRole("button", { name: "Remove S drawer" }));
  expect(screen.getByText(/S drawer removed\./)).toBeInTheDocument();
  // Zero layers left, so New needs no window.confirm; it replaces the stack.
  await user.click(screen.getByText("Load"));
  await user.click(screen.getByRole("button", { name: "New" }));
  expect(screen.queryByText(/S drawer removed\./)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
});

test("remapLayerKeys renumbers layer groups and leaves other keys alone", () => {
  const overrides = {
    "L1 · S5 2U drawers|Latch": { role: "accent" },
    "L2 · S5 2U drawers|Latch": { role: "dark" },
    "Roof|Roof Whole": { role: "main" },
  };
  // Insert at 0 with inheritance (duplicate): L1 copies stay and move, L2 shifts.
  expect(Object.keys(remapLayerKeys(overrides, (i) => (i === 0 ? [0, 1] : [i + 1]))).sort()).toEqual([
    "L1 · S5 2U drawers|Latch", "L2 · S5 2U drawers|Latch", "L3 · S5 2U drawers|Latch", "Roof|Roof Whole",
  ]);
  // Remove at 0: its keys drop, higher layers shift down.
  expect(Object.keys(remapLayerKeys(overrides, (i) => (i === 0 ? [] : [i - 1]))).sort()).toEqual([
    "L1 · S5 2U drawers|Latch", "Roof|Roof Whole",
  ]);
  // Undo capture (keepUntagged false): only the removed layer's entries, so
  // restoring cannot roll back a Roof colour changed in between.
  expect(remapLayerKeys(overrides, (i) => (i === 0 ? [0] : []), false)).toEqual({
    "L1 · S5 2U drawers|Latch": { role: "accent" },
  });
});

test("duplicating a layer renumbers colour overrides onto the right layers", async () => {
  const user = userEvent.setup();
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "stack",
    stack: { name: "my-vault", depth: 5, layers: [hardenDrawer, hardenDrawer], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    overrides: { "L2 · S5 2U drawers|Latch": { role: "accent" } },
    settings: meta.defaults,
  }));
  stubBom([], []);
  render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  // Duplicate the bottom drawer (second row shown, storage index 0).
  await user.click(screen.getAllByRole("button", { name: "Edit S drawer" })[1]);
  await user.click(screen.getByRole("button", { name: "Duplicate layer" }));
  await waitFor(() => {
    const saved = JSON.parse(localStorage.getItem("vault-configurator") || "{}");
    expect(saved.overrides).toEqual({ "L3 · S5 2U drawers|Latch": { role: "accent" } });
  });
});

// A BOM whose Latch rows follow the requested stack, so progress
// reconciliation preserves (or exposes) whatever the remap produced.
function stubBomPerLayer() {
  const base = vi.mocked(fetch).getMockImplementation()!;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const response = await base(input, init);
    if (!String(input).includes("/api/bom")) return response;
    const body = await response.json() as Record<string, unknown>;
    const requested = JSON.parse(String(init?.body || "{}")) as { stack?: { layers?: unknown[] } };
    const parts = (requested.stack?.layers || []).map((_, i) => ({
      group: `L${i + 1} · S5 2U drawers`, name: "Latch", qty: 2, role: "lock", file: "", size: [10, 10, 10],
    }));
    return json({ ...body, parts, hardware: [] });
  }));
}

function seedCheckedStack(assemble: Record<string, { qty: number; done: boolean }>) {
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "stack",
    stack: { name: "my-vault", depth: 5, layers: [hardenDrawer, hardenDrawer], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    progress: { layoutKey: "", plates: {}, hardware: {}, assemble },
    settings: meta.defaults,
  }));
  stubBomPerLayer();
}

function persistedAssembleDone(): Record<string, boolean> {
  const saved = JSON.parse(localStorage.getItem("vault-configurator") || "{}") as Partial<PlannerState>;
  return Object.fromEntries(Object.entries(saved.progress?.assemble || {}).map(([key, value]) => [key, !!value?.done]));
}

test("duplicating a checked layer keeps the check on the original, clone unchecked", async () => {
  const user = userEvent.setup();
  // Both layers checked, and the duplicated (bottom) one is among them:
  // copying completion to the clone would leave L1 checked.
  seedCheckedStack({
    "L1 · S5 2U drawers|Latch": { qty: 2, done: true },
    "L2 · S5 2U drawers|Latch": { qty: 2, done: true },
  });
  render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  await user.click(screen.getAllByRole("button", { name: "Edit S drawer" })[1]);
  await user.click(screen.getByRole("button", { name: "Duplicate layer" }));
  await waitFor(() => {
    expect(persistedAssembleDone()).toEqual({
      "L1 · S5 2U drawers|Latch": false,
      "L2 · S5 2U drawers|Latch": true,
      "L3 · S5 2U drawers|Latch": true,
    });
  });
});

test("remove and Undo keep assembly checks with their layers", async () => {
  const user = userEvent.setup();
  seedCheckedStack({
    "L1 · S5 2U drawers|Latch": { qty: 2, done: true },
    "L2 · S5 2U drawers|Latch": { qty: 2, done: true },
  });
  render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  await user.click(screen.getAllByRole("button", { name: "Remove S drawer" })[1]);
  await waitFor(() => {
    expect(persistedAssembleDone()).toEqual({ "L1 · S5 2U drawers|Latch": true });
  });
  await user.click(screen.getByRole("button", { name: "Undo" }));
  await waitFor(() => {
    expect(persistedAssembleDone()).toEqual({
      "L1 · S5 2U drawers|Latch": true,
      "L2 · S5 2U drawers|Latch": true,
    });
  });
});

test("Start over clears assembly checks so a re-added layer starts unchecked", async () => {
  const user = userEvent.setup();
  seedCheckedStack({ "L1 · S5 2U drawers|Latch": { qty: 2, done: true } });
  render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  await user.click(screen.getByRole("button", { name: "Start over" }));
  await user.click(screen.getByRole("button", { name: "Start over" }));
  await waitFor(() => {
    expect(persistedAssembleDone()).toEqual({});
  });
  await user.click(screen.getByRole("button", { name: "Add layer" }));
  await waitFor(() => {
    expect(persistedAssembleDone()).toEqual({ "L1 · S5 2U drawers|Latch": false });
  });
});

function seedSsStack(assemble: Record<string, { qty: number; done: boolean }> = {}) {
  const baseDrawer = { ...hardenDrawer, layout: "L", facades: [[2]], interior: "none", key: "key" };
  const ssDrawer = { ...hardenDrawer, layout: "SS", facades: [[1, 1], [2]], interior: "none", key: "none" };
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "stack",
    stack: { name: "my-vault", depth: 5, layers: [baseDrawer, ssDrawer], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    progress: { layoutKey: "", plates: {}, hardware: {}, assemble },
    settings: meta.defaults,
  }));
  stubBomNormalizing();
}

function stubBomNormalizing() {
  // Emulate stackfit.normalize for this shape: SS is only legal above an L
  // base; exposed as the base it is rewritten to S with a single bay. Part
  // groups follow the normalized layout, like the real catalog.
  const base = vi.mocked(fetch).getMockImplementation()!;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const response = await base(input, init);
    if (!String(input).includes("/api/bom")) return response;
    const body = await response.json() as Record<string, unknown>;
    const requested = JSON.parse(String(init?.body || "{}")) as { stack?: { layers?: Array<Record<string, unknown>> } };
    const layers = (requested.stack?.layers || []).map((layer, i) => (
      i === 0 && layer.layout === "SS" ? { ...layer, layout: "S", facades: [[1, 1]] } : layer
    ));
    const parts = layers.map((layer, i) => ({
      group: `L${i + 1} · ${String(layer.layout)}5 2U drawers`, name: "Latch", qty: 2, role: "lock", file: "", size: [10, 10, 10],
    }));
    return json({ ...body, stack: { ...requested.stack, layers }, parts, hardware: [] });
  }));
}

function persistedLayouts(): string[] {
  const saved = JSON.parse(localStorage.getItem("vault-configurator") || "{}") as Partial<PlannerState>;
  return (saved.stack?.layers || []).map((layer) => layer.layout);
}

test("Undo restores SS settings the BOM normalization rewrote after base removal", async () => {
  const user = userEvent.setup();
  seedSsStack();
  render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  expect(screen.getByText("3 boxes · empty · no lock")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Remove L drawer" }));
  // The BOM round-trip adopts the normalized S form (one bay, 2 boxes).
  await screen.findByText("2 boxes · empty · no lock");
  await user.click(screen.getByRole("button", { name: "Undo" }));
  // Undo restores the base and reverts the normalization on the survivor.
  expect(await screen.findByText("3 boxes · empty · no lock")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Edit SS drawer" })).toBeInTheDocument();
});

test("Undo does not revert a survivor the user edited after normalization", async () => {
  const user = userEvent.setup();
  seedSsStack();
  render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  await user.click(screen.getByRole("button", { name: "Remove L drawer" }));
  await screen.findByText("2 boxes · empty · no lock");
  // Intervening user edit of exactly a normalization-owned field (height).
  await user.click(screen.getByRole("button", { name: "Edit S drawer" }));
  await user.selectOptions(screen.getByLabelText("Height"), "4");
  await user.click(screen.getByRole("button", { name: "Undo" }));
  await waitFor(() => {
    const saved = JSON.parse(localStorage.getItem("vault-configurator") || "{}") as Partial<PlannerState>;
    expect(saved.stack?.layers.map((layer) => [layer.layout, layer.height])).toEqual([["L", 2], ["S", 4]]);
  });
});

test("Undo still reverts normalization after an unrelated edit elsewhere", async () => {
  const user = userEvent.setup();
  seedSsStack();
  render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  await user.click(screen.getByRole("button", { name: "Remove L drawer" }));
  await screen.findByText("2 boxes · empty · no lock");
  // An unrelated patch (Roof) after normalization must not mark the
  // untouched survivor as user-edited.
  await user.selectOptions(screen.getByLabelText("Roof"), "grid");
  await user.click(screen.getByRole("button", { name: "Undo" }));
  expect(await screen.findByText("3 boxes · empty · no lock")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Edit SS drawer" })).toBeInTheDocument();
  expect(screen.getByLabelText("Roof")).toHaveValue("grid");
});

test("Undo restores assembly checks normalization invalidated by the group rename", async () => {
  const user = userEvent.setup();
  seedSsStack({ "L2 · SS5 2U drawers|Latch": { qty: 2, done: true } });
  render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  await waitFor(() => {
    expect(persistedAssembleDone()["L2 · SS5 2U drawers|Latch"]).toBe(true);
  });
  await user.click(screen.getByRole("button", { name: "Remove L drawer" }));
  // Normalization renames the group to S, so reconciliation drops the check.
  await screen.findByText("2 boxes · empty · no lock");
  await waitFor(() => {
    expect(persistedAssembleDone()).toEqual({ "L1 · S5 2U drawers|Latch": false });
  });
  await user.click(screen.getByRole("button", { name: "Undo" }));
  await waitFor(() => {
    expect(persistedAssembleDone()["L2 · SS5 2U drawers|Latch"]).toBe(true);
  });
});

test("duplicating a normalized survivor keeps Undo from stamping SS onto the clone", async () => {
  const user = userEvent.setup();
  seedSsStack();
  render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  await user.click(screen.getByRole("button", { name: "Remove L drawer" }));
  await screen.findByText("2 boxes · empty · no lock");
  await user.click(screen.getByRole("button", { name: "Edit S drawer" }));
  await user.click(screen.getByRole("button", { name: "Duplicate layer" }));
  await waitFor(() => {
    expect(persistedLayouts()).toEqual(["S", "S"]);
  });
  await user.click(screen.getByRole("button", { name: "Undo" }));
  // The layer list was spliced since capture, so field reverts are refused:
  // the base returns, both S layers stay S, nothing becomes SS.
  await waitFor(() => {
    expect(persistedLayouts()).toEqual(["L", "S", "S"]);
  });
});

test("a second removal replaces the capture and its Undo still reverts normalization", async () => {
  const user = userEvent.setup();
  const baseDrawer = { ...hardenDrawer, layout: "L", facades: [[2]], interior: "none", key: "key" };
  const ssDrawer = { ...hardenDrawer, layout: "SS", facades: [[1, 1], [2]], interior: "none", key: "none" };
  const topDrawer = { ...hardenDrawer, layout: "L", facades: [[2]], interior: "none", key: "hidden" };
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "stack",
    stack: { name: "my-vault", depth: 5, layers: [baseDrawer, ssDrawer, topDrawer], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: meta.defaults,
  }));
  stubBomNormalizing();
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  // The SS layer has two bays both named S; their Preview fronts must not collide on React keys.
  expect(consoleError.mock.calls.filter((call) => String(call[0]).includes("same key"))).toEqual([]);
  consoleError.mockRestore();
  // Remove the top L first (first row shown), then the base L.
  await user.click(screen.getAllByRole("button", { name: "Remove L drawer" })[0]);
  await user.click(screen.getByRole("button", { name: "Remove L drawer" }));
  await screen.findByText("2 boxes · empty · no lock");
  await user.click(screen.getByRole("button", { name: "Undo" }));
  expect(await screen.findByText("3 boxes · empty · no lock")).toBeInTheDocument();
  expect(persistedLayouts()).toEqual(["L", "SS"]);
});

test("editing one survivor during the compute window keeps the untouched survivor's revert", async () => {
  const user = userEvent.setup();
  const baseDrawer = { ...hardenDrawer, layout: "L", facades: [[2]], interior: "none", key: "key" };
  const ssDrawer = { ...hardenDrawer, layout: "SS", facades: [[1, 1], [2]], interior: "none", key: "none" };
  const topDrawer = { ...hardenDrawer, layout: "L", facades: [[2]], interior: "none", key: "hidden" };
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "stack",
    stack: { name: "my-vault", depth: 5, layers: [baseDrawer, ssDrawer, topDrawer], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: meta.defaults,
  }));
  stubBomNormalizing();
  // Hold BOM responses until released, so the Height edit lands while the
  // normalization round-trip is still in flight.
  let releaseBom: () => void = () => {};
  const gate = new Promise<void>((resolve) => { releaseBom = () => resolve(undefined); });
  const inner = vi.mocked(fetch).getMockImplementation()!;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    if (String(input).includes("/api/bom")) await gate;
    return inner(input, init);
  }));
  render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  // Rows display top-first: [top L, SS, base L] — the base is the last Remove.
  const removes = screen.getAllByRole("button", { name: "Remove L drawer" });
  await user.click(removes[removes.length - 1]);
  await user.click(screen.getByRole("button", { name: "Edit L drawer" }));
  await user.selectOptions(screen.getByLabelText("Height"), "4");
  releaseBom();
  await screen.findByText("2 boxes · empty · no lock");
  await user.click(screen.getByRole("button", { name: "Undo" }));
  expect(await screen.findByText("3 boxes · empty · no lock")).toBeInTheDocument();
  const saved = JSON.parse(localStorage.getItem("vault-configurator") || "{}") as Partial<PlannerState>;
  expect(saved.stack?.layers.map((layer) => [layer.layout, layer.height])).toEqual([["L", 2], ["SS", 2], ["L", 4]]);
});

test("Undo after swapping identical survivors does not resurrect the moved override at its old key", async () => {
  const user = userEvent.setup();
  const drawer = { ...hardenDrawer };
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "stack",
    stack: { name: "my-vault", depth: 5, layers: [drawer, drawer, drawer], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    overrides: { "L3 · S5 2U drawers|Latch": { role: "accent" } },
    settings: meta.defaults,
  }));
  render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  // Rows display top-first: the base is the last Remove.
  const removes = screen.getAllByRole("button", { name: "Remove S drawer" });
  await user.click(removes[removes.length - 1]);
  // Move the top survivor (which carries the override) toward the base.
  await user.click(screen.getAllByRole("button", { name: "Edit S drawer" })[0]);
  await user.click(screen.getByRole("button", { name: "Move toward base" }));
  await user.click(screen.getByRole("button", { name: "Undo" }));
  await waitFor(() => {
    const saved = JSON.parse(localStorage.getItem("vault-configurator") || "{}") as Partial<PlannerState>;
    expect(saved.stack?.layers).toHaveLength(3);
    // The override followed its layer to L2; recovery must not also
    // resurrect it at the captured L3 key.
    expect(saved.overrides).toEqual({ "L2 · S5 2U drawers|Latch": { role: "accent" } });
  });
});

test("Undo restores SS beside a twin S layer equal to its normalized form, with no reorder", async () => {
  const user = userEvent.setup();
  const baseDrawer = { ...hardenDrawer, layout: "L", facades: [[2]], interior: "none", key: "key" };
  const ssDrawer = { ...hardenDrawer, layout: "SS", facades: [[1, 1], [2]], interior: "none", key: "none" };
  // Exactly what the normalizing stub rewrites SS to: after adoption both
  // survivors are equal-valued, but nothing was reordered, so positions
  // still identify them and recovery must not be refused.
  const twinDrawer = { ...ssDrawer, layout: "S", facades: [[1, 1]] };
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "stack",
    stack: { name: "my-vault", depth: 5, layers: [baseDrawer, ssDrawer, twinDrawer], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: meta.defaults,
  }));
  stubBomNormalizing();
  render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  await user.click(screen.getByRole("button", { name: "Remove L drawer" }));
  await waitFor(() => {
    expect(persistedLayouts()).toEqual(["S", "S"]);
  });
  await user.click(screen.getByRole("button", { name: "Undo" }));
  await waitFor(() => {
    expect(persistedLayouts()).toEqual(["L", "SS", "S"]);
  });
  const saved = JSON.parse(localStorage.getItem("vault-configurator") || "{}") as Partial<PlannerState>;
  expect(saved.stack?.layers[1].facades).toEqual([[1, 1], [2]]);
  expect(saved.stack?.layers[2].facades).toEqual([[1, 1]]);
});

test("a checklist reset keeps Undo from resurrecting captured survivor checks", async () => {
  const user = userEvent.setup();
  seedSsStack({ "L2 · SS5 2U drawers|Latch": { qty: 2, done: true } });
  render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  await waitFor(() => {
    expect(persistedAssembleDone()["L2 · SS5 2U drawers|Latch"]).toBe(true);
  });
  await user.click(screen.getByRole("button", { name: "Remove L drawer" }));
  await screen.findByText("2 boxes · empty · no lock");
  await waitFor(() => {
    expect(persistedAssembleDone()).toEqual({ "L1 · S5 2U drawers|Latch": false });
  });
  // Complete the remaining checklist, then explicitly reset it.
  await user.click(screen.getByRole("tab", { name: "4 Assemble" }));
  await user.click(screen.getByRole("checkbox", { name: "2× Latch" }));
  await user.click(await screen.findByRole("button", { name: "Review checklist again" }));
  await user.click(screen.getByRole("tab", { name: /Design/ }));
  await user.click(screen.getByRole("button", { name: "Undo" }));
  // Geometry reverts, but the reset checks do not come back.
  expect(await screen.findByText("3 boxes · empty · no lock")).toBeInTheDocument();
  await waitFor(() => {
    expect(persistedAssembleDone()["L2 · SS5 2U drawers|Latch"]).toBe(false);
  });
});

test("a Roof recompute after a checklist reset does not block Undo geometry recovery", async () => {
  const user = userEvent.setup();
  seedSsStack({ "L2 · SS5 2U drawers|Latch": { qty: 2, done: true } });
  render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  await waitFor(() => {
    expect(persistedAssembleDone()["L2 · SS5 2U drawers|Latch"]).toBe(true);
  });
  await user.click(screen.getByRole("button", { name: "Remove L drawer" }));
  await screen.findByText("2 boxes · empty · no lock");
  await waitFor(() => {
    expect(persistedAssembleDone()).toEqual({ "L1 · S5 2U drawers|Latch": false });
  });
  await user.click(screen.getByRole("tab", { name: "4 Assemble" }));
  await user.click(screen.getByRole("checkbox", { name: "2× Latch" }));
  await user.click(await screen.findByRole("button", { name: "Review checklist again" }));
  await user.click(screen.getByRole("tab", { name: /Design/ }));
  // An unrelated edit recomputes the BOM; reconciliation's recreated
  // unchecked entries must not be mistaken for user edits of the survivor.
  // Gate that BOM so Undo provably happens after its adoption, not merely
  // after the unchecked map reset already wrote synchronously.
  let releaseBom: () => void = () => {};
  const gate = new Promise<void>((resolve) => { releaseBom = () => resolve(undefined); });
  let roofBomReturned = false;
  const inner = vi.mocked(fetch).getMockImplementation()!;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    if (!String(input).includes("/api/bom")) return inner(input, init);
    await gate;
    const response = await inner(input, init);
    roofBomReturned = true;
    return response;
  }));
  await user.selectOptions(screen.getByLabelText("Roof"), "grid");
  releaseBom();
  await waitFor(() => {
    expect(roofBomReturned).toBe(true);
    expect(persistedAssembleDone()).toEqual({ "L1 · S5 2U drawers|Latch": false });
  });
  await user.click(screen.getByRole("button", { name: "Undo" }));
  expect(await screen.findByText("3 boxes · empty · no lock")).toBeInTheDocument();
  await waitFor(() => {
    expect(persistedAssembleDone()["L2 · SS5 2U drawers|Latch"]).toBe(false);
  });
  expect(screen.getByLabelText("Roof")).toHaveValue("grid");
});

test("checking the normalized survivor in Assemble keeps Undo from reverting it to SS", async () => {
  const user = userEvent.setup();
  seedSsStack();
  render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  await user.click(screen.getByRole("button", { name: "Remove L drawer" }));
  await screen.findByText("2 boxes · empty · no lock");
  await waitFor(() => {
    expect(persistedAssembleDone()).toEqual({ "L1 · S5 2U drawers|Latch": false });
  });
  // A newer edit under the renamed S group: check the survivor off.
  await user.click(screen.getByRole("tab", { name: "4 Assemble" }));
  await user.click(screen.getByRole("checkbox", { name: "2× Latch" }));
  await user.click(screen.getByRole("tab", { name: /Design/ }));
  await user.click(screen.getByRole("button", { name: "Undo" }));
  // The base returns, but the survivor stays S so its check keeps applying;
  // reverting to SS would orphan it under the obsolete S-group key.
  await waitFor(() => {
    expect(persistedLayouts()).toEqual(["L", "S"]);
    expect(persistedAssembleDone()["L2 · S5 2U drawers|Latch"]).toBe(true);
  });
});

test("a test-plate group removed from the stack no longer enables export", async () => {
  const user = userEvent.setup();
  const layer = {
    type: "Drawers", layout: "S", height: 2, facades: [[2]], interior: "none", key: "key",
    labels: true, rails: false, manualSupports: false, variant: "Flat", baseplate: false,
    gridW: 1, gridD: 1, divW: 1, divD: 2,
  };
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "stack",
    stack: { name: "my-vault", depth: 5, layers: [layer], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: { ...meta.defaults },
    tests: { pegboard: true },
  }));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Compose your stack" })).toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "3 Plates" }));
  expect(screen.getByRole("checkbox", { name: "module" })).not.toBeChecked();
  expect(await screen.findByRole("button", { name: "Export test plates" })).toBeDisabled();
});

test("preset upload status names each slicer outcome", async () => {
  const user = userEvent.setup();
  const base = vi.mocked(fetch).getMockImplementation()!;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/presets_upload")) return json({ saved: { bambu: "1 preset files", orca: "installed here: its own folder is used" } });
    if (url.includes("/api/meta")) return json({ ...meta, local: false });
    return base(input, init);
  }));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Compose your stack" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(screen.getByRole("button", { name: "Printers" }));
  await user.click(screen.getByText("No tall parts, nozzle and process preset"));
  const makeFile = (path: string) => {
    const file = new File(["{}"], String(path.split("/").pop()), { type: "application/json" });
    Object.defineProperty(file, "webkitRelativePath", { value: path });
    Object.defineProperty(file, "text", { value: async () => "{}" }); // jsdom File has no text()
    return file;
  };
  fireEvent.change(screen.getByLabelText("Slicer folder"), {
    target: { files: [makeFile("BambuStudio/user/1/process/a.json"), makeFile("OrcaSlicer/user/default/process/b.json")] },
  });
  expect(await screen.findByText("bambu: 1 preset files; orca: installed here: its own folder is used")).toBeInTheDocument();
});

test("printer Undo survives leaving and returning to the Printers section", async () => {
  const user = userEvent.setup();
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "stack",
    stack: { name: "my-vault", depth: 5, layers: [], roof: { type: "none", topHandle: true }, mods: { backbone: "none", pegboard: "none" } },
    settings: { ...meta.defaults },
  }));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Compose your stack" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(screen.getByRole("button", { name: "Remove P1S" }));
  await user.click(screen.getByRole("button", { name: "Remove P1S" }));
  expect(JSON.parse(localStorage.getItem("vault-configurator") || "{}").settings.printers.some((printer: { id: string }) => printer.id === "p1s")).toBe(false);
  await user.click(screen.getByRole("button", { name: "Filaments" }));
  await user.click(screen.getByRole("button", { name: "Close settings" }));
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(screen.getByRole("button", { name: "Printers" }));
  await user.click(await screen.findByRole("button", { name: "Undo" }));
  expect(JSON.parse(localStorage.getItem("vault-configurator") || "{}").settings.printers.some((printer: { id: string }) => printer.id === "p1s")).toBe(true);
});

test("a BOM result keeps an assemble check and a stale stack is dropped", () => {
  const layer = {
    type: "Drawers", layout: "S", height: 2, facades: [[2]], interior: "none", key: "key",
    labels: true, rails: false, manualSupports: false, variant: "Flat", baseplate: false, gridW: 1, gridD: 1, divW: 1, divD: 2,
  };
  const prev = {
    tab: "assemble",
    fitTarget: "every",
    fitOnly: false,
    help: true,
    merge: false,
    stack: { name: "my-vault", depth: 5, layers: [layer], roof: { type: "none", topHandle: true }, mods: {} },
    settings: meta.defaults,
    overrides: {},
    tests: {},
    projects: [],
    activeProjectId: "",
    progress: { layoutKey: "keep", plates: {}, hardware: {}, assemble: { "L1|Box": { qty: 1, done: true } } },
  } as PlannerState;
  const requestSig = signature(prev);
  const bom = {
    parts: [{ group: "L1", name: "Box", qty: 1, role: "main" }],
    hardware: [],
    warnings: [],
    stack: prev.stack,
  };
  const kept = applyBomResult(prev, requestSig, bom);
  expect(kept.progress.assemble?.["L1|Box"]?.done).toBe(true);
  const edited = { ...prev, stack: { ...prev.stack, depth: 7 } };
  expect(applyBomResult(edited, requestSig, bom)).toBe(edited);
});

test("a plan keeps the part rows already on prev and drops a stale stack", () => {
  const layer = {
    type: "Drawers", layout: "S", height: 2, facades: [[2]], interior: "none", key: "key",
    labels: true, rails: false, manualSupports: false, variant: "Flat", baseplate: false, gridW: 1, gridD: 1, divW: 1, divD: 2,
  };
  const prev = {
    tab: "plates",
    fitTarget: "every",
    fitOnly: false,
    help: true,
    merge: false,
    stack: { name: "my-vault", depth: 5, layers: [layer], roof: { type: "none", topHandle: true }, mods: {} },
    settings: meta.defaults,
    overrides: {},
    tests: {},
    projects: [],
    activeProjectId: "",
    progress: {
      layoutKey: "layout",
      plates: {},
      hardware: { Screws: { qty: 4, done: true } },
      assemble: { "L1|Box": { qty: 1, done: true } },
    },
  } as PlannerState;
  const requestSig = signature(prev);
  const plan = { plates: [], fingerprint: "layout", pieces: 0, placed: 0 };
  const kept = applyPlanProgress(prev, requestSig, plan, null);
  expect(kept.state.progress.assemble?.["L1|Box"]?.done).toBe(true);
  expect(kept.state.progress.hardware?.Screws?.done).toBe(true);
  const edited = { ...prev, stack: { ...prev.stack, depth: 7 } };
  expect(applyPlanProgress(edited, requestSig, plan, null).state).toBe(edited);
});

test("the first row is the top module, and that module stays in the base family", async () => {
  const user = userEvent.setup();
  const layer = (type: string) => ({
    type, layout: "S", height: 2, facades: [[2]], interior: "none", key: "key",
    labels: true, rails: false, manualSupports: false, variant: "Flat", baseplate: false,
    gridW: 1, gridD: 1, divW: 1, divD: 2,
  });
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "stack",
    stack: {
      name: "my-vault",
      depth: 5,
      layers: [layer("Drawers"), layer("Sustainers")],
      roof: { type: "none", topHandle: true },
      mods: { backbone: "none", pegboard: "none" },
    },
    settings: meta.defaults,
  }));
  render(<App />);
  expect(await screen.findByText("Pick a depth, stack layers so the first row is the top of the stack, finish with a roof.")).toBeInTheDocument();
  expect(screen.getByText("Top of the list is the top of the stack.")).toBeInTheDocument();
  expect(screen.queryByText(/bottom-up/)).not.toBeInTheDocument();
  expect(screen.queryByText(/first layer is the top/)).not.toBeInTheDocument();

  expect(screen.getAllByRole("button", { name: /^Edit / }).map((button) => button.getAttribute("aria-label"))).toEqual([
    "Edit S sustainer",
    "Edit S drawer",
  ]);
  expect(screen.getAllByText(/^Layer \d/, { selector: "strong" }).map((node) => node.textContent)).toEqual([
    "Layer 2 · S 2U Sustainers",
    "Layer 1 · S 2U Drawers",
  ]);

  await user.click(screen.getByRole("button", { name: "Edit S sustainer" }));
  expect([...screen.getByLabelText("Width").querySelectorAll("option")].map((option) => option.value)).toEqual(["S"]);
});

test("a body nest keeps the charcoal fill and leaves the edge to the plate outline", async () => {
  const layer = {
    type: "Drawers", layout: "S", height: 2, facades: [[2]], interior: "none", key: "key",
    labels: true, rails: false, manualSupports: false, variant: "Flat", baseplate: false,
    gridW: 1, gridD: 1, divW: 1, divD: 2,
  };
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "plates",
    stack: { name: "my-vault", depth: 5, layers: [layer], roof: { type: "none", topHandle: true }, mods: {} },
    settings: meta.defaults,
  }));
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo) => {
    const url = String(input);
    if (url.includes("/api/meta")) return json(meta);
    if (url.includes("/api/presets")) return json({});
    if (url.includes("/api/progress")) return json({ done: 0, total: 0 });
    if (url.includes("/api/bom")) return json({ parts: [], hardware: [], warnings: [], choices: null, judged: { scope: "every", printers: [] }, estimate: { wallMm: 0.8, infill: 0.21, preset: null, printer: "P1S" } });
    if (url.includes("/api/plan")) {
      return json({
        plan: {
          fingerprint: "nest",
          unplaceable: [],
          plates: [
            { printer: "p1s", name: "Body", slots: [0], bed: [256, 256], items: [{ part: "Module", slot: 0, corners: [[8, 8], [120, 8], [120, 70], [8, 70]] }] },
            { printer: "p1s", name: "Drawers", slots: [1], bed: [256, 256], items: [{ part: "Drawer", slot: 1, corners: [[8, 8], [120, 8], [120, 70], [8, 70]] }] },
          ],
        },
      });
    }
    return json({ error: url }, 500);
  }));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Plate 1 · Body" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Plate 2 · Drawers" })).toBeInTheDocument();
  const parts = document.querySelectorAll(".bed-part");
  expect(parts).toHaveLength(2);
  expect(parts[0]).toHaveAttribute("fill", "#2a2b2e");
  expect(parts[1]).toHaveAttribute("fill", "#ece6d9");
  expect(parts[0].getAttribute("stroke")).toBeNull();
  expect(parts[1].getAttribute("stroke")).toBeNull();
});

test("opening Plates requests a plan without another stack edit", async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: "Compose your stack" });
  await user.click(screen.getByRole("button", { name: "Add layer" }));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
  const plans = () => vi.mocked(fetch).mock.calls.filter((call) => String(call[0]).includes("/api/plan")).length;
  expect(plans()).toBe(0);
  await user.click(screen.getByRole("tab", { name: "3 Plates" }));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
  expect(plans()).toBeGreaterThan(0);
});

test("the 3D viewer takes focus on open and hands it back to the part card on Escape", async () => {
  const user = userEvent.setup();
  const layer = {
    type: "Drawers", layout: "S", height: 2, facades: [[2]], interior: "none", key: "key",
    labels: true, rails: false, manualSupports: false, variant: "Flat", baseplate: false,
    gridW: 1, gridD: 1, divW: 1, divD: 2,
  };
  localStorage.setItem("vault-configurator", JSON.stringify({
    tab: "parts",
    stack: { name: "my-vault", depth: 5, layers: [layer], roof: { type: "none", topHandle: true }, mods: {} },
    settings: meta.defaults,
  }));
  const base = vi.mocked(fetch).getMockImplementation()!;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    if (String(input).includes("/api/bom")) {
      return json({
        parts: [{ group: "L1 · S 2U", name: "S Box", qty: 1, role: "box", file: "S/box.stl", fits: {} }],
        hardware: [], warnings: [], choices: null, judged: { scope: "every", printers: [] },
        estimate: { wallMm: 0.8, infill: 0.21, preset: null, printer: "P1S" },
      });
    }
    return base(input, init);
  }));
  render(<App />);
  const card = await screen.findByRole("button", { name: "View S Box in 3D" });
  await user.click(card);
  const dialog = await screen.findByRole("dialog", { name: "S Box" });
  expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(within(dialog).getByRole("button", { name: "Close" })).toHaveFocus();

  // Clicking non-focusable dialog content drops focus to <body>; Tab must still be contained.
  await user.click(within(dialog).getByText("S Box", { selector: "strong" }));
  await user.tab({ shift: true });
  expect(within(dialog).getByRole("img", { name: /3D view of S Box/ })).toHaveFocus();
  await user.click(within(dialog).getByText("S Box", { selector: "strong" }));
  await user.tab();
  expect(within(dialog).getByRole("button", { name: "Download STL" })).toHaveFocus();
  // Ordinary boundary wrap still holds.
  await user.tab({ shift: true });
  expect(within(dialog).getByRole("img", { name: /3D view of S Box/ })).toHaveFocus();

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "S Box" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "View S Box in 3D" })).toHaveFocus();

  await user.click(screen.getByRole("button", { name: "View S Box in 3D" }));
  await user.click(within(await screen.findByRole("dialog", { name: "S Box" })).getByRole("button", { name: "Close" }));
  expect(screen.getByRole("button", { name: "View S Box in 3D" })).toHaveFocus();
});
