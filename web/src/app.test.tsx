import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { App } from "./App";
import { applyBomResult, applyPlanProgress, signature } from "./store";
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
    if (url.includes("/api/sample_plan")) return json({ synthetic: true, plates: [], label: "sample", unplaceable: [] });
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
  const enabled = screen.getByRole("group", { name: "Enabled" });
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
  await user.selectOptions(screen.getByLabelText("All printers"), "u1");
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
  const send = screen.getByLabelText("Send parts to");
  expect([...send.querySelectorAll("option")].map((option) => option.value)).toEqual(["both", "u1", "p1s"]);
  expect(screen.getByRole("button", { name: "Export H2D left" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "Export U1" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("Packing with U1, P1S.")).toBeInTheDocument();
  expect(screen.getByLabelText("All printers").querySelector("option[value='h2d-left']")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Show a sample plate" })).toBeInTheDocument();
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
  expect(screen.getByLabelText("Send parts to")).toHaveValue("u1");
  expect(screen.getByLabelText("All printers")).toHaveValue("h2d-left");
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
  expect(screen.getByLabelText("Send parts to")).toHaveValue("both");
  expect(screen.getByLabelText("All printers")).toHaveValue("every");
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
  await user.selectOptions(screen.getByLabelText("All printers"), "p1s");
  await user.selectOptions(screen.getByLabelText("All printers"), "every");
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
  expect(screen.getByRole("button", { name: "working copy" })).toBeDisabled();
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
