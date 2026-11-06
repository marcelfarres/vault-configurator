import { depthMm, roleColor, SHEET_H } from "../labels";
import { familyOf } from "../stack";
import { usePlanner } from "../store";

const ROOF_MM: Record<string, number> = { none: 0, grid: 15, table: 12, bowl: 22, undertable: 12, heavyweight: 60 };

export function Preview() {
  const { state, meta, bom } = usePlanner();
  const stack = state.stack;
  const layers = stack.layers;
  const topFirst = [...layers].reverse();
  const family = layers[0] ? familyOf(meta, layers[0].layout) : "S";
  const width = meta.width?.[family] || 164.8;
  const depth = depthMm(stack.depth);
  const body = roleColor(state.settings, "box");
  const knob = roleColor(state.settings, "knob");
  const units = layers.reduce((sum, layer) => sum + Number(layer.height || 0), 0);
  const drawW = 220;
  const scale = drawW / Math.max(width, 1);
  const gap = 6;
  const pad = 16;
  let y = pad + 8;
  const blocks = topFirst.map((layer) => {
    const height = (SHEET_H[layer.height] || 51.5) * scale;
    const block = { layer, y, height };
    y += height + gap;
    return block;
  });
  const svgH = Math.max(180, y + pad);
  const totalMm = layers.reduce((sum, layer) => sum + (SHEET_H[layer.height] || 0), 0)
    + Math.max(0, layers.length - 1) * 5
    + (ROOF_MM[stack.roof?.type || "none"] || 0);
  const callouts = (bom?.parts || []).slice(0, 6);
  const backbone = stack.mods?.backbone && stack.mods.backbone !== "none";

  return (
    <section className="card preview-card">
      <div className="card-head">
        <h2>Preview</h2>
        <span className="preview-meta">front · depth {stack.depth}</span>
      </div>
      <div className="canvas">
        {layers.length ? (
          <svg className="cabinet" viewBox={`0 0 ${drawW + pad * 2} ${svgH}`} role="img" aria-label="Stack preview">
            <rect x={pad} y={blocks[0]?.y || pad} width={drawW} height={Math.max(8, y - (blocks[0]?.y || pad) - gap)} rx="10" fill="none" stroke="currentColor" strokeWidth="3" />
            {blocks.map((block) => (
              <g key={`${block.layer.layout}-${block.y}`}>
                <rect x={pad + 8} y={block.y} width={drawW - 16} height={block.height} rx="7" fill={body} stroke="currentColor" strokeWidth="2.25" />
                {block.layer.type === "Drawers" ? (
                  <rect x={pad + drawW / 2 - 16} y={block.y + block.height / 2 - 3} width="32" height="6" rx="3" fill={knob} />
                ) : (
                  <line x1={pad + 16} y1={block.y + 10} x2={pad + drawW - 16} y2={block.y + 10} stroke="currentColor" strokeWidth="1.5" />
                )}
              </g>
            ))}
            <rect x={pad + 28} y={svgH - 14} width="16" height="6" rx="1" fill="currentColor" />
            <rect x={pad + drawW - 36} y={svgH - 14} width="16" height="6" rx="1" fill="currentColor" />
          </svg>
        ) : <p className="note">Add a layer to see the stack.</p>}
      </div>
      {layers.length ? (
        <div className="badges">
          {backbone ? <span className="pill teal">backbone</span> : <span />}
          <span className="pill">{units}U tall</span>
        </div>
      ) : null}
      <p className="mono note">{width.toFixed(1)} × {depth} × {totalMm.toFixed(1)} mm · W × D × H</p>
      <div className="callouts">
        {callouts.map((part) => (
          <p key={`${part.group}-${part.name}`} className="note">{part.qty}× {part.name}{part.size ? ` · ${part.size.map((value) => Math.round(value)).join("×")} mm` : ""}</p>
        ))}
      </div>
      <details>
        <summary>Elevation and part callouts</summary>
        {topFirst.map((layer, visual) => {
          const index = layers.length - 1 - visual;
          const parts = (bom?.parts || []).filter((part) => String(part.group || "").startsWith(`L${index + 1}`));
          return (
            <div key={index}>
              <p><strong>Layer {index + 1} · {layer.layout} {layer.height}U {layer.type}</strong></p>
              {parts.map((part) => <p key={part.name} className="note">{part.qty}× {part.name}</p>)}
            </div>
          );
        })}
      </details>
    </section>
  );
}
