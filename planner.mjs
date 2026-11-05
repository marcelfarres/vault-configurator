/** Pure helpers for saved-project progress and the 2D plate picture. No DOM, no network. */

export function plateKey(plate) {
  const items = (plate.items || [])
    .map((item) => `${item.part}@${item.x},${item.y},${item.rot}`)
    .sort()
    .join("|");
  const slots = (plate.slots || []).join(",");
  return `${plate.printer}|${slots}|${items}`;
}

export function reconcileProgress(progress, fingerprint, plates, hardware, assemble) {
  const prev = progress || { layoutKey: "", plates: {}, hardware: {}, assemble: {} };
  let note = "";
  let plateDone = { ...(prev.plates || {}) };
  if (plates) {
    if (prev.layoutKey && prev.layoutKey !== fingerprint) {
      plateDone = {};
      note = "Plate checks cleared because the layout changed.";
    }
    const alive = new Set(plates.map(plateKey));
    plateDone = Object.fromEntries(Object.entries(plateDone).filter(([key, done]) => done && alive.has(key)));
  }
  const hardwareDone = {};
  for (const row of hardware || []) {
    const old = (prev.hardware || {})[row.item];
    const sameQty = !!old && Number(old.qty) === Number(row.qty);
    hardwareDone[row.item] = { qty: Number(row.qty), done: sameQty && !!old.done };
  }
  let assembleDone = { ...(prev.assemble || {}) };
  if (assemble) {
    assembleDone = {};
    for (const row of assemble) {
      const old = (prev.assemble || {})[row.key];
      const sameQty = !!old && Number(old.qty) === Number(row.qty);
      assembleDone[row.key] = { qty: Number(row.qty), done: sameQty && !!old.done };
    }
  }
  return {
    progress: {
      ...prev,
      layoutKey: plates ? (fingerprint || "") : (prev.layoutKey || ""),
      plates: plateDone,
      hardware: hardwareDone,
      assemble: assembleDone,
    },
    note,
  };
}

/** missing | fits | unfit. A part fits the judged set only when every id fits. */
export function partFitsScope(part, ids) {
  if (!part || !part.file) return "missing";
  if (!ids || !ids.length || !part.fits) return "unknown";
  return ids.every((id) => part.fits[id]) ? "fits" : "unfit";
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

/** The parts list always includes every required part. The fit control disables choices; it does not hide rows. */
export function visiblePartRows(parts) {
  return (parts || []).slice();
}

/**
 * When the fit control is on, a choice that does not fit is disabled unless it is the current
 * saved or imported value. That value stays selected and is marked.
 */
export function decorateChoices(entries, filterOn) {
  const items = (entries || []).map((entry) => {
    const current = !!entry.current;
    const fits = !!entry.fits;
    return {
      ...entry,
      current,
      fits,
      disabled: !!(filterOn && !fits && !current),
      mark: current && !fits ? "does not fit" : "",
    };
  });
  const warning = filterOn && items.length > 0 && !items.some((item) => item.fits)
    ? "No choice here fits the selected printer. The current one stays selected."
    : "";
  return { items, warning };
}

export function checkedCount(progress) {
  const plates = Object.values((progress && progress.plates) || {}).filter(Boolean).length;
  const hardware = Object.values((progress && progress.hardware) || {}).filter((row) => row && row.done).length;
  const assemble = Object.values((progress && progress.assemble) || {}).filter((row) => row && row.done).length;
  return { plates, hardware, assemble };
}
