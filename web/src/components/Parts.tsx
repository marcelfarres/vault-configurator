import { partFitsScope, scopeLabel, spoolLabel, tpuRoleWarning, visiblePartRows } from "../../../planner.mjs";
import { ROLE_SHORT, filamentAt, fmtH, roleColor } from "../labels";
import { usePlanner } from "../store";
import type { PartLine } from "../types";
import { StepFooter } from "./ui";

export function Parts() {
  const store = usePlanner();
  const { state, meta, bom, patch } = store;
  const parts = bom?.parts || [];
  const pieces = parts.reduce((sum, part) => sum + Number(part.qty || 0), 0);
  const ids = (bom?.judged?.printers || []).map((printer) => printer.id);
  const who = scopeLabel(bom?.judged);
  const grouped = new Map<string, { role: string; qty: number; sample: PartLine }>();
  for (const part of parts) {
    const row = grouped.get(part.name) || { role: part.role, qty: 0, sample: part };
    row.qty += Number(part.qty || 0);
    grouped.set(part.name, row);
  }
  const missing = parts.filter((part) => partFitsScope(part, ids) === "missing").length;
  const tooBig = parts.filter((part) => partFitsScope(part, ids) === "unfit").length;
  const ready = parts.length
    ? [
      `${pieces} pieces`,
      missing ? `${missing} ${missing === 1 ? "part has its file" : "parts have their files"} missing from the archive` : "",
      tooBig ? `${tooBig} ${tooBig === 1 ? "part does" : "parts do"} not fit ${who}` : "",
    ].filter(Boolean).join(" · ") + "."
    : "No parts yet. You can continue, but Plates has nothing to pack until the stack has a layer.";
  return (
    <div className="page page-parts">
      <h1>Parts & colours</h1>
      <p className="lede">What this build needs, and which filament each part prints in.</p>
      <section className="card">
        <h2>What prints in which colour</h2>
        <p className="note">Per build — your shop inventory stays untouched.</p>
        {meta.roles.map((role) => {
          const users = parts.filter((part) => part.role === role);
          if (parts.length && !users.length) return null;
          const names = [...new Set(users.map((part) => part.name))].slice(0, 4);
          return (
            <div className="role-row" key={role}>
              <strong>{ROLE_SHORT[role] || role}</strong>
              <span className="mini-chips">
                {names.map((name) => <span key={name} className="chip"><span className="mini-swatch" style={{ background: roleColor(state.settings, role) }} />{name}</span>)}
              </span>
              <label>
                <span className="visually-hidden">{ROLE_SHORT[role] || role} filament</span>
                <select
                  aria-label={`${ROLE_SHORT[role] || role} filament`}
                  value={filamentAt(state.settings, role)?.id || ""}
                  onChange={(event) => patch((draft) => { draft.settings.roles[role] = event.target.value; })}
                >
                  {state.settings.filaments.map((filament) => (
                    <option key={filament.id || filament.name} value={filament.id || ""}>{spoolLabel(filament)}</option>
                  ))}
                </select>
              </label>
              {role === "tpu" && tpuRoleWarning(state.settings) ? <span className="warn" role="alert">{tpuRoleWarning(state.settings)}</span> : null}
            </div>
          );
        })}
      </section>
      <section className="card spaced">
        <div className="card-head">
          <h2>Printed parts</h2>
          <span className="note">{pieces} pieces</span>
        </div>
        <div className="pieces">
          {[...grouped.values()].map((row) => (
            <button
              type="button"
              className="piece-card"
              key={row.sample.name}
              disabled={!row.sample.file}
              title={row.sample.file ? `View ${row.sample.name} in 3D` : "File missing from the archive"}
              aria-label={row.sample.file ? `View ${row.sample.name} in 3D` : `${row.sample.name} — file missing`}
              onClick={(event) => row.sample.file && store.openViewer(row.sample.file, row.sample.name, roleColor(state.settings, row.role), event.currentTarget)}
            >
              <span className="swatch" style={{ background: roleColor(state.settings, row.role) }} />
              <span className="piece-meta">
                <strong>{row.sample.name}</strong>
                <span className="note">{row.sample.file ? (ROLE_SHORT[row.role] || row.role) : "file missing"}</span>
              </span>
              <span className="qty">×{row.qty}</span>
            </button>
          ))}
        </div>
        {!parts.length ? <p className="note">Add a layer on Design. Every required part stays in this list.</p> : null}
      </section>
      <section className="card spaced">
        <div className="card-head">
          <h2>Line by line</h2>
          <label className="check">
            <input type="checkbox" checked={!!state.merge} onChange={(event) => patch((draft) => { draft.merge = event.target.checked; })} />
            Join identical parts
          </label>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Part</th><th>Qty</th><th>Colour</th><th>g</th><th>time</th><th>size mm</th><th>fits</th></tr>
            </thead>
            <tbody>
              {visiblePartRows(rowsOf(parts, state.merge)).map((part) => {
                const fit = partFitsScope(part, ids);
                return (
                  <tr key={`${part.group}|${part.name}`}>
                    <td>{part.name}<div className="note">{part.group}</div></td>
                    <td>{part.qty}</td>
                    <td>
                      <select
                        aria-label={`Colour for ${part.name}`}
                        value={part.role}
                        onChange={(event) => patch((draft) => {
                          const targets = state.merge ? parts.filter((row) => row.name === part.name) : [part];
                          for (const target of targets) {
                            const key = `${target.group}|${target.name}`;
                            draft.overrides[key] = { ...(draft.overrides[key] || {}), role: event.target.value };
                          }
                        })}
                      >
                        {meta.roles.map((role) => <option key={role} value={role}>{ROLE_SHORT[role] || role}</option>)}
                      </select>
                    </td>
                    <td>{part.grams != null ? Math.round(part.grams) : "?"}</td>
                    <td>{part.seconds != null ? fmtH(part.seconds) : "?"}</td>
                    <td className="mono">{part.size ? part.size.map((value) => Math.round(value)).join("×") : "?"}</td>
                    <td className={fit === "fits" ? "ok" : fit === "unknown" ? undefined : "bad"}>
                      {fit === "fits" ? `fits ${who}` : fit === "missing" ? "file missing" : fit === "unfit" ? `does not fit ${who}` : "fit not checked"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {meta.kinds.length ? (
          <details>
            <summary>Change a whole group</summary>
            {meta.kinds.map((kind) => (
              <label key={kind} className="field">
                <span>{kind}</span>
                <select
                  aria-label={`Colour for ${kind}`}
                  value={state.settings.kindRoles[kind] || ""}
                  onChange={(event) => patch((draft) => {
                    if (event.target.value) draft.settings.kindRoles[kind] = event.target.value;
                    else delete draft.settings.kindRoles[kind];
                  })}
                >
                  <option value="">keep the designer’s colour</option>
                  {meta.roles.map((role) => <option key={role} value={role}>{ROLE_SHORT[role] || role}</option>)}
                </select>
              </label>
            ))}
          </details>
        ) : null}
      </section>
      <Hardware />
      <StepFooter ready={ready} next="Review plates" onNext={() => store.setTab("plates")} />
    </div>
  );
}

function rowsOf(parts: PartLine[], merge: boolean): PartLine[] {
  if (!merge) return parts;
  const map = new Map<string, PartLine>();
  for (const part of parts) {
    const existing = map.get(part.name);
    if (!existing) map.set(part.name, { ...part, qty: Number(part.qty) });
    else existing.qty = Number(existing.qty) + Number(part.qty);
  }
  return [...map.values()];
}

export function Hardware() {
  const { bom, state, patch } = usePlanner();
  const rows = bom?.hardware || [];
  return (
    <section className="card spaced">
      <h2>Hardware</h2>
      {!rows.length ? <p className="note">Bolts and bearings for this stack show up here.</p> : (
        <div className="table-wrap">
        <table>
          <thead><tr><th>Have</th><th>Item</th><th>Qty</th><th>Where</th></tr></thead>
          <tbody>
            {rows.map((row) => {
              const done = !!state.progress.hardware?.[row.item]?.done;
              return (
                <tr key={row.item}>
                  <td>
                    <label className="check">
                      <input type="checkbox" aria-label={`Have ${row.qty} ${row.item}`} checked={done} onChange={(event) => patch((draft) => {
                        draft.progress.hardware = draft.progress.hardware || {};
                        draft.progress.hardware[row.item] = { qty: row.qty, done: event.target.checked };
                      })} />
                      <span aria-hidden="true">Have</span>
                    </label>
                  </td>
                  <td>{row.item}</td>
                  <td>{row.qty}</td>
                  <td className="note">{row.notes}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );
}
