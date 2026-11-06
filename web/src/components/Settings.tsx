import { type InputHTMLAttributes } from "react";
import { printerLabel, spoolLabel } from "../../../planner.mjs";
import { presetsFor } from "../presets";
import { usePlanner } from "../store";
import type { Printer, SettingsSection } from "../types";

const SECTIONS: Array<{ id: SettingsSection; label: string }> = [
  { id: "printers", label: "Printers" },
  { id: "filaments", label: "Filaments" },
  { id: "appearance", label: "Appearance" },
];

export function Settings() {
  const store = usePlanner();
  return (
    <div className="page">
      <div className="card-head">
        <div>
          <h1>Settings</h1>
          <p className="lede">Your printers, filament on hand, and appearance. Set once, used by every build.</p>
        </div>
        <button type="button" className="btn" aria-label="Close settings" onClick={() => store.setSettingsOpen(false)}>← Close settings</button>
      </div>
      <div className="settings">
        <nav className="settings-nav" aria-label="Settings">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              aria-current={store.settingsSection === section.id ? "page" : undefined}
              onClick={() => store.setSettingsSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>
        <Section />
      </div>
    </div>
  );
}

function Section() {
  const { settingsSection } = usePlanner();
  switch (settingsSection) {
    case "printers":
      return <Printers />;
    case "filaments":
      return <Filaments />;
    case "appearance":
      return <Appearance />;
    default: {
      const neverSection: never = settingsSection;
      return neverSection;
    }
  }
}

function Printers() {
  const { state, meta, presets, patch, showHelp } = usePlanner();
  return (
    <section className="card">
      <h2>Printers</h2>
      <p className="note">The name is the label in the header, on plates, and in the fit list. The profile is the slicer machine preset and can stay longer, for example Snapmaker U1.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Use</th><th>Name</th><th>Bed</th><th>Z</th><th>Profile</th><th></th></tr>
          </thead>
          <tbody>
            {state.settings.printers.map((printer) => (
              <tr key={printer.id}>
                <td>
                  <input aria-label={`Enabled ${printerLabel(printer) || printer.id}`} type="checkbox" checked={printer.enabled !== false} onChange={(event) => patch((draft) => {
                    const row = findPrinter(draft.settings.printers, printer.id);
                    row.enabled = event.target.checked;
                  })} />
                </td>
                <td><input aria-label={`Name for ${printer.id}`} value={printer.name} onChange={(event) => patch((draft) => { findPrinter(draft.settings.printers, printer.id).name = event.target.value; })} /></td>
                <td className="mono">
                  <input aria-label={`Bed X for ${printer.id}`} type="number" value={printer.bed[0]} onChange={(event) => patch((draft) => { findPrinter(draft.settings.printers, printer.id).bed[0] = Number(event.target.value); })} />
                  <input aria-label={`Bed Y for ${printer.id}`} type="number" value={printer.bed[1]} onChange={(event) => patch((draft) => { findPrinter(draft.settings.printers, printer.id).bed[1] = Number(event.target.value); })} />
                </td>
                <td><input aria-label={`Z for ${printer.id}`} type="number" value={printer.z} onChange={(event) => patch((draft) => { findPrinter(draft.settings.printers, printer.id).z = Number(event.target.value); })} /></td>
                <td><input aria-label={`Profile for ${printer.id}`} value={printer.profile || ""} onChange={(event) => patch((draft) => { findPrinter(draft.settings.printers, printer.id).profile = event.target.value; })} /></td>
                <td><button type="button" className="icon-btn" aria-label={`Remove ${printerLabel(printer) || printer.id}`} onClick={() => patch((draft) => {
                  draft.settings.printers = draft.settings.printers.filter((row) => row.id !== printer.id);
                })}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="field" onClick={() => showHelp("addPrinter")}>
        <span>Add printer</span>
        <select aria-label="Add printer" value="" onChange={(event) => {
          const choice = event.target.value;
          if (!choice) return;
          patch((draft) => {
            const catalog = choice === "custom"
              ? { name: "My printer", profile: "", bed: [220, 220] as [number, number], z: 250, slicer: "orca" }
              : meta.printerCatalog[Number(choice)];
            const base = catalog.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            let id = base;
            let n = 2;
            while (draft.settings.printers.some((row) => row.id === id)) id = `${base}-${n++}`;
            draft.settings.printers.push({
              ...catalog,
              bed: [catalog.bed[0], catalog.bed[1]],
              id,
              maxH: catalog.z,
              enabled: true,
              forExport: true,
              nozzle: "0.4",
              preset: "",
            });
          });
        }}>
          <option value="">Choose a printer…</option>
          {meta.printerCatalog.map((printer, index) => <option key={printer.name} value={index}>{printer.name}</option>)}
          <option value="custom">Custom printer</option>
        </select>
      </label>
      <details>
        <summary>No tall parts, nozzle and process preset</summary>
        {state.settings.printers.map((printer) => {
          const noTall = (printer.maxH || printer.z) < printer.z;
          const rows = presetsFor(presets, printer);
          return (
            <div key={printer.id} className="editor">
              <strong>{printerLabel(printer)}</strong>
              <label className="check">
                <input type="checkbox" checked={noTall} onChange={(event) => patch((draft) => {
                  const row = findPrinter(draft.settings.printers, printer.id);
                  row.maxH = event.target.checked ? Math.min(row.maxH || 120, row.z - 1) : row.z;
                })} />
                No tall parts
              </label>
              <label className="field">Nozzle
                <input aria-label={`Nozzle for ${printer.id}`} value={printer.nozzle || "0.4"} onChange={(event) => patch((draft) => { findPrinter(draft.settings.printers, printer.id).nozzle = event.target.value; })} />
              </label>
              <label className="field">Machine preset
                <input aria-label={`Machine preset for ${printer.id}`} value={printer.machine || ""} onChange={(event) => patch((draft) => { findPrinter(draft.settings.printers, printer.id).machine = event.target.value; })} />
              </label>
              <label className="field">Process preset
                <select aria-label={`Process preset for ${printer.id}`} value={printer.preset || ""} onChange={(event) => patch((draft) => { findPrinter(draft.settings.printers, printer.id).preset = event.target.value; })}>
                  <option value="">(none found)</option>
                  {rows.map((row) => <option key={row.name} value={row.name}>{row.name}</option>)}
                </select>
              </label>
            </div>
          );
        })}
        <PresetUpload />
      </details>
    </section>
  );
}

function findPrinter(printers: Printer[], id: string): Printer {
  const row = printers.find((printer) => printer.id === id);
  if (!row) throw new Error(`missing printer ${id}`);
  return row;
}

function PresetUpload() {
  const store = usePlanner();
  if (store.meta.local) return <p className="note">Presets are read from the slicer installed on this computer.</p>;
  return (
    <div>
      <p className="note">On a container or NAS, send your Bambu Studio, Anycubic Slicer Next, or OrcaSlicer settings folder.</p>
      <input
        {...({ "aria-label": "Slicer folder", type: "file", webkitdirectory: "" } as InputHTMLAttributes<HTMLInputElement>)}
        onChange={(event) => {
        if (event.target.files) void store.uploadPresets(event.target.files);
        event.target.value = "";
      }} />
      <p className="note">{store.presetStatus}</p>
      <button type="button" className="btn" onClick={() => void store.rescanPresets()}>Rescan presets</button>
    </div>
  );
}

function Filaments() {
  const store = usePlanner();
  const { state, meta, patch, showHelp } = store;
  const materials = meta.materials.length ? meta.materials : ["PLA", "PETG", "TPU"];
  return (
    <section className="card">
      <h2>Filaments</h2>
      <p className="note">Shelf stock. Parts assigns these slots to colour roles.</p>
      {state.settings.filaments.map((filament, index) => (
        <div key={index} className="editor">
          <label className="field">Colour
            <input aria-label={`Colour ${index + 1}`} type="color" value={toColor(filament.color)} onChange={(event) => patch((draft) => { draft.settings.filaments[index].color = event.target.value; })} />
          </label>
          <label className="field">Material
            <select aria-label={`Material ${index + 1}`} value={filament.material} onChange={(event) => patch((draft) => { draft.settings.filaments[index].material = event.target.value; })}>
              {materials.map((material) => <option key={material} value={material}>{material}</option>)}
            </select>
          </label>
          <label className="field">Name
            <input aria-label={`Filament name ${index + 1}`} value={filament.name} onChange={(event) => patch((draft) => { draft.settings.filaments[index].name = event.target.value; })} />
          </label>
          <span className="note">{spoolLabel(filament)}</span>
        </div>
      ))}
      <details>
        <summary onClick={() => showHelp("spoolman")}>Spoolman</summary>
        <label className="field">Server
          <input aria-label="Spoolman server" value={state.settings.spoolman || ""} placeholder="http://192.168.1.10:7912" onChange={(event) => patch((draft) => { draft.settings.spoolman = event.target.value.trim(); })} />
        </label>
        <button type="button" className="btn" onClick={() => void store.loadSpools()}>Load spools</button>
        <SpoolStatus />
      </details>
    </section>
  );
}

function SpoolStatus() {
  const { spoolStatus, spools, state } = usePlanner();
  return (
    <div>
      <p className="note">{spoolStatus}</p>
      {spools.map((spool) => (
        <span key={spool.id} className="chip">{spool.label || spool.name}</span>
      ))}
      <p className="visually-hidden">{state.settings.spoolman}</p>
    </div>
  );
}

function Appearance() {
  const { theme, setTheme } = usePlanner();
  const choices = [
    ["light", "Light"],
    ["dark", "Dark"],
    ["system", "System"],
  ] as const;
  return (
    <section className="card">
      <h2>Appearance</h2>
      <p className="note">System follows your OS light/dark setting.</p>
      <div className="segment" role="group" aria-label="Theme">
        {choices.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={theme === id} onClick={() => setTheme(id)}>{label}</button>
        ))}
      </div>
    </section>
  );
}

function toColor(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#888888";
}
