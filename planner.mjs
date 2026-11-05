/** Pure helpers for saved-project progress and the 2D plate picture. No DOM, no network. */

export function plateKey(plate) {
  const items = (plate.items || [])
    .map((item) => `${item.part}@${item.x},${item.y},${item.rot}`)
    .sort()
    .join("|");
  const slots = (plate.slots || []).join(",");
  return `${plate.printer}|${slots}|${items}`;
}

export function reconcileProgress(progress, fingerprint, plates, hardware) {
  const prev = progress || { layoutKey: "", plates: {}, hardware: {} };
  let note = "";
  let plateDone = { ...(prev.plates || {}) };
  if (prev.layoutKey && prev.layoutKey !== fingerprint) {
    plateDone = {};
    note = "Plate checks cleared because the layout changed.";
  }
  const alive = new Set((plates || []).map(plateKey));
  plateDone = Object.fromEntries(Object.entries(plateDone).filter(([key, done]) => done && alive.has(key)));
  const hardwareDone = {};
  for (const row of hardware || []) {
    const old = (prev.hardware || {})[row.item];
    const sameQty = !!old && Number(old.qty) === Number(row.qty);
    hardwareDone[row.item] = { qty: Number(row.qty), done: sameQty && !!old.done };
  }
  return {
    progress: { ...prev, layoutKey: fingerprint || "", plates: plateDone, hardware: hardwareDone },
    note,
  };
}

/** Plate-local corners. Matches plates.footprint_corners: rotate about the part origin, then translate. */
export function partCorners(item) {
  const radians = ((item.rot || 0) * Math.PI) / 180;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const width = item.w;
  const depth = item.d;
  return [[0, 0], [width, 0], [width, depth], [0, depth]].map(([u, v]) => [
    item.x + u * c - v * s,
    item.y + u * s + v * c,
  ]);
}

export function insideBed(corners, bed, slack = 0.05) {
  return corners.every(([x, y]) => x >= -slack && y >= -slack && x <= bed[0] + slack && y <= bed[1] + slack);
}

/** Replace the untouched upstream H2C + Kobra pair with the fleet. A resized or extended list is kept. */
export function migratePrinters(saved, fleet) {
  if (!Array.isArray(saved) || saved.length !== 2 || !Array.isArray(fleet)) return saved;
  const h2c = saved.find((printer) => printer.id === "h2c");
  const kobra = saved.find((printer) => printer.id === "kobrax");
  if (!h2c || !kobra) return saved;
  const bed = (printer, x, y) => printer.bed && printer.bed[0] === x && printer.bed[1] === y;
  if (bed(h2c, 325, 320) && h2c.z === 320 && bed(kobra, 260, 260)) return JSON.parse(JSON.stringify(fleet));
  return saved;
}

export function checkedCount(progress) {
  const plates = Object.values((progress && progress.plates) || {}).filter(Boolean).length;
  const hardware = Object.values((progress && progress.hardware) || {}).filter((row) => row && row.done).length;
  return { plates, hardware };
}
