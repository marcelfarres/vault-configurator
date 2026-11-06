import { footprintLine } from "../../../planner.mjs";
import { HELP } from "../help";
import { INTERIOR_LABEL, LAYOUT_LABEL, ROOF_LABEL, depthOptionLabel, labeledChoices, layerTitle, patternName } from "../labels";
import { facadeCatalog, heightCatalog, layerFitNotes, layoutCatalog } from "../stack";
import { usePlanner } from "../store";
import type { Layer } from "../types";
import { Card, ChoiceSelect, Grip, Switch } from "./ui";
import { Preview } from "./Preview";

export function Design() {
  const store = usePlanner();
  const { state, meta, bom, patch, showHelp } = store;
  const depth = labeledChoices("depth", {
    choices: bom?.choices || null,
    catalog: meta.depths,
    fitOnly: state.fitOnly,
    current: state.stack.depth,
  }, depthOptionLabel);
  const roof = labeledChoices("roof", {
    choices: bom?.choices || null,
    catalog: meta.roofs,
    fitOnly: state.fitOnly,
    current: state.stack.roof?.type || "none",
  }, (value) => ROOF_LABEL[String(value)] || String(value));
  const fitLine = state.stack.layers.length
    ? footprintLine(state.fitTarget, state.settings.printers.find((printer) => printer.id === state.fitTarget))
    : "Depth and roof stay available before the first layer.";
  const mods = state.stack.mods || {};
  const backbone = String(mods.backbone || "none");
  const pegboard = String(mods.pegboard || "none");
  const indexed = meta.files
    ? (archivePhrase(store.archive))
    : "archive not connected";

  return (
    <div className="page">
      {!meta.files ? <Onboard /> : null}
      <p className="note">{meta.files} STL files indexed · {indexed}</p>
      <h1>Compose your stack</h1>
      <p className="lede">Pick a depth, stack layers so the first row is the top of the stack, finish with a roof.</p>
      <div className="compose">
        <div className="col">
          <Card title="Footprint">
            <ChoiceSelect label="Depth" help="depth" view={depth} onChange={(value) => patch((draft) => {
              draft.stack.depth = Number(value);
            })} />
            <p className="hint">{fitLine}</p>
          </Card>
          <Card
            title="Layers"
            extra={<button type="button" className="btn" aria-label="Add layer" onClick={() => { store.addLayer(); store.setExpandedLayer(state.stack.layers.length); }}>+ Add layer</button>}
          >
            <p className="note">Top of the list is the top of the stack.</p>
            <label className="check">
              <input type="checkbox" checked={state.help !== false} onChange={(event) => patch((draft) => { draft.help = event.target.checked; })} />
              Explain an option when you click it, in the Help box under the drawing
            </label>
            {!state.stack.layers.length ? <p className="note">No layers yet. Add a layer: the first row is the top, and the bottom layer sets the width family.</p> : null}
            {[...state.stack.layers.keys()].reverse().map((index) => (
              <LayerCard key={index} index={index} />
            ))}
            <button type="button" className="btn ghost" onClick={() => patch((draft) => {
              draft.stack.layers = [];
              draft.overrides = {};
              draft.stack.roof = { type: "none", topHandle: true };
              draft.stack.mods = { backbone: "none", pegboard: "none" };
            })}>Start over</button>
          </Card>
          <Card title="Finish">
            <ChoiceSelect label="Roof" help="roof" view={roof} onChange={(value) => patch((draft) => {
              draft.stack.roof = { ...draft.stack.roof, type: value };
            })} />
            {state.stack.roof?.type === "grid" ? (
              <label className="check" onClick={() => showHelp("topHandle")}>
                <input type="checkbox" checked={state.stack.roof.topHandle !== false} onChange={(event) => patch((draft) => {
                  draft.stack.roof.topHandle = event.target.checked;
                })} />
                Top handle
              </label>
            ) : null}
            <div className="finish-row">
              <span onClick={() => showHelp("backbone")}>Backbone</span>
              <Switch pressed={backbone !== "none"} label="Backbone" onToggle={(on) => patch((draft) => {
                draft.stack.mods.backbone = on ? "wide" : "none";
              })} />
            </div>
            {backbone !== "none" ? (
              <label className="field">
                <span>Backbone style</span>
                <select aria-label="Backbone style" value={backbone} onChange={(event) => patch((draft) => { draft.stack.mods.backbone = event.target.value; })}>
                  <option value="wide">Wide (family width)</option>
                  <option value="universal">Universal (2 per layer)</option>
                </select>
              </label>
            ) : null}
            <div className="finish-row">
              <span onClick={() => showHelp("pegboard")}>Pegboard back</span>
              <Switch pressed={pegboard !== "none"} label="Pegboard back" onToggle={(on) => patch((draft) => {
                draft.stack.mods.pegboard = on ? "ussa" : "none";
              })} />
            </div>
            {pegboard !== "none" ? (
              <label className="field">
                <span>Pegboard</span>
                <select aria-label="Pegboard style" value={pegboard} onChange={(event) => patch((draft) => { draft.stack.mods.pegboard = event.target.value; })}>
                  <option value="ussa">USSA</option>
                  <option value="ikea">IKEA Skadis</option>
                </select>
              </label>
            ) : null}
            <details>
              <summary>Base, wheels, handles and wall mounts</summary>
              <div className="editor">
                {([
                  ["base", "Base"],
                  ["wheels", "Wheels"],
                  ["feet", "Feet"],
                  ["casters", "Casters (hardware only)"],
                  ["pullout", "Pull-out handle"],
                  ["stationary", "Stationary handle"],
                  ["connectors", "Module connectors"],
                  ["wallmount", "Wall mounts"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="check" onClick={() => showHelp(key)}>
                    <input type="checkbox" checked={!!mods[key]} onChange={(event) => patch((draft) => { draft.stack.mods[key] = event.target.checked; })} />
                    {label}
                  </label>
                ))}
              </div>
            </details>
          </Card>
          <Card title="Import">
            <details>
              <summary>Import a stack from ussadesign.com</summary>
              <p className="note">PDF: on the VAULT page press Export and load that “Your build” file. JSON: paste the site’s saved composer value. Check the layer order afterwards.</p>
              <input aria-label="Import PDF" type="file" accept=".pdf,application/pdf" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void store.importPdf(file);
                event.target.value = "";
              }} />
              <p className="note">{store.importStatus}</p>
              <textarea aria-label="Import JSON" rows={4} placeholder='{"version":2,"layers":[{"type":"Drawers","layout":"S","height":2,"facades":[[2]]}]}' id="import-json" />
              <button type="button" className="btn" onClick={() => {
                const box = document.querySelector<HTMLTextAreaElement>("#import-json");
                if (!box) return;
                try {
                  const payload = JSON.parse(box.value) as { layers?: Layer[] };
                  store.importLayers(payload.layers || []);
                } catch (error) {
                  window.alert(error instanceof Error ? error.message : "Could not parse that JSON.");
                }
              }}>Import layers</button>
            </details>
          </Card>
        </div>
        <div className="col">
          <Preview />
          <HelpCard />
        </div>
      </div>
      <PartsInStack />
    </div>
  );
}

function archivePhrase(archive: { done: number; total: number }) {
  if (archive.total && archive.done < archive.total) return `measuring geometry ${archive.done}/${archive.total}`;
  return "archive indexed";
}

function LayerCard({ index }: { index: number }) {
  const store = usePlanner();
  const { state, meta, bom, patch } = store;
  const layer = state.stack.layers[index];
  const open = store.expandedLayer === index;
  const notes = layerFitNotes(bom, index);
  const typeView = labeledChoices("type", {
    choices: bom?.choices?.layers?.[index]?.type ? { type: bom.choices.layers[index].type } : null,
    catalog: meta.layerTypes,
    fitOnly: state.fitOnly,
    current: layer.type,
  }, (value) => String(value));
  const widthView = labeledChoices("layout", {
    choices: bom?.choices?.layers?.[index]?.layout ? { layout: bom.choices.layers[index].layout } : null,
    catalog: layoutCatalog(meta, state.stack, index),
    fitOnly: state.fitOnly,
    current: layer.layout,
  }, (value) => LAYOUT_LABEL[String(value)] || String(value));
  const heightView = labeledChoices("height", {
    choices: bom?.choices?.layers?.[index]?.height ? { height: bom.choices.layers[index].height } : null,
    catalog: heightCatalog(meta, layer.layout),
    fitOnly: state.fitOnly,
    current: layer.height,
  }, (value) => `${value}U`);
  const bays = meta.layouts[layer.layout] || [layer.layout];
  const title = layerTitle(layer);
  return (
    <div
      className="layer"
      draggable
      onDragStart={() => store.setExpandedLayer(index)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const from = Number(event.dataTransfer.getData("text/plain"));
        if (Number.isFinite(from)) store.moveLayer(from, index - from);
      }}
    >
      <div className="layer-row">
        <span
          className="grip"
          draggable
          onDragStart={(event) => event.dataTransfer.setData("text/plain", String(index))}
          title="Drag to reorder"
        >
          <Grip />
        </span>
        <button type="button" className="name" aria-expanded={open} aria-label={`Edit ${title}`} onClick={() => store.setExpandedLayer(open ? null : index)}>
          {title}
          {notes.some((note) => note.includes("does not fit")) ? <span className="bad"> · does not fit</span> : null}
        </button>
        <span className="pill">{layer.height}U</span>
        <button type="button" className="icon-btn" aria-label={`Remove ${title}`} onClick={() => store.removeLayer(index)}>×</button>
      </div>
      {open ? (
        <div className="editor">
          <ChoiceSelect label="Type" help="type" view={typeView} onChange={(value) => patch((draft) => { draft.stack.layers[index].type = value; })} />
          <ChoiceSelect label="Width" help="width" view={widthView} onChange={(value) => patch((draft) => { draft.stack.layers[index].layout = value; })} />
          <ChoiceSelect label="Height" help="height" view={heightView} onChange={(value) => patch((draft) => { draft.stack.layers[index].height = Number(value); })} />
          {layer.type === "Drawers" ? bays.map((_bay, bayIndex) => {
            const entries = bom?.choices?.layers?.[index]?.facades?.[bayIndex];
            const current = JSON.stringify(layer.facades?.[bayIndex] || [layer.height]);
            const view = labeledChoices("facades", {
              choices: entries ? { facades: entries } : null,
              catalog: facadeCatalog(meta, layer.height),
              fitOnly: state.fitOnly,
              current,
            }, patternName);
            return (
              <ChoiceSelect
                key={bayIndex}
                label={bays.length > 1 ? `Bay ${bayIndex + 1} facades` : "Facades"}
                help="facades"
                view={view}
                onChange={(value) => patch((draft) => {
                  const next = JSON.parse(value) as number[];
                  draft.stack.layers[index].facades[bayIndex] = next;
                })}
              />
            );
          }) : null}
          {layer.type === "Drawers" ? (
            <>
              <ChoiceSelect
                label="Interior"
                help="interior"
                view={labeledChoices("interior", {
                  choices: bom?.choices?.layers?.[index]?.interior ? { interior: bom.choices.layers[index].interior } : null,
                  catalog: meta.drawerInteriors,
                  fitOnly: state.fitOnly,
                  current: layer.interior,
                }, (value) => INTERIOR_LABEL[String(value)] || String(value))}
                onChange={(value) => patch((draft) => { draft.stack.layers[index].interior = value; })}
              />
              <label className="field">
                <span>Lock</span>
                <select aria-label="Lock" value={layer.key} onFocus={() => store.showHelp("key")} onChange={(event) => patch((draft) => { draft.stack.layers[index].key = event.target.value; })}>
                  <option value="key">key</option>
                  <option value="hidden">hidden key</option>
                  <option value="none">none</option>
                </select>
              </label>
              <Flag index={index} field="labels" label="labels" help="labels" />
              <Flag index={index} field="rails" label="geared rails" help="rails" />
              <Flag index={index} field="manualSupports" label="manual support wall" help="manualSupports" />
              {layer.interior === "grid" ? (
                <>
                  <NumberField index={index} field="gridW" label="Width dividers" />
                  <NumberField index={index} field="gridD" label="Depth dividers" />
                </>
              ) : null}
            </>
          ) : (
            <>
              {familyWide(metaFamily(store.meta, layer.layout)) ? (
                <ChoiceSelect
                  label="Interior"
                  help="variant"
                  view={labeledChoices("interior", {
                    choices: bom?.choices?.layers?.[index]?.interior ? { interior: bom.choices.layers[index].interior } : null,
                    catalog: meta.sustainerInteriors,
                    fitOnly: state.fitOnly,
                    current: layer.variant,
                  }, (value) => INTERIOR_LABEL[String(value)] || String(value))}
                  onChange={(value) => patch((draft) => { draft.stack.layers[index].variant = value; })}
                />
              ) : (
                <Flag index={index} field="dividers" label="dividers" help="dividers" />
              )}
              <Flag index={index} field="baseplate" label="Gridfinity baseplate" help="baseplate" />
            </>
          )}
          <button type="button" className="btn" onClick={() => store.moveLayer(index, 1)}>Move toward top</button>
          <button type="button" className="btn" onClick={() => store.moveLayer(index, -1)}>Move toward base</button>
          {notes.slice(0, 3).map((note) => <p key={note} className="warn">{note}</p>)}
        </div>
      ) : null}
    </div>
  );
}

function metaFamily(meta: { layoutFamily: Record<string, string> }, layout: string) {
  return meta.layoutFamily[layout] || layout;
}

function familyWide(family: string) {
  return family === "L" || family === "XL";
}

function Flag({ index, field, label, help }: { index: number; field: "labels" | "rails" | "manualSupports" | "baseplate" | "dividers"; label: string; help: string }) {
  const { state, patch, showHelp } = usePlanner();
  const layer = state.stack.layers[index];
  const checked = field === "dividers" ? !!layer.dividers : !!layer[field];
  return (
    <label className="check" onClick={() => showHelp(help)}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => patch((draft) => {
          const row = draft.stack.layers[index];
          if (field === "dividers") row.dividers = event.target.checked;
          else row[field] = event.target.checked;
        })}
      />
      {label}
    </label>
  );
}

function NumberField({ index, field, label }: { index: number; field: "gridW" | "gridD" | "divW" | "divD"; label: string }) {
  const { state, patch } = usePlanner();
  return (
    <label className="field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        min={0}
        value={state.stack.layers[index][field]}
        onChange={(event) => patch((draft) => { draft.stack.layers[index][field] = Number(event.target.value); })}
      />
    </label>
  );
}

function HelpCard() {
  const { helpTopic } = usePlanner();
  const block = HELP[helpTopic];
  return (
    <section className="card" id="help">
      <h2>Help</h2>
      {block ? (
        <>
          <h3>{block.title}</h3>
          <p>{block.body}</p>
          {block.options?.map((option) => (
            <p key={option.name}><strong>{option.name}.</strong> {option.text}</p>
          ))}
          {block.images?.map((image) => (
            <img key={image} src={`/assets/help/${image}?v=3`} alt="" />
          ))}
        </>
      ) : (
        <p className="note">Click a labelled option. What it changes, the manual page, and the parts in your size show up here.</p>
      )}
    </section>
  );
}

function PartsInStack() {
  const { bom, state } = usePlanner();
  return (
            <section className="card spaced">
      <h2>Parts in this stack</h2>
      {!bom?.parts?.length ? <p className="note">Add a layer. Quantities, size and time show up here.</p> : (
        bom.parts.map((part) => (
          <div key={`${part.group}|${part.name}`} className="partline">
            <span className="swatch" style={{ background: state.settings.filaments[state.settings.roles[part.role] ?? 0]?.color || "#ccc" }} />
            <div>
              <strong>{part.qty}× {part.name}</strong>
              <div className="note">{part.group} · {part.size ? part.size.map((value) => Number(value).toFixed(1)).join("×") : "?"} mm · {part.seconds != null ? `${Math.round(part.seconds / 60)} min` : "time ?"}</div>
            </div>
            <span className={part.fits && Object.values(part.fits).every(Boolean) ? "ok" : "bad"}>
              {part.file ? (part.fits && Object.values(part.fits).every(Boolean) ? "fits" : "does not fit") : "file missing"}
            </span>
          </div>
        ))
      )}
    </section>
  );
}

function Onboard() {
  const { meta } = usePlanner();
  const via = meta.archiveVia === "environment" ? "VAULT_ARCHIVE is set, but that folder does not contain 01. DRAWERS. " : "";
  return (
    <div className="onboard">
      <strong>Point the planner at your VAULT folder</strong>
      <p>{via}The archive is not part of this program. Set VAULT_ARCHIVE to the folder that contains 01. DRAWERS, 02. SUSTAINERS and 03. MODIFICATIONS.</p>
      <p>On a desktop, the starter asks once and remembers the choice in archive-path.txt. In a container — Unraid, Docker, or another NAS — set VAULT_ARCHIVE to the path on the host.</p>
      <p>{meta.handoffNote}</p>
    </div>
  );
}
