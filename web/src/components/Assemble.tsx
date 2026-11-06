import { checkedCount } from "../../../planner.mjs";
import { usePlanner } from "../store";
import { Hardware } from "./Parts";

export function Assemble() {
  const { bom, state, patch } = usePlanner();
  const parts = bom?.parts || [];
  const rows = bom?.hardware || [];
  const counts = checkedCount(state.progress);
  let last = "";
  return (
    <div className="page">
      <h1>Assemble</h1>
      <p className="lede">Check hardware and parts off as you build. The checks stay in this browser.</p>
      <p className="note">{counts.hardware}/{rows.length} hardware lines checked. A line clears when its quantity changes.</p>
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
              <label className="check">
                <input type="checkbox" checked={done} onChange={(event) => patch((draft) => {
                  draft.progress.assemble = draft.progress.assemble || {};
                  draft.progress.assemble[key] = { qty: part.qty, done: event.target.checked };
                })} />
                {part.qty}× {part.name}
              </label>
            </div>
          );
        })}
      </section>
    </div>
  );
}
