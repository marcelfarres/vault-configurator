import { checkedCount, exportCandidates, missingFileLines, plateKey, printerLabel } from "../../../planner.mjs";
import { EXPORT_STATE_VIEW, fmtH } from "../labels";
import { exportPrinters, estimatePrinter, usePlanner } from "../store";
import type { Filament, Plate } from "../types";
import { Icon, NumberField, StepFooter } from "./ui";

export function Plates() {
  const store = usePlanner();
  const { state, meta, plan, patch } = store;
  const enabled = state.settings.printers.filter((printer) => printer.enabled !== false);
  const candidates = exportCandidates(state.settings);
  const packing = exportPrinters(state);
  const estimate = estimatePrinter(state);
  const unplaceable = plan?.unplaceable?.length || 0;
  // Readiness comes from the current BOM; while it is stale the server still refuses a bad export.
  const partLines = store.bom?.parts || [];
  // Empty is known from the stack itself: with no layers the BOM stays null (and "stale") by design.
  const emptyStack = !state.stack.layers.length;
  const missingLines = store.bomStale ? [] : missingFileLines(partLines);
  const missingPieces = missingLines.reduce((sum, part) => sum + Number(part.qty || 0), 0);
  const canExport = !emptyStack && partLines.length > 0 && !missingLines.length && packing.length > 0;
  const exported = store.exportFiles.length;
  const exportView = EXPORT_STATE_VIEW[store.exportState];
  const exportLine = exportView.line(exported);
  const exportTotals = store.exportFiles.reduce<{ plates?: number; items?: number }>((acc, file) => {
    if (file.plates != null) acc.plates = (acc.plates || 0) + file.plates;
    if (file.items != null) acc.items = (acc.items || 0) + file.items;
    return acc;
  }, {});
  const planSummary = plan
    ? plan.synthetic
      ? `${plan.plates.length} example ${plan.plates.length === 1 ? "plate" : "plates"} shown`
      : `${plan.plates.length} ${plan.plates.length === 1 ? "plate" : "plates"} planned`
    : "";
  const readyParts = [
    planSummary,
    !plan?.synthetic && unplaceable ? `${unplaceable} ${unplaceable === 1 ? "part" : "parts"} cannot be placed` : "",
    exportLine,
  ].filter(Boolean).join(" · ");
  const ready = `${readyParts.charAt(0).toUpperCase()}${readyParts.slice(1)}.${store.exportState === "current" ? "" : " You can start assembling before you export."}`;
  return (
    <div className="page page-plates">
      <h1>Plates & export</h1>
      <p className="lede">Choose which shop printers to export for. Each export is a 3MF: a slicer project file, for Bambu Studio or OrcaSlicer, with every plate already laid out.</p>
      <section className="card">
        <h2>Export for</h2>
        <div className="export-for">
          {enabled.map((printer) => (
            <button
              type="button"
              key={printer.id}
              className="btn printer-toggle"
              aria-pressed={printer.forExport !== false}
              aria-label={`Export ${printerLabel(printer)}`}
              onClick={() => patch((draft) => {
                const row = draft.settings.printers.find((item) => item.id === printer.id);
                if (!row) return;
                row.forExport = row.forExport === false;
              })}
            >
              {printerLabel(printer)} <span className="mono">{printer.bed[0]}×{printer.bed[1]}</span>
            </button>
          ))}
        </div>
        <p className="note">Packing with {packing.map((printer) => printerLabel(printer)).join(", ") || "no printer"}.{packing.length > 1 ? " Each part is packed once, shared between them to balance print time." : ""}</p>
        <p className="note">Weight estimate uses {bomPrinter(store.bom?.estimate?.printer, estimate ? printerLabel(estimate) : "")}.</p>
        <div className="actions">
          <button type="button" className="btn" disabled={emptyStack || !partLines.length} onClick={() => void store.previewPlates()}><Icon name="eye" />Preview plates</button>
          <button type="button" className="btn primary" disabled={!canExport} onClick={() => void store.runExport("/api/export")}><Icon name="download" />Export 3MF</button>
          {!meta.files ? <button type="button" className="btn" onClick={() => void store.showSample()}>Show a sample plate</button> : null}
        </div>
        <p className="note">{store.exportStatus}</p>
        {missingLines.length ? (
          <p className="bad" role="alert">
            {missingPieces} {missingPieces === 1 ? "piece has" : "pieces have"} no file in the archive, so nothing can be exported yet.{" "}
            <button type="button" className="btn ghost" onClick={() => store.setTab("stack")}>Point the planner at your VAULT folder</button>
          </p>
        ) : null}
        {emptyStack ? <p className="note">Nothing to export yet — add a layer on Design.</p> : null}
        {partLines.length && plan && !plan.plates.length && !plan.synthetic && !missingLines.length ? (
          <p className="warn">No plates could be planned{unplaceable ? `: ${unplaceable} ${unplaceable === 1 ? "part does" : "parts do"} not fit any export printer (see below)` : ""}.</p>
        ) : null}
        {store.exportFiles.length ? (
          <div className="export-result" role="status">
            <p className={exportView.tone}>
              <strong>{exportView.headline}</strong>{" "}
              {exported} {exported === 1 ? "file" : "files"}
              {exportTotals.plates != null ? ` · ${exportTotals.plates} plates` : ""}
              {exportTotals.items != null ? ` · ${exportTotals.items} parts` : ""}
            </p>
            {store.exportFiles.map((file) => {
              const base = file.file.split(/[/\\]/).pop() || file.file;
              return (
                <p key={base} className={file.warning ? "warn" : "ok"}>
                  {base} · {file.plates} plates · {file.items} parts {file.warning ? `· ${file.warning}` : ""}
                  {" "}
                  <a href={`/api/download_file?name=${encodeURIComponent(base)}`} download={base}>Download</a>
                </p>
              );
            })}
          </div>
        ) : null}
        <p className="note">{meta.handoffNote}</p>
      </section>
      <section className="card spaced">
        <label className="field">
          <span>Pack plates for</span>
          <select
            aria-label="Pack plates for"
            value={state.settings.mode}
            onChange={(event) => patch((draft) => { draft.settings.mode = event.target.value; })}
          >
            <option value="both">all export printers (balance print time)</option>
            {candidates.map((printer) => (
              <option key={printer.id} value={printer.id}>{printerLabel(printer)} only</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Group plates by</span>
          <select aria-label="Group plates by" value={state.settings.groupBy} onChange={(event) => patch((draft) => { draft.settings.groupBy = event.target.value; })}>
            <option value="color">one colour · fewest plates</option>
            <option value="size">big and small</option>
            <option value="module">keep a module together</option>
          </select>
        </label>
        <label className="field">
          <span>Part spacing (mm)</span>
          <NumberField label="Part spacing (mm)" value={state.settings.spacing} min={0} onCommit={(next) => patch((draft) => { draft.settings.spacing = next; })} />
        </label>
        <label className="field">
          <span>Bed-edge margin (mm)</span>
          <NumberField label="Bed-edge margin (mm)" value={state.settings.edge} min={0} onCommit={(next) => patch((draft) => { draft.settings.edge = next; })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={state.settings.estimateFromPreset !== false} onChange={(event) => patch((draft) => { draft.settings.estimateFromPreset = event.target.checked; })} />
          Weight estimate uses the process preset’s walls and infill
        </label>
        {state.settings.estimateFromPreset === false ? (
          <>
            <label className="field">Shell mm
              <NumberField label="Shell" value={state.settings.wallMm} min={0} exclusiveMin step="0.1" onCommit={(next) => patch((draft) => { draft.settings.wallMm = next; })} />
            </label>
            <label className="field">Infill
              <NumberField label="Infill" value={state.settings.infill} min={0} max={1} step="0.01" onCommit={(next) => patch((draft) => { draft.settings.infill = next; })} />
            </label>
          </>
        ) : null}
      </section>
      {plan ? <PlanView /> : null}
      <section className="card spaced">
        <h2>Stack file</h2>
        <div className="actions">
          <button type="button" className="btn" onClick={store.saveStackFile}>Save stack</button>
          <label className="btn">Load stack
            <input className="visually-hidden" type="file" accept=".json,application/json" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void store.loadStackFile(file);
              event.target.value = "";
            }} />
          </label>
        </div>
        <p className="note">{store.stackFileStatus}</p>
      </section>
      <TestPlates />
      <StepFooter ready={ready} next="Continue to assemble" onNext={() => store.setTab("assemble")} />
    </div>
  );
}

function bomPrinter(fromServer: string | undefined, fromList: string) {
  return fromServer || fromList || "the biggest printer in that list";
}

function PlanView() {
  const { plan, planNote, state, patch } = usePlanner();
  if (!plan) return null;
  const name = (id: string) => printerLabel(state.settings.printers.find((printer) => printer.id === id) || { name: id });
  return (
    <section className="spaced" aria-label={plan.synthetic ? "Example plate layout" : undefined}>
      {plan.synthetic ? (
        <>
          <h2>Example plate layout</h2>
          <p className="warn">{plan.label || "Synthetic example. Not VAULT parts."}</p>
          <p className="note">Example only — these plates do not describe your stack or its print progress.</p>
        </>
      ) : null}
      {planNote ? <p className="warn">{planNote}</p> : null}
      {!plan.synthetic ? <p className="note">{checkedCount(state.progress).plates}/{plan.plates.length} plates marked printed. This is a manual check, not a connection to a printer.</p> : null}
      {(plan.unplaceable || []).map((row) => (
        <p key={row.name} className="bad">{row.qty || 1}× {row.name} does not fit an export printer. {row.reason || ""}</p>
      ))}
      <div className="plate-grid">
        {plan.plates.map((plate, index) => (
          <article key={plateKey(plate)} className="card plate-card">
            <Bed plate={plate} filaments={state.settings.filaments} />
            <h3>{plan.synthetic ? "Example plate" : "Plate"} {index + 1} · {plate.name || name(plate.printer)}</h3>
            <p className="note mono">{name(plate.printer)}{plate.seconds != null ? ` · ${fmtH(plate.seconds)}` : ""}{plate.grams != null ? ` · ${Math.round(plate.grams)} g` : ""}</p>
            <p className="note">{counts(plate)}</p>
            {!plan.synthetic ? (
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!state.progress.plates?.[plateKey(plate)]}
                  onChange={(event) => patch((draft) => {
                    draft.progress.plates = draft.progress.plates || {};
                    const key = plateKey(plate);
                    if (event.target.checked) draft.progress.plates[key] = true;
                    else delete draft.progress.plates[key];
                  })}
                />
                Printed
              </label>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function counts(plate: Plate) {
  const map = new Map<string, number>();
  for (const item of plate.items || []) map.set(item.part, (map.get(item.part) || 0) + 1);
  return [...map.entries()].map(([part, qty]) => `${qty}× ${part}`).join(" · ");
}

function Bed({ plate, filaments }: { plate: Plate; filaments: Filament[] }) {
  const bed = plate.bed || [256, 256];
  const [width, height] = bed;
  const lines = [];
  for (let x = 10; x < width; x += 10) lines.push(<line key={`x${x}`} x1={x} y1={0} x2={x} y2={height} />);
  for (let y = 10; y < height; y += 10) lines.push(<line key={`y${y}`} x1={0} y1={y} x2={width} y2={y} />);
  return (
    <svg className="bed" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Plate preview, ${width} by ${height} millimetres`}>
      <rect className="bed-surface" x="0" y="0" width={width} height={height} fill="var(--bed)" />
      <g className="bed-grid">{lines}</g>
      <g transform={`translate(0 ${height}) scale(1 -1)`}>
        {(plate.items || []).map((item, index) => (
          <polygon
            key={`${item.part}-${index}`}
            className="bed-part"
            points={(item.corners || []).map(([x, y]) => `${x},${y}`).join(" ")}
            fill={(item.slot != null && filaments[item.slot]?.color) || "#c9ccd0"}
          />
        ))}
      </g>
    </svg>
  );
}

function TestPlates() {
  const { state, meta, bom, patch, runExport } = usePlanner();
  const kinds = [...new Set((bom?.parts || []).map((part) => part.kind).filter((kind): kind is string => !!kind))];
  const list = kinds.length ? kinds : meta.kinds;
  const picked = list.filter((kind) => state.tests[kind]);
  return (
    <section className="card spaced">
      <h2>Test plates</h2>
      <p className="note">One plate per ticked group, on the same export list, so a process preset can be checked before the real export.</p>
      {list.map((kind) => (
        <label key={kind} className="check">
          <input type="checkbox" checked={!!state.tests[kind]} onChange={(event) => patch((draft) => { draft.tests[kind] = event.target.checked; })} />
          {kind}
        </label>
      ))}
      <button type="button" className="btn" disabled={!picked.length} onClick={() => { void runExport("/api/export_test", { kinds: picked }); }}>Export test plates</button>
    </section>
  );
}
