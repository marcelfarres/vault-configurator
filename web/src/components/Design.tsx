import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { footprintLine, partFitsScope } from "../../../planner.mjs";
import { HELP } from "../help";
import { INTERIOR_LABEL, LAYOUT_LABEL, ROOF_LABEL, depthOptionLabel, heightLabel, labeledChoices, layerSummary, layerTitle, patternName, roleColor, stackHeightMm } from "../labels";
import { facadeCatalog, finishCustomized, heightCatalog, isMisfitNote, layerFitNotes, layoutCatalog } from "../stack";
import { usePlanner } from "../store";
import type { Layer } from "../types";
import { Card, ChoiceSelect, Grip, HelpButton, Icon, StepFooter, Switch } from "./ui";
import { Preview } from "./Preview";

export function Design() {
  const store = usePlanner();
  const { state, meta, bom, patch, showHelp, removedLayer, helpTopic } = store;
  const [confirmReset, setConfirmReset] = useState(false);
  // JSON that does not parse is reported next to the box, not in a blocking dialog.
  const [importError, setImportError] = useState("");
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

  const layers = state.stack.layers;
  const units = layers.reduce((sum, layer) => sum + Number(layer.height || 0), 0);
  const misfits = layers.filter((_layer, index) => layerFitNotes(bom, index).some(isMisfitNote)).length;
  const ready = layers.length
    ? `${layers.length} ${layers.length === 1 ? "layer" : "layers"} · ${units}U · ${stackHeightMm(layers, state.stack.roof?.type).toFixed(1)} mm tall${misfits ? ` · ${misfits} ${misfits === 1 ? "layer does" : "layers do"} not fit your printers` : ""}.`
    : "No layers yet. You can continue, but Parts stays empty until the stack has one.";

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
            extra={<button type="button" className="btn sm" aria-label="Add layer" onClick={() => { store.addLayer(); store.setExpandedLayer(state.stack.layers.length); }}><Icon name="plus" />Add layer</button>}
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
            {removedLayer ? (
              <p className="note" role="status">
                {layerTitle(removedLayer.layer)} removed.{" "}
                <button type="button" className="btn" onClick={() => store.restoreLayer()}>Undo</button>
              </p>
            ) : null}
            {confirmReset ? (
              <p className="confirm-remove" role="status">
                <span className="note">Start over {[
                  state.stack.layers.length ? `removes ${state.stack.layers.length} ${state.stack.layers.length === 1 ? "layer" : "layers"}` : null,
                  Object.keys(state.overrides).length ? "discards colour overrides" : null,
                  "resets the roof and mods",
                ].filter(Boolean).join(", ").replace(/, ([^,]*)$/, ", and $1")}.</span>
                <button type="button" className="btn" onClick={() => {
                  setConfirmReset(false);
                  store.startOver();
                }}>Start over</button>
                <button type="button" className="btn" onClick={() => setConfirmReset(false)}>Keep my stack</button>
              </p>
            ) : (
              <button type="button" className="btn ghost" onClick={() => {
                const customized = state.stack.layers.length > 0
                  || Object.keys(state.overrides).length > 0
                  || finishCustomized(state.stack);
                if (customized) setConfirmReset(true);
                else store.startOver();
              }}>Start over</button>
            )}
            <details>
              <summary>Import a stack from ussadesign.com</summary>
              <p className="note">PDF: on the VAULT page press Export and load that “Your build” file. JSON: paste the site’s saved composer value. Check the layer order afterwards.</p>
              <input aria-label="Import PDF" type="file" accept=".pdf,application/pdf" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void store.importPdf(file);
                event.target.value = "";
              }} />
              <p className="note">{store.importStatus}</p>
              <textarea aria-label="Import JSON" rows={4} placeholder='{"version":2,"layers":[{"type":"Drawers","layout":"S","height":2,"facades":[[2]]}]}' id="import-json" aria-invalid={importError ? true : undefined} aria-describedby={importError ? "import-json-error" : undefined} onChange={() => setImportError("")} />
              {importError ? <p className="bad" role="alert" id="import-json-error">{importError}</p> : null}
              <button type="button" className="btn" onClick={() => {
                const box = document.querySelector<HTMLTextAreaElement>("#import-json");
                if (!box) return;
                try {
                  const payload = JSON.parse(box.value) as { layers?: Layer[] };
                  store.importLayers(payload.layers || []);
                  setImportError("");
                } catch (error) {
                  setImportError(error instanceof Error ? error.message : "Could not parse that JSON.");
                }
              }}>Import layers</button>
            </details>
          </Card>
          <Card title="Finish">
            <ChoiceSelect label="Roof" help="roof" view={roof} onChange={(value) => patch((draft) => {
              draft.stack.roof = { ...draft.stack.roof, type: value };
            })} />
            {state.stack.roof?.type === "grid" ? (
              <span className="check-row">
                <label className="check" onClick={() => showHelp("topHandle")}>
                  <input type="checkbox" checked={state.stack.roof.topHandle !== false} onChange={(event) => patch((draft) => {
                    draft.stack.roof.topHandle = event.target.checked;
                  })} />
                  Top handle
                </label>
                <HelpButton topic="topHandle" label="Top handle" />
              </span>
            ) : null}
            <div className="finish-row">
              <span onClick={() => showHelp("backbone")}>Backbone</span>
              <Switch pressed={backbone !== "none"} label="Backbone" onToggle={(on) => patch((draft) => {
                draft.stack.mods.backbone = on ? "wide" : "none";
              })} />
              <HelpButton topic="backbone" label="Backbone" />
            </div>
            <p className="note">Boards bolted up the back of the stack. They carry the handle, pegboard and wall mounts.</p>
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
              <HelpButton topic="pegboard" label="Pegboard back" />
            </div>
            <p className="note">Attachment rails on the back for hanging tools. The pegboard panel itself is bought or printed separately.</p>
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
                  <span key={key} className="check-row">
                    <label className="check" onClick={() => showHelp(key)}>
                      <input type="checkbox" checked={!!mods[key]} onChange={(event) => patch((draft) => { draft.stack.mods[key] = event.target.checked; })} />
                      {label}
                    </label>
                    <HelpButton topic={key} label={label} />
                  </span>
                ))}
              </div>
            </details>
          </Card>
          <StepFooter ready={ready} next="Continue to Parts & colours" onNext={() => store.setTab("parts")} />
        </div>
        <div className="col side" data-help={helpTopic && state.help !== false ? "on" : undefined}>
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
  }, heightLabel);
  const bays = meta.layouts[layer.layout] || [layer.layout];
  const facades = layer.facades || [];
  const allBaysSplit = facades.length > 0 && facades.every((faces) => faces.length > 1);
  const someBaySplit = facades.some((faces) => faces.length > 1);
  const title = layerTitle(layer);
  const lockView = labeledChoices("key", { catalog: ["key", "hidden", "none"], current: layer.key }, (value) => (value === "hidden" ? "hidden key" : String(value)));
  return (
    <div
      className="layer"
      data-layer-index={index}
      draggable
      onDragStart={(event) => { event.dataTransfer.setData("text/plain", String(index)); store.setExpandedLayer(index); }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const raw = event.dataTransfer.getData("text/plain");
        if (raw === "") return;
        const from = Number(raw);
        if (Number.isInteger(from)) store.moveLayer(from, index - from);
      }}
    >
      <div className="layer-row">
        <button
          type="button"
          className="grip icon-btn"
          data-grip-index={index}
          title="Drag to reorder"
          aria-label={`Reorder ${title}. Drag, or focus and use the arrow keys. Activate to edit.`}
          onClick={() => store.setExpandedLayer(index)}
          onKeyDown={(event) => {
            const delta = event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0;
            if (!delta) return;
            event.preventDefault();
            const target = index + delta;
            if (target < 0 || target >= state.stack.layers.length) return;
            // Focus follows the moved layer: cards are keyed by index, so the
            // focused button would otherwise end up on the layer that swapped in.
            // flushSync renders the swap now, so a fast second keypress lands
            // on the moved layer's grip instead of undoing the move.
            flushSync(() => store.moveLayer(index, delta));
            document.querySelector<HTMLElement>(`[data-grip-index="${target}"]`)?.focus();
          }}
        >
          <Grip />
        </button>
        <button type="button" className="name" aria-expanded={open} aria-label={`Edit ${title}`} aria-describedby={`layer-${index}-summary`} onClick={() => store.setExpandedLayer(open ? null : index)}>
          <span>{title}{notes.some(isMisfitNote) ? <span className="bad"> · does not fit</span> : null}</span>
          <span className="layer-summary" id={`layer-${index}-summary`}>{layerSummary(layer)}</span>
        </button>
        <span className="pill">{heightLabel(layer.height)}</span>
        <button type="button" className="icon-btn" aria-label={`Remove ${title}`} onClick={() => store.removeLayer(index)}><Icon name="x" /></button>
      </div>
      {open ? (
        <div className="editor-groups">
          <div className="editor-group">
            <h3 className="group-title">Structure</h3>
            <div className="editor">
              <ChoiceSelect label="Type" help="type" view={typeView} onChange={(value) => patch((draft) => { draft.stack.layers[index].type = value; })} />
              <ChoiceSelect label="Width" help="width" view={widthView} onChange={(value) => patch((draft) => { draft.stack.layers[index].layout = value; })} />
              <ChoiceSelect label="Height" help="height" view={heightView} onChange={(value) => patch((draft) => { draft.stack.layers[index].height = Number(value); })} />
              {layer.type === "Sustainers" ? <p className="note">A sustainer is a box with a hinged lid that opens from the top, not a drawer that slides out.</p> : null}
            </div>
          </div>
          {layer.type === "Drawers" ? (
            <>
              <div className="editor-group">
                <h3 className="group-title">Drawers &amp; interior</h3>
                <div className="editor">
                  {bays.map((_bay, bayIndex) => {
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
                  })}
                  <Flag index={index} field="rails" label="geared rails" help="rails" forced={allBaysSplit} note={someBaySplit && !allBaysSplit ? "split bays always include them" : undefined} />
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
                  {layer.interior === "grid" ? (
                    <>
                      <NumberField index={index} field="gridW" label="Width dividers" />
                      <NumberField index={index} field="gridD" label="Depth dividers" />
                    </>
                  ) : null}
                </div>
              </div>
              <div className="editor-group">
                <h3 className="group-title">Details</h3>
                <div className="editor">
                  <ChoiceSelect
                    label="Lock"
                    help="key"
                    view={lockView}
                    onChange={(value) => patch((draft) => {
                      draft.stack.layers[index].key = value;
                    })}
                  />
                  <Flag index={index} field="labels" label="labels" help="labels" />
                  <Flag index={index} field="manualSupports" label="manual support wall" help="manualSupports" />
                </div>
              </div>
            </>
          ) : (
            <div className="editor-group">
              <h3 className="group-title">Interior</h3>
              <div className="editor">
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
              </div>
            </div>
          )}
          <div className="editor ops">
            <button type="button" className="btn" onClick={() => store.moveLayer(index, 1)}>Move toward top</button>
            <button type="button" className="btn" onClick={() => store.moveLayer(index, -1)}>Move toward base</button>
            <button type="button" className="btn" onClick={() => store.duplicateLayer(index)}>Duplicate layer</button>
          </div>
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

function Flag({ index, field, label, help, forced = false, note }: { index: number; field: "labels" | "rails" | "manualSupports" | "baseplate" | "dividers"; label: string; help: string; forced?: boolean; note?: string }) {
  const { state, patch, showHelp } = usePlanner();
  const layer = state.stack.layers[index];
  const checked = forced || (field === "dividers" ? !!layer.dividers : !!layer[field]);
  return (
    <span className="check-row">
      <label className="check" onClick={() => showHelp(help)}>
        <input
          type="checkbox"
          checked={checked}
          disabled={forced}
          title={forced ? "Required when a module holds more than one box" : note}
          onChange={(event) => patch((draft) => {
            const row = draft.stack.layers[index];
            if (field === "dividers") row.dividers = event.target.checked;
            else row[field] = event.target.checked;
          })}
        />
        {label}{forced ? " (required)" : note ? ` (${note})` : ""}
      </label>
      <HelpButton topic={help} label={label} />
    </span>
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
  const { helpTopic, helpSerial, helpAsk, helpReturn, returnFromHelp } = usePlanner();
  const block = HELP[helpTopic];
  const ref = useRef<HTMLElement>(null);
  // Help updates as fields are focussed and scrolls inside its own card (the
  // sticky column gives it whatever height the Preview leaves), so a new
  // topic starts at its heading. The page and the focussed field never move.
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [helpTopic, helpSerial]);
  // A ? button is a deliberate request: if the card is off-screen (before the
  // column sticks, or in the single-column layout), bring its heading in.
  // Seeded with the counter at mount, so remounting (returning to Design)
  // never replays an old request.
  const handledAsk = useRef(helpAsk);
  useEffect(() => {
    if (helpAsk === handledAsk.current) return;
    handledAsk.current = helpAsk;
    const el = ref.current;
    if (!el || typeof el.scrollIntoView !== "function") return;
    const rect = el.getBoundingClientRect();
    if (rect.top < 0 || rect.top > window.innerHeight - 48) el.scrollIntoView({ block: "start" });
  }, [helpAsk]);
  return (
    <section className="card" id="help" ref={ref}>
      <h2>Help</h2>
      <div aria-live="polite">
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
      {block && helpReturn && helpReturn.topic === helpTopic && helpReturn.target.isConnected ? (
        <p><button type="button" className="btn ghost sm" onClick={returnFromHelp}><Icon name="arrow-left" />Back to {helpReturn.label}</button></p>
      ) : null}
      </div>
    </section>
  );
}

function PartsInStack() {
  const { bom, state } = usePlanner();
  const ids = (bom?.judged?.printers || []).map((printer) => printer.id);
  const parts = bom?.parts || [];
  const pieces = parts.reduce((sum, part) => sum + Number(part.qty || 0), 0);
  const blocked = parts.filter((part) => {
    const fit = partFitsScope(part, ids);
    return fit === "missing" || fit === "unfit";
  }).length;
  return (
    <section className="card spaced">
      {!parts.length ? (
        <>
          <h2>Parts in this stack</h2>
          <p className="note">Add a layer. Quantities, size and time show up here.</p>
        </>
      ) : (
        <details>
          <summary>Parts in this stack · {pieces} pieces{blocked ? ` · ${blocked} ${blocked === 1 ? "line" : "lines"} not printable yet` : ""}</summary>
          {parts.map((part) => {
            const fit = partFitsScope(part, ids);
            return (
              <div key={`${part.group}|${part.name}`} className="partline">
                <span className="swatch" style={{ background: roleColor(state.settings, part.role) }} />
                <div>
                  <strong>{part.qty}× {part.name}</strong>
                  <div className="note">{part.group} · {part.size ? part.size.map((value) => Number(value).toFixed(1)).join("×") : "?"} mm · {part.seconds != null ? `${Math.round(part.seconds / 60)} min` : "time ?"}</div>
                </div>
                <span className={fit === "fits" ? "ok" : fit === "unknown" ? "muted" : "bad"}>
                  {fit === "fits" ? "fits" : fit === "missing" ? "file missing" : fit === "unfit" ? "does not fit" : "fit not checked"}
                </span>
              </div>
            );
          })}
        </details>
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
