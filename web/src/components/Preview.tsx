import { depthMm, roleColor, SHEET_H, stackHeightMm } from "../labels";
import { familyOf } from "../stack";
import { usePlanner } from "../store";
import type { Layer, Meta } from "../types";

type Front = {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  knobW: number | null;
  lid: boolean;
};

/**
 * Front rectangles for one layer block, in drawing coordinates. Facades are
 * listed top to bottom per bay (see Help: "Facade split"); each front takes
 * its unit share of the layer height, bays take their real width shares.
 * A non-drawer layer is a single front with a lid line instead of a knob.
 */
function layerFronts(layer: Layer, meta: Meta, blockY: number, blockHeight: number, innerX: number, innerW: number): Front[] {
  if (layer.type !== "Drawers") {
    return [{ key: "front", x: innerX, y: blockY, width: innerW, height: blockHeight, knobW: null, lid: true }];
  }
  const bays = meta.layouts[layer.layout] || [layer.layout];
  const bayWidths = bays.map((bay) => meta.width?.[familyOf(meta, bay)] || 1);
  const totalBayW = bayWidths.reduce((sum, value) => sum + value, 0) || 1;
  const bayGap = bays.length > 1 ? 5 : 0;
  const frontGap = 4;
  const fronts: Front[] = [];
  let bayX = innerX;
  bays.forEach((_bay, bayIndex) => {
    const bayW = (innerW - bayGap * (bays.length - 1)) * (bayWidths[bayIndex] / totalBayW);
    const x = bayX;
    bayX += bayW + bayGap;
    const units = layer.facades?.[bayIndex]?.length ? layer.facades[bayIndex] : [layer.height];
    const unitsInBay = units.reduce((sum, unit) => sum + Number(unit || 0), 0) || layer.height;
    let frontY = blockY;
    units.forEach((unit, frontIndex) => {
      const height = (blockHeight - frontGap * (units.length - 1)) * (Number(unit) / unitsInBay);
      fronts.push({ key: `${bayIndex}-${frontIndex}`, x, y: frontY, width: bayW, height, knobW: Math.min(32, bayW * 0.4), lid: false });
      frontY += height + frontGap;
    });
  });
  return fronts;
}

export function Preview() {
  const { state, meta, bom, expandedLayer } = usePlanner();
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
  const blocks = topFirst.map((layer, visual) => {
    const height = (SHEET_H[layer.height] || 51.5) * scale;
    const block = { layer, index: layers.length - 1 - visual, y, height };
    y += height + gap;
    return block;
  });
  const svgH = Math.max(180, y + pad);
  const totalMm = stackHeightMm(layers, stack.roof?.type);
  const callouts = (bom?.parts || []).slice(0, 6);
  const backbone = stack.mods?.backbone && stack.mods.backbone !== "none";
  const pegboard = stack.mods?.pegboard && stack.mods.pegboard !== "none";

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
            {blocks.map((block) => {
              const edited = expandedLayer === block.index;
              const stroke = edited ? "var(--teal)" : "currentColor";
              const strokeWidth = edited ? 3.25 : 2.25;
              const fronts = layerFronts(block.layer, meta, block.y, block.height, pad + 8, drawW - 16);
              return (
                <g key={block.index}>
                  {fronts.map((front) => (
                    <g key={front.key}>
                      <rect x={front.x} y={front.y} width={front.width} height={front.height} rx={Math.min(7, front.height / 3)} fill={body} stroke={stroke} strokeWidth={strokeWidth} />
                      {front.lid ? (
                        <line x1={pad + 16} y1={front.y + 10} x2={pad + drawW - 16} y2={front.y + 10} stroke="currentColor" strokeWidth="1.5" />
                      ) : front.knobW != null ? (
                        <rect x={front.x + front.width / 2 - front.knobW / 2} y={front.y + front.height / 2 - 3} width={front.knobW} height="6" rx="3" fill={knob} />
                      ) : null}
                    </g>
                  ))}
                </g>
              );
            })}
            <rect x={pad + 28} y={svgH - 14} width="16" height="6" rx="1" fill="currentColor" />
            <rect x={pad + drawW - 36} y={svgH - 14} width="16" height="6" rx="1" fill="currentColor" />
          </svg>
        ) : <p className="note">Add a layer to see the stack.</p>}
      </div>
      {layers.length ? (
        <div className="badges">
          <span className="mini-chips">{backbone ? <span className="pill teal">backbone</span> : null}{pegboard ? <span className="pill teal">pegboard back</span> : null}</span>
          <span className="pill">{units}U tall · {totalMm.toFixed(1)} mm</span>
        </div>
      ) : null}
      <p className="mono note">{width.toFixed(1)} × {depth} × {totalMm.toFixed(1)} mm · W × D × H</p>
      <details>
        <summary>Elevation and part callouts</summary>
      <div className="callouts-scroll">
      <div className="callouts">
        {callouts.map((part) => (
          <p key={`${part.group}-${part.name}`} className="note">{part.qty}× {part.name}{part.size ? ` · ${part.size.map((value) => Math.round(value)).join("×")} mm` : ""}</p>
        ))}
      </div>
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
      </div>
      </details>
    </section>
  );
}
