import { usePlanner } from "../store";
import { Hardware } from "./Parts";
import { Icon } from "./ui";

export function Assemble() {
  const { bom, bomStale, state, patch, setTab, resetChecklist } = usePlanner();
  const parts = bom?.parts || [];
  const rows = bom?.hardware || [];
  // Count against the current BOM only: progress keeps checks for stacks that no longer exist.
  const hardwareDone = rows.filter((row) => !!state.progress.hardware?.[row.item]?.done).length;
  const partKeys = new Set(parts.map((part) => `${part.group}|${part.name}`));
  const assembleDone = [...partKeys].filter((key) => !!state.progress.assemble?.[key]?.done).length;
  const total = rows.length + partKeys.size;
  // A BOM computed for an earlier stack/settings must not claim this one is built.
  const complete = !bomStale && total > 0 && hardwareDone + assembleDone === total;
  let last = "";
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
        <h2>Assembly checklist</h2>
        {!parts.length ? <p className="note">Add a layer. The checklist follows that stack.</p> : parts.map((part) => {
          const key = `${part.group}|${part.name}`;
          const heading = part.group !== last;
          last = part.group;
          const done = !!state.progress.assemble?.[key]?.done;
          return (
            <div key={key}>
              {heading ? <h3>{part.group}</h3> : null}
              <label className="check assemble-row">
                <input type="checkbox" checked={done} onChange={(event) => patch((draft) => {
                  draft.progress.assemble = draft.progress.assemble || {};
                  draft.progress.assemble[key] = { qty: part.qty, done: event.target.checked };
                })} />
                <span>{part.qty}× {part.name}</span>
              </label>
            </div>
          );
        })}
      </section>
    </div>
  );
}
