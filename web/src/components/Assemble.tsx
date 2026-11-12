import { useState } from "react";
import { usePlanner } from "../store";
import type { PartLine } from "../types";
import { Hardware } from "./Parts";
import { Icon } from "./ui";

export function Assemble() {
  const { bom, bomStale, state, setTab, resetChecklist } = usePlanner();
  const parts = bom?.parts || [];
  const rows = bom?.hardware || [];
  // Count against the current BOM only: progress keeps checks for stacks that no longer exist.
  const hardwareDone = rows.filter((row) => !!state.progress.hardware?.[row.item]?.done).length;
  const partKeys = new Set(parts.map((part) => `${part.group}|${part.name}`));
  const assembleDone = [...partKeys].filter((key) => !!state.progress.assemble?.[key]?.done).length;
  const total = rows.length + partKeys.size;
  // A BOM computed for an earlier stack/settings must not claim this one is built.
  const complete = !bomStale && total > 0 && hardwareDone + assembleDone === total;
  const groups = new Map<string, PartLine[]>();
  for (const part of parts) {
    const list = groups.get(part.group);
    if (list) list.push(part);
    else groups.set(part.group, [part]);
  }
  const [hideChecked, setHideChecked] = useState(false);
  return (
    <div className="page page-assemble">
      <h1>Assemble</h1>
      <p className="lede">Check hardware and parts off as you build. The checks stay in this browser.</p>
      <p className="note">{hardwareDone}/{rows.length} hardware lines · {assembleDone}/{partKeys.size} assembly lines checked. A line clears when its quantity changes.</p>
      {complete ? (
        <section className="card complete" role="status">
          <h2><Icon name="check-circle" />Assembly complete</h2>
          <p>{hardwareDone} hardware {hardwareDone === 1 ? "line" : "lines"} and {assembleDone} assembly {assembleDone === 1 ? "line" : "lines"} checked off. A line clears again if its quantity changes.</p>
          <div className="actions">
            <button type="button" className="btn" onClick={resetChecklist}>Review checklist again</button>
            <button type="button" className="btn" onClick={() => setTab("stack")}>Back to Design</button>
            <button type="button" className="btn" onClick={() => setTab("plates")}>Back to Plates</button>
          </div>
        </section>
      ) : null}
      <Hardware />
      <section className="card spaced">
        <div className="card-head">
          <h2>Assembly checklist</h2>
          {parts.length ? (
            <label className="check">
              <input type="checkbox" checked={hideChecked} onChange={(event) => setHideChecked(event.target.checked)} />
              Hide checked
            </label>
          ) : null}
        </div>
        {!parts.length ? <p className="note">Add a layer. The checklist follows that stack.</p> : [...groups.entries()].map(([group, items]) => (
          <AssembleGroup key={group} group={group} items={items} hideChecked={hideChecked} />
        ))}
      </section>
    </div>
  );
}

function AssembleGroup({ group, items, hideChecked }: { group: string; items: PartLine[]; hideChecked: boolean }) {
  const { state, patch } = usePlanner();
  const doneOf = (part: PartLine) => !!state.progress.assemble?.[`${part.group}|${part.name}`]?.done;
  const doneCount = items.filter(doneOf).length;
  // Start collapsed only when the whole group is already built; after that
  // the disclosure is the user's, not re-decided on every check.
  const [open, setOpen] = useState(() => doneCount < items.length);
  const visible = hideChecked ? items.filter((part) => !doneOf(part)) : items;
  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{group} · {doneCount}/{items.length}</summary>
      {visible.length ? visible.map((part) => {
        const key = `${part.group}|${part.name}`;
        return (
          <label key={key} className="check assemble-row">
            <input type="checkbox" checked={doneOf(part)} onChange={(event) => patch((draft) => {
              draft.progress.assemble = draft.progress.assemble || {};
              draft.progress.assemble[key] = { qty: part.qty, done: event.target.checked };
            })} />
            <span>{part.qty}× {part.name}</span>
          </label>
        );
      }) : <p className="note">All checked.</p>}
    </details>
  );
}
