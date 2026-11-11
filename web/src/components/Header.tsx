import { useEffect, useRef, useState } from "react";
import { printerLabel } from "../../../planner.mjs";
import { usePlanner } from "../store";
import type { TabId } from "../types";
import { Icon } from "./ui";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "stack", label: "Design" },
  { id: "parts", label: "Parts" },
  { id: "plates", label: "Plates" },
  { id: "assemble", label: "Assemble" },
];
export function Header() {
  const store = usePlanner();
  const { state, patch } = store;
  const enabled = state.settings.printers.filter((printer) => printer.enabled !== false);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(savedTimer.current), []);
  return (
    <header className="topbar">
      <div className="brand">
        <span className="wordmark">VAULT</span>
        <input
          className="project-name"
          aria-label="Project name"
          value={state.stack.name}
          onChange={(event) => patch((draft) => {
            draft.stack.name = event.target.value;
          })}
        />
      </div>
      <button type="button" className="btn ghost sm" onClick={() => {
        store.saveProject();
        setSaved(true);
        window.clearTimeout(savedTimer.current);
        savedTimer.current = window.setTimeout(() => setSaved(false), 2000);
      }}><Icon name="save" />{saved ? "Saved" : "Save"}</button>
      <details className="load">
        <summary className="btn ghost sm"><Icon name="folder-open" />Load</summary>
        <div className="menu">
          <p className="note">Named projects stay in this browser. Save keeps a named copy here; the working copy autosaves as you go. Save stack on Plates writes a file you can move.</p>
          <button type="button" disabled={!state.activeProjectId} onClick={() => store.loadProject("")}>Working copy</button>
          {state.projects.map((project) => (
            <button type="button" key={project.id} onClick={() => store.loadProject(project.id)}>{project.name || "untitled"}</button>
          ))}
          <button type="button" onClick={() => {
            if (state.stack.layers.length && !window.confirm("Start a new working copy? Save the project first if you want to keep this one.")) return;
            store.newProject();
          }}>New</button>
          <button type="button" disabled={!state.projects.some((item) => item.id === state.activeProjectId)} onClick={() => {
            const id = state.activeProjectId;
            const project = state.projects.find((item) => item.id === id);
            if (!project) return;
            if (!window.confirm(`Delete saved project “${project.name}”?`)) return;
            store.deleteProject(id);
          }}>Delete saved</button>
        </div>
      </details>
      <span className="muted">Enabled</span>
      <span className="fleet" role="group" aria-label="Enabled printers">
        {enabled.length ? enabled.map((printer) => (
          <span className="status-chip" key={printer.id}>{printerLabel(printer)}</span>
        )) : <span className="note">none</span>}
      </span>
      <span className="dots" aria-hidden="true">
        {state.settings.filaments.map((filament) => (
          <i key={filament.name} className="dot" style={{ background: filament.color }} />
        ))}
      </span>
      <span className="muted">{state.settings.filaments.length} filaments</span>
      {store.status ? <span className="muted" role="status">{store.status}</span> : null}
      <div className="fit-controls">
        <label className="check fit-label">
          <input
            type="checkbox"
            checked={state.fitOnly}
            onChange={(event) => patch((draft) => {
              draft.fitOnly = event.target.checked;
            })}
          />
          <span>Only offer choices that fit</span>
        </label>
        <label className="fit-target">
          <span className="visually-hidden">Judge fit against</span>
          <select
            aria-label="Judge fit against"
            value={state.fitTarget}
            onChange={(event) => patch((draft) => {
              draft.fitTarget = event.target.value;
            })}
          >
            <option value="every">All printers</option>
            {enabled.map((printer) => (
              <option key={printer.id} value={printer.id}>{printerLabel(printer)}</option>
            ))}
          </select>
        </label>
      </div>
      <button type="button" className={`btn sm settings-btn${store.settingsOpen ? " primary" : ""}`} onClick={() => store.setSettingsOpen(!store.settingsOpen)}>
        <Icon name="store" />Settings
      </button>
    </header>
  );
}

export function Tabs() {
  const { state, setTab } = usePlanner();
  return (
    <nav className="tabs" aria-label="Steps">
      {TABS.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          data-tab={tab.id}
          aria-selected={state.tab === tab.id}
          aria-label={`${index + 1} ${tab.label}`}
          onClick={() => setTab(tab.id)}
        >
          <span className="tab-num" aria-hidden="true">{index + 1}</span>{tab.label}
        </button>
      ))}
    </nav>
  );
}
