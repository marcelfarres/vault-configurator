import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  biggestExportPrinter,
  defaultPlannerState,
  legalExportMode,
  legalFitTarget,
  loadPlannerState,
  plateKey,
  printersForExport,
  reconcileProgress,
  settingsForApi,
  repairStackCatalog,
  STORAGE_KEY,
  THEME_STORAGE_KEY,
  normalizeTheme,
  themeIsDark,
} from "../../planner.mjs";
import { getJson, postJson } from "./api";
import { uid } from "./labels";
import { applyStartOver, layerKeySlice, newLayer, remapLayerKeys, replaceLayerKeySlice, sameLayerKeySlice } from "./stack";
import type { Bom, ExportFile, Layer, Meta, Plan, PlannerState, PresetMap, Printer, SettingsSection, Spool, TabId, ThemeChoice } from "./types";

const COMPUTE_MS = import.meta.env.MODE === "test" ? 0 : 350;

type RemovedLayerCapture = {
  layer: Layer;
  index: number;
  overrides: PlannerState["overrides"];
  assemble: NonNullable<PlannerState["progress"]["assemble"]>;
  survivors: Layer[];
  baseline: Layer[];
  survivorOverrides: PlannerState["overrides"];
  survivorAssemble: NonNullable<PlannerState["progress"]["assemble"]>;
  /** Tagged records as of capture (post-removal numbering), advanced with
   * baseline rows on BOM adoption: edits to a survivor's colours/checks
   * under its normalized group count as user edits of that survivor. */
  baselineOverrides: PlannerState["overrides"];
  baselineAssemble: NonNullable<PlannerState["progress"]["assemble"]>;
  /** False once survivors are reordered: positions no longer identify them. */
  positionsHold: boolean;
};

type Store = {
  ready: boolean;
  bootError: string;
  meta: Meta | null;
  presets: PresetMap;
  state: PlannerState | null;
  bom: Bom | null;
  /** True while `bom` was computed for an earlier signature (or none yet). */
  bomStale: boolean;
  /** What `exportFiles` are: the current build's export, an outdated one, test plates, or outdated test plates. */
  exportState: "none" | "current" | "stale" | "test" | "test-stale";
  plan: Plan | null;
  planNote: string;
  exportFiles: ExportFile[];
  spools: Spool[];
  theme: ThemeChoice;
  setTheme: (choice: ThemeChoice) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  settingsSection: SettingsSection;
  setSettingsSection: (section: SettingsSection) => void;
  removedPrinter: { printer: Printer; index: number; mode?: string; fitTarget?: string } | null;
  setRemovedPrinter: (removed: Store["removedPrinter"]) => void;
  removedLayer: RemovedLayerCapture | null;
  setRemovedLayer: (removed: Store["removedLayer"]) => void;
  restoreLayer: () => void;
  resetChecklist: () => void;
  startOver: () => void;
  archive: { done: number; total: number; msg?: string };
  status: string;
  exportStatus: string;
  helpTopic: string;
  helpSerial: number;
  helpAsk: number;
  helpReturn: { topic: string; label: string; target: HTMLElement } | null;
  showHelp: (topic: string) => void;
  askHelp: (topic: string, label: string, opener: HTMLElement) => void;
  returnFromHelp: () => void;
  expandedLayer: number | null;
  setExpandedLayer: (index: number | null) => void;
  viewer: { file: string; label: string; color: string; opener: HTMLElement | null } | null;
  openViewer: (file: string, label: string, color: string, opener?: HTMLElement | null) => void;
  closeViewer: () => void;
  patch: (recipe: (draft: PlannerState) => void) => void;
  setTab: (tab: TabId) => void;
  addLayer: () => void;
  removeLayer: (index: number) => void;
  duplicateLayer: (index: number) => void;
  moveLayer: (index: number, delta: number) => void;
  saveProject: () => void;
  loadProject: (id: string) => void;
  newProject: () => void;
  deleteProject: (id: string) => void;
  importLayers: (layers: Array<Partial<PlannerState["stack"]["layers"][number]>>) => void;
  importPdf: (file: File) => Promise<void>;
  importStatus: string;
  saveStackFile: () => void;
  loadStackFile: (file: File) => Promise<void>;
  stackFileStatus: string;
  previewPlates: () => Promise<void>;
  runExport: (path: "/api/export" | "/api/export_test", extra?: Record<string, unknown>) => Promise<void>;
  loadSpools: () => Promise<void>;
  spoolStatus: string;
  rescanPresets: () => Promise<void>;
  uploadPresets: (files: FileList) => Promise<void>;
  presetStatus: string;
  showSample: () => Promise<void>;
};

const Ctx = createContext<Store | null>(null);

function applyTheme(choice: ThemeChoice) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = themeIsDark(choice, prefersDark);
  document.documentElement.classList.toggle("dark", dark);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", dark ? "dark" : "light");
}

export function signature(state: PlannerState): string {
  return JSON.stringify({
    stack: state.stack,
    settings: state.settings,
    overrides: state.overrides,
    fitOnly: state.fitOnly,
    fitTarget: state.fitTarget,
  });
}

function progressRows(next: Bom | null, prev: PlannerState) {
  if (next) {
    return {
      hardware: (next.hardware || []).map((row) => ({ item: row.item, qty: Number(row.qty) })),
      assemble: (next.parts || []).map((part) => ({ key: `${part.group}|${part.name}`, qty: Number(part.qty) })),
    };
  }
  return {
    hardware: Object.entries(prev.progress.hardware || {}).map(([item, row]) => ({ item, qty: Number(row?.qty) })),
    assemble: Object.entries(prev.progress.assemble || {}).map(([key, row]) => ({ key, qty: Number(row?.qty) })),
  };
}

/** One BOM result. A newer stack, settings, or fit target drops it. Progress is reconciled from `prev`. */
export function applyBomResult(prev: PlannerState, requestSig: string, next: Bom): PlannerState {
  if (signature(prev) !== requestSig) return prev;
  const rows = progressRows(next, prev);
  const reconciled = reconcileProgress(prev.progress, prev.progress.layoutKey || "", null, rows.hardware, rows.assemble);
  const serverStack = next.stack;
  const stackSame = !serverStack
    || (JSON.stringify(serverStack.layers) === JSON.stringify(prev.stack.layers)
      && serverStack.depth === prev.stack.depth
      && JSON.stringify(serverStack.roof || {}) === JSON.stringify(prev.stack.roof || {}));
  const progressSame = JSON.stringify(reconciled.progress) === JSON.stringify(prev.progress);
  if (stackSame && progressSame) return prev;
  return {
    ...prev,
    stack: stackSame || !serverStack ? prev.stack : {
      ...prev.stack,
      layers: serverStack.layers || prev.stack.layers,
      depth: serverStack.depth ?? prev.stack.depth,
      roof: { ...prev.stack.roof, ...(serverStack.roof || {}) },
    },
    progress: reconciled.progress,
  };
}

/** Plate checks for one plan. Leaving Plates, or a newer plan input, drops it. */
export function applyPlanProgress(prev: PlannerState, requestSig: string, plan: Plan, bom: Bom | null): { state: PlannerState; note: string } {
  if (prev.tab !== "plates" || signature(prev) !== requestSig) return { state: prev, note: "" };
  const rows = progressRows(bom, prev);
  const reconciled = reconcileProgress(prev.progress, plan.fingerprint || "", plan.plates || [], rows.hardware, rows.assemble);
  if (JSON.stringify(reconciled.progress) === JSON.stringify(prev.progress)) return { state: prev, note: reconciled.note || "" };
  return { state: { ...prev, progress: reconciled.progress }, note: reconciled.note || "" };
}

export function PlannerProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState("");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [presets, setPresets] = useState<PresetMap>({});
  const [state, setState] = useState<PlannerState | null>(null);
  const [bom, setBom] = useState<Bom | null>(null);
  const [bomSig, setBomSig] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planNote, setPlanNote] = useState("");
  const [exportFiles, setExportFiles] = useState<ExportFile[]>([]);
  const [exportSig, setExportSig] = useState("");
  const [exportMain, setExportMain] = useState(false);
  const [spools, setSpools] = useState<Spool[]>([]);
  const [theme, setThemeState] = useState<ThemeChoice>(() => normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY)));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("printers");
  const [removedPrinter, setRemovedPrinter] = useState<Store["removedPrinter"]>(null);
  const [removedLayer, setRemovedLayer] = useState<Store["removedLayer"]>(null);
  const removedLayerRef = useRef<Store["removedLayer"]>(null);
  const [archive, setArchive] = useState<{ done: number; total: number; msg?: string }>({ done: 0, total: 0 });
  const [status, setStatus] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const [helpTopic, setHelpTopic] = useState("");
  const [helpSerial, setHelpSerial] = useState(0);
  const [helpAsk, setHelpAsk] = useState(0);
  const [helpReturn, setHelpReturn] = useState<Store["helpReturn"]>(null);
  const [expandedLayer, setExpandedLayer] = useState<number | null>(null);
  const [viewer, setViewer] = useState<Store["viewer"]>(null);
  const [importStatus, setImportStatus] = useState("");
  const [stackFileStatus, setStackFileStatus] = useState("");
  const [spoolStatus, setSpoolStatus] = useState("");
  const [presetStatus, setPresetStatus] = useState("");
  const stateRef = useRef<PlannerState | null>(null);
  stateRef.current = state;
  removedLayerRef.current = removedLayer;

  // The pending printer-removal Undo lives here, not in Settings, so it survives section
  // switches and closing Settings. A selection the user changes after the removal is their
  // newer choice: drop it from the capture as soon as it leaves the post-removal fallback,
  // so Undo cannot overwrite it even if they later switch back to the fallback value.
  useEffect(() => {
    if (!removedPrinter || !state) return;
    const next = { ...removedPrinter };
    let touched = false;
    if (next.mode && state.settings.mode !== "both") { delete next.mode; touched = true; }
    if (next.fitTarget && state.fitTarget !== "every") { delete next.fitTarget; touched = true; }
    if (touched) setRemovedPrinter(next);
  }, [removedPrinter, state]);

  useEffect(() => {
    applyTheme(theme);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMedia = () => {
      if (normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY)) === "system") applyTheme("system");
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) {
        const next = normalizeTheme(event.newValue);
        setThemeState(next);
        applyTheme(next);
      }
    };
    media.addEventListener("change", onMedia);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onMedia);
      window.removeEventListener("storage", onStorage);
    };
  }, [theme]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const [nextMeta, nextPresets] = await Promise.all([getJson<Meta>("/api/meta"), getJson<PresetMap>("/api/presets")]);
        if (cancel) return;
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw && !localStorage.getItem("vault-configurator-backup-v1")) localStorage.setItem("vault-configurator-backup-v1", raw);
        const loaded = loadPlannerState(raw, nextMeta) as PlannerState;
        if (loaded.tab !== "stack" && loaded.tab !== "parts" && loaded.tab !== "plates" && loaded.tab !== "assemble") loaded.tab = "stack";
        setMeta(nextMeta);
        setPresets(nextPresets);
        setArchive(nextMeta.progress || { done: 0, total: 0 });
        setState(loaded);
        setReady(true);
      } catch (error) {
        if (!cancel) setBootError(error instanceof Error ? error.message : "The planner did not start.");
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(() => {
      void getJson<{ done: number; total: number; msg?: string }>("/api/progress").then(setArchive).catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(id);
  }, [ready]);

  const sig = state ? signature(state) : "";
  useEffect(() => {
    if (!stateRef.current || !meta) return;
    const requested = stateRef.current;
    const requestSig = signature(requested);
    let cancel = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        if (cancel) return;
        if (!requested.stack.layers.length) {
          setBom(null);
          setBomSig(requestSig);
          setStatus("");
          return;
        }
        setStatus("Computing parts and geometry…");
        try {
          const next = await postJson<Bom>("/api/bom", {
            stack: requested.stack,
            settings: settingsForApi(requested.settings),
            overrides: requested.overrides,
            fitChoices: !!requested.fitOnly,
            fitTarget: requested.fitTarget,
          });
          if (cancel || !stateRef.current || signature(stateRef.current) !== requestSig) return;
          setBom(next);
          setBomSig(requestSig);
          setStatus("");
          setState((prev) => {
            if (!prev) return prev;
            const applied = applyBomResult(prev, requestSig, next);
            // BOM adoption is the only non-user layer writer: when it rewrites
            // a pending capture's baseline rows (normalization), advance those
            // rows to what was written, so restore can tell normalization apart
            // from user edits. Per-row on purpose: editing one survivor during
            // the compute window must not forfeit an untouched survivor's
            // revert. A spliced list advances nothing. Deferred out of the
            // updater.
            const capture = removedLayerRef.current;
            if (capture
              && capture.positionsHold
              && capture.baseline.length === prev.stack.layers.length
              && applied.stack.layers.length === prev.stack.layers.length) {
              let baseline: Layer[] | null = null;
              let baselineOverrides = capture.baselineOverrides;
              let baselineAssemble = capture.baselineAssemble;
              capture.baseline.forEach((row, pos) => {
                if (JSON.stringify(prev.stack.layers[pos]) === JSON.stringify(row)
                  && JSON.stringify(applied.stack.layers[pos]) !== JSON.stringify(row)) {
                  (baseline ??= [...capture.baseline])[pos] = applied.stack.layers[pos];
                  baselineOverrides = replaceLayerKeySlice(baselineOverrides, applied.overrides, pos);
                  baselineAssemble = replaceLayerKeySlice(baselineAssemble, applied.progress.assemble || {}, pos);
                }
              });
              if (baseline) {
                const next = { ...capture, baseline, baselineOverrides, baselineAssemble };
                queueMicrotask(() => setRemovedLayer((current) => (current === capture ? next : current)));
              }
            }
            return applied;
          });
        } catch (error) {
          if (!cancel) setStatus(error instanceof Error ? error.message : "Could not compute this stack.");
        }
      })();
    }, COMPUTE_MS);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [sig, ready, meta]);

  const planSig = state?.tab === "plates" ? sig : "";
  useEffect(() => {
    if (!ready || !meta || !stateRef.current || stateRef.current.tab !== "plates") return;
    const requested = stateRef.current;
    const requestSig = signature(requested);
    if (!requested.stack.layers.length) {
      setPlan(null);
      setPlanNote("");
      return;
    }
    let cancel = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await postJson<{ plan: Plan }>("/api/plan", {
            stack: requested.stack,
            settings: settingsForApi(requested.settings),
            overrides: requested.overrides,
          });
          if (cancel || !stateRef.current || stateRef.current.tab !== "plates" || signature(stateRef.current) !== requestSig) return;
          setPlan(result.plan);
          setState((prev) => {
            if (!prev) return prev;
            const applied = applyPlanProgress(prev, requestSig, result.plan, null);
            if (prev.tab === "plates" && signature(prev) === requestSig) setPlanNote(applied.note);
            return applied.state;
          });
        } catch (error) {
          if (!cancel) setExportStatus(error instanceof Error ? error.message : "Planning failed.");
        }
      })();
    }, COMPUTE_MS);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [planSig, ready, meta]);

  const api = useMemo<Store | null>(() => {
    if (!meta || !state) return null;
    const patch: Store["patch"] = (recipe) => {
      setState((prev) => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        recipe(next);
        legalExportMode(next.settings);
        legalFitTarget(next);
        return next;
      });
    };
    const openHelp = (topic: string): boolean => {
      if (stateRef.current?.help === false) return false;
      setHelpTopic(topic);
      setHelpSerial((serial) => serial + 1);
      return true;
    };
    // Every wholesale stack replacement goes through here: the pending layer
    // Undo and the open editor index address the stack being thrown away.
    const replaceStack = (recipe: (draft: PlannerState) => void) => {
      setRemovedLayer(null);
      setExpandedLayer(null);
      patch(recipe);
    };
    const value: Store = {
      ready,
      bootError,
      meta,
      presets,
      state,
      bom,
      bomStale: !bom || bomSig !== sig,
      exportState: !exportFiles.length ? "none"
        : exportSig !== (exportMain ? sig : `${sig}|${JSON.stringify(state.tests)}`) ? (exportMain ? "stale" : "test-stale")
        : exportMain ? "current" : "test",
      plan,
      planNote,
      exportFiles,
      spools,
      theme,
      setTheme: (choice) => {
        localStorage.setItem(THEME_STORAGE_KEY, choice);
        setThemeState(choice);
        applyTheme(choice);
      },
      settingsOpen,
      setSettingsOpen,
      settingsSection,
      setSettingsSection,
      removedPrinter,
      setRemovedPrinter,
      removedLayer,
      setRemovedLayer,
      archive,
      status,
      exportStatus,
      helpTopic,
      helpSerial,
      helpAsk,
      helpReturn,
      showHelp: (topic) => { openHelp(topic); },
      // askHelp is a deliberate request (a ? button): like showHelp, plus the
      // Help card may scroll itself into view when it is off-screen, and the
      // opener is remembered so Help can offer a way back to the field.
      askHelp: (topic, label, opener) => {
        if (!openHelp(topic)) return;
        setHelpReturn({ topic, label, target: opener });
        setHelpAsk((serial) => serial + 1);
      },
      returnFromHelp: () => {
        const target = helpReturn?.target;
        setHelpReturn(null);
        if (!target || !target.isConnected) return;
        if (typeof target.scrollIntoView === "function") target.scrollIntoView({ block: "center" });
        target.focus({ preventScroll: true });
      },
      expandedLayer,
      setExpandedLayer,
      viewer,
      openViewer: (file, label, color, opener) => setViewer({ file, label, color, opener: opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null) }),
      closeViewer: () => setViewer(null),
      patch,
      setTab: (tab) => patch((draft) => {
        draft.tab = tab;
      }),
      addLayer: () => patch((draft) => {
        draft.stack.layers.push(newLayer(draft.stack, meta));
      }),
      removeLayer: (index) => {
        const current = stateRef.current;
        const layer = current?.stack.layers[index];
        if (!layer || !current) return;
        // Single-slot capture like removedPrinter: Undo restores this exact
        // layer at its index, with its colour overrides and assembly checks;
        // a second removal replaces the capture. The capture holds only this
        // layer's entries, so restoring cannot roll back unrelated changes.
        setRemovedLayer(structuredClone({
          layer,
          index,
          overrides: remapLayerKeys(current.overrides, (i) => (i === index ? [index] : []), false),
          assemble: remapLayerKeys(current.progress.assemble || {}, (i) => (i === index ? [index] : []), false),
          // Pre-removal copies of the surviving layers, in post-removal order,
          // plus their tagged record entries: the BOM round-trip normalizes
          // survivors against the new base (an exposed SS layer becomes S,
          // renaming its catalog group and orphaning its checks), and Undo
          // reverts exactly that. `baseline` starts as the same list and is
          // advanced by BOM adoption alone, so restore can tell normalization
          // apart from user edits.
          survivors: current.stack.layers.filter((_, i) => i !== index),
          baseline: current.stack.layers.filter((_, i) => i !== index),
          survivorOverrides: remapLayerKeys(current.overrides, (i) => (i === index ? [] : [i]), false),
          survivorAssemble: remapLayerKeys(current.progress.assemble || {}, (i) => (i === index ? [] : [i]), false),
          baselineOverrides: remapLayerKeys(current.overrides, (i) => (i === index ? [] : [i > index ? i - 1 : i]), false),
          baselineAssemble: remapLayerKeys(current.progress.assemble || {}, (i) => (i === index ? [] : [i > index ? i - 1 : i]), false),
          positionsHold: true,
        }));
        setExpandedLayer((open) => (open === index ? null : open !== null && open > index ? open - 1 : open));
        patch((draft) => {
          draft.stack.layers.splice(index, 1);
          const down = (i: number) => (i === index ? [] : [i > index ? i - 1 : i]);
          draft.overrides = remapLayerKeys(draft.overrides, down);
          if (draft.progress.assemble) draft.progress.assemble = remapLayerKeys(draft.progress.assemble, down);
        });
      },
      restoreLayer: () => {
        const restore = removedLayer;
        if (!restore) return;
        setRemovedLayer(null);
        // Inverse of removeLayer's shift: indices at or above the insertion
        // point move up one, so the open editor keeps its layer.
        setExpandedLayer((open) => {
          const insertAt = Math.min(restore.index, stateRef.current?.stack.layers.length ?? restore.index);
          return open !== null && open >= insertAt ? open + 1 : open;
        });
        patch((draft) => {
          const insertAt = Math.min(restore.index, draft.stack.layers.length);
          const spliced = draft.stack.layers.length !== restore.baseline.length;
          // Survivor record edits are judged in post-removal numbering,
          // before the renumber below moves them: baseline records carry
          // the same numbering.
          const recordsEdited = restore.survivors.map((_, pos) => (
            !sameLayerKeySlice(restore.baselineOverrides, draft.overrides, pos)
            || (draft.progress.assemble ? !sameLayerKeySlice(restore.baselineAssemble, draft.progress.assemble, pos) : false)
          ));
          const up = (i: number) => [i >= insertAt ? i + 1 : i];
          draft.overrides = {
            ...remapLayerKeys(draft.overrides, up),
            ...remapLayerKeys(structuredClone(restore.overrides), () => [insertAt], false),
          };
          if (draft.progress.assemble || Object.keys(restore.assemble).length) {
            draft.progress.assemble = {
              ...remapLayerKeys(draft.progress.assemble || {}, up),
              ...remapLayerKeys(structuredClone(restore.assemble), () => [insertAt], false),
            };
          }
          draft.stack.layers.splice(insertAt, 0, structuredClone(restore.layer));
          // Revert BOM normalization where a survivor still deep-equals its
          // baseline (the last BOM-adopted form) and its tagged records are
          // untouched since adoption: any user edit — to the layer, or to
          // its colours/checks under the normalized group — wins, and the
          // row is left alone so those newer edits keep applying. Skipped
          // entirely when the list was spliced (add/remove/duplicate changed
          // its length) or reordered (positionsHold off): positions no
          // longer identify survivors. Reverted rows also get
          // back the tagged entries reconciliation dropped when normalization
          // renamed their group, without overwriting anything present now.
          if (!spliced && restore.positionsHold) {
            restore.survivors.forEach((captured, pos) => {
              const at = draft.stack.layers[pos >= insertAt ? pos + 1 : pos];
              if (!at || JSON.stringify(at) !== JSON.stringify(restore.baseline[pos])) return;
              const original = pos >= restore.index ? pos + 1 : pos;
              if (recordsEdited[pos]) return;
              at.layout = captured.layout;
              at.height = captured.height;
              at.facades = structuredClone(captured.facades);
              const restoreKeys = <T,>(snapshot: Record<string, T>, into: Record<string, T>) => {
                for (const [key, value] of Object.entries(layerKeySlice(snapshot, original))) {
                  if (!(key in into)) into[key] = structuredClone(value);
                }
              };
              restoreKeys(restore.survivorOverrides, draft.overrides);
              if (draft.progress.assemble) restoreKeys(restore.survivorAssemble, draft.progress.assemble);
            });
          }
        });
      },
      // An explicit checklist reset outranks a pending layer Undo: the
      // capture's checks (the removed layer's and the survivors') are
      // invalidated here so restoreLayer cannot resurrect them. The layer
      // and survivor geometry recovery are unaffected.
      resetChecklist: () => {
        // Uncheck in place rather than emptying: reconciliation recreates
        // missing entries as unchecked on the next recompute, and the
        // capture baseline set here must match that recreated form or Undo
        // would mistake an unrelated recompute for a user edit.
        const unchecked = Object.fromEntries(
          Object.entries(stateRef.current?.progress.assemble || {}).map(([key, entry]) => [key, { ...entry, done: false }]),
        );
        patch((draft) => {
          draft.progress.hardware = {};
          draft.progress.assemble = structuredClone(unchecked);
        });
        setRemovedLayer((current) => (current ? { ...current, assemble: {}, survivorAssemble: {}, baselineAssemble: unchecked } : current));
      },
      startOver: () => replaceStack(applyStartOver),
      duplicateLayer: (index) => {
        if (!stateRef.current?.stack.layers[index]) return;
        patch((draft) => {
          // The clone inherits the original's overrides at the shared index;
          // the original and everything above it renumber up one. Assembly
          // checks only shift: the clone has not been built, so it starts
          // unchecked.
          draft.overrides = remapLayerKeys(draft.overrides, (i) => (i < index ? [i] : i === index ? [index, index + 1] : [i + 1]));
          if (draft.progress.assemble) draft.progress.assemble = remapLayerKeys(draft.progress.assemble, (i) => [i >= index ? i + 1 : i]);
          draft.stack.layers.splice(index, 0, structuredClone(draft.stack.layers[index]));
        });
        // The clone takes the original's slot in display order, directly
        // beneath it; open the clone (display is top-first, index order).
        setExpandedLayer(index);
      },
      moveLayer: (index, delta) => {
        const layers = stateRef.current?.stack.layers;
        const target = index + delta;
        if (!layers || target === index || target < 0 || target >= layers.length) return;
        // A real reorder breaks the positional identity the pending Undo's
        // survivor recovery relies on — after a swap, equal-valued layers
        // are interchangeable and position cannot tell them apart. Keep the
        // layer restore; turn survivor field/key recovery off. A drop on
        // the same card (delta 0) returns above and changes nothing.
        setRemovedLayer((current) => (current ? { ...current, positionsHold: false } : current));
        patch((draft) => {
          const movedTarget = index + delta;
          if (movedTarget < 0 || movedTarget >= draft.stack.layers.length) return;
          const order = draft.stack.layers.map((_, i) => i);
          const [moved] = order.splice(index, 1);
          order.splice(movedTarget, 0, moved);
          const permute = (i: number) => [order.indexOf(i)];
          draft.overrides = remapLayerKeys(draft.overrides, permute);
          if (draft.progress.assemble) draft.progress.assemble = remapLayerKeys(draft.progress.assemble, permute);
          const [row] = draft.stack.layers.splice(index, 1);
          draft.stack.layers.splice(movedTarget, 0, row);
        });
      },
      saveProject: () => patch((draft) => {
        const id = draft.activeProjectId || uid();
        draft.activeProjectId = id;
        const snap = {
          id,
          name: draft.stack.name || "untitled",
          savedAt: new Date().toISOString(),
          stack: structuredClone(draft.stack),
          overrides: structuredClone(draft.overrides),
          progress: structuredClone(draft.progress),
        };
        const index = draft.projects.findIndex((project) => project.id === id);
        if (index >= 0) draft.projects[index] = snap;
        else draft.projects.push(snap);
      }),
      loadProject: (id) => {
        if (!id) {
          patch((draft) => { draft.activeProjectId = ""; });
          return;
        }
        replaceStack((draft) => {
          const project = draft.projects.find((item) => item.id === id);
          if (!project) return;
          draft.activeProjectId = id;
          draft.stack = structuredClone(project.stack);
          repairStackCatalog(draft.stack, meta.depths, meta.roofs);
          draft.overrides = structuredClone(project.overrides || {});
          draft.progress = structuredClone(project.progress || { layoutKey: "", plates: {}, hardware: {}, assemble: {} });
        });
      },
      newProject: () => replaceStack((draft) => {
        const fresh = defaultPlannerState(meta.defaults) as PlannerState;
        draft.stack = fresh.stack;
        draft.overrides = {};
        draft.progress = fresh.progress;
        draft.activeProjectId = "";
      }),
      deleteProject: (id) => patch((draft) => {
        draft.projects = draft.projects.filter((project) => project.id !== id);
        if (draft.activeProjectId === id) draft.activeProjectId = "";
      }),
      importLayers: (layers) => replaceStack((draft) => {
        const blank = newLayer(draft.stack, meta);
        draft.stack.layers = layers.map((layer) => ({
          ...blank,
          ...layer,
          type: layer.type || blank.type,
          layout: layer.layout || blank.layout,
          height: Number(layer.height || blank.height),
          facades: layer.facades || blank.facades,
        }));
        draft.overrides = {};
        if (draft.progress) draft.progress.assemble = {};
      }),
      importPdf: async (file) => {
        setImportStatus("reading…");
        try {
          const response = await fetch("/api/import_pdf", { method: "POST", headers: { "Content-Type": "application/pdf" }, body: await file.arrayBuffer() });
          const payload = await response.json() as { error?: string; layers?: PlannerState["stack"]["layers"]; warnings?: string[] };
          if (payload.error) throw new Error(payload.error);
          replaceStack((draft) => {
            const blank = newLayer({ ...draft.stack, layers: [] }, meta);
            draft.stack.layers = (payload.layers || []).map((layer) => ({
              ...blank,
              ...layer,
              type: layer.type || blank.type,
              layout: layer.layout || blank.layout,
              height: Number(layer.height || blank.height),
              facades: layer.facades || blank.facades,
            }));
            draft.overrides = {};
            if (draft.progress) draft.progress.assemble = {};
          });
          setImportStatus(`${payload.layers?.length || 0} layers imported. ${(payload.warnings || []).join(" ")}`);
        } catch (error) {
          setImportStatus(error instanceof Error ? error.message : "Could not read that PDF.");
        }
      },
      importStatus,
      saveStackFile: () => {
        const current = stateRef.current;
        if (!current) return;
        const blob = new Blob([JSON.stringify({ stack: current.stack, overrides: current.overrides }, null, 1)], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${current.stack.name || "vault-stack"}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
      },
      loadStackFile: async (file) => {
        try {
          const payload = JSON.parse(await file.text()) as { stack?: PlannerState["stack"]; overrides?: PlannerState["overrides"] };
          if (!payload.stack || !Array.isArray(payload.stack.layers)) throw new Error("not a stack file");
          replaceStack((draft) => {
            draft.stack = { ...defaultPlannerState(meta.defaults).stack, ...payload.stack } as PlannerState["stack"];
            repairStackCatalog(draft.stack, meta.depths, meta.roofs);
            draft.overrides = payload.overrides || {};
            if (draft.progress) draft.progress.assemble = {};
          });
          setStackFileStatus(`loaded “${payload.stack.name || "stack"}” (${payload.stack.layers.length} layers)`);
        } catch (error) {
          setStackFileStatus(error instanceof Error ? error.message : "Could not load that file.");
        }
      },
      stackFileStatus,
      previewPlates: async () => {
        const current = stateRef.current;
        if (!current) return;
        const requestSig = signature(current);
        setExportStatus("Planning…");
        try {
          const result = await postJson<{ plan: Plan }>("/api/plan", { stack: current.stack, settings: settingsForApi(current.settings), overrides: current.overrides });
          setState((prev) => {
            if (!prev) return prev;
            const applied = applyPlanProgress(prev, requestSig, result.plan, null);
            if (prev.tab === "plates" && signature(prev) === requestSig) {
              setPlan(result.plan);
              setExportFiles([]);
              setPlanNote(applied.note);
            }
            setExportStatus("");
            return applied.state;
          });
        } catch (error) {
          setExportStatus(error instanceof Error ? error.message : "Planning failed.");
        }
      },
      runExport: async (path, extra) => {
        const current = stateRef.current;
        if (!current) return;
        const requestSig = signature(current);
        // Test exports also depend on the picked test groups, which the signature omits.
        const requestKey = path === "/api/export" ? requestSig : `${requestSig}|${JSON.stringify(current.tests)}`;
        setExportStatus("Starting…");
        try {
          await postJson(path, { stack: current.stack, settings: settingsForApi(current.settings), overrides: current.overrides, ...(extra || {}) });
          for (;;) {
            await new Promise((resolve) => window.setTimeout(resolve, 800));
            const report = await getJson<{ running?: boolean; percent?: number; msg?: string; error?: string; result?: { plan: Plan; files: ExportFile[]; seconds: number; zip: string } }>("/api/export_status");
            setExportStatus(`${report.percent ?? 0}% · ${report.msg || ""}`);
            if (report.error) throw new Error(report.error);
            if (!report.running && report.result) {
              // The build may have changed while exporting: keep the files (their key
              // labels them stale) but do not overwrite the newer plan with this one.
              // A test export never replaces the stack plan.
              if (path === "/api/export" && stateRef.current && signature(stateRef.current) === requestSig) setPlan(report.result.plan);
              setExportFiles(report.result.files || []);
              setExportSig(requestKey);
              setExportMain(path === "/api/export");
              setExportStatus(report.result.files?.length ? `done in ${report.result.seconds}s` : "Export produced no files.");
              if (meta.handoff === "none") {
                const link = document.createElement("a");
                link.href = "/api/download";
                link.download = report.result.zip;
                link.click();
              }
              break;
            }
          }
        } catch (error) {
          setExportStatus(error instanceof Error ? error.message : "Export failed.");
        }
      },
      loadSpools: async () => {
        const current = stateRef.current;
        if (!current) return;
        setSpoolStatus("loading…");
        try {
          const payload = await getJson<{ spools?: Spool[]; error?: string }>(`/api/spoolman?url=${encodeURIComponent(current.settings.spoolman || "")}`);
          setSpools(payload.spools || []);
          setSpoolStatus(`${payload.spools?.length || 0} spools`);
        } catch (error) {
          setSpoolStatus(error instanceof Error ? error.message : "Spoolman did not answer.");
        }
      },
      spoolStatus,
      rescanPresets: async () => {
        const next = await getJson<PresetMap>("/api/presets");
        setPresets(next);
      },
      uploadPresets: async (list) => {
        const picked = [...list].filter((file) => /(^|\/)(BambuStudio|AnycubicSlicerNext|OrcaSlicer)\/((system|user)\/.+\.json|\2\.conf)$/.test(file.webkitRelativePath));
        if (!picked.length) {
          setPresetStatus("no presets in that folder: pick the BambuStudio, AnycubicSlicerNext or OrcaSlicer folder itself");
          return;
        }
        try {
          const files: Record<string, string> = {};
          for (const file of picked) {
            const text = await file.text();
            files[file.webkitRelativePath] = file.name.endsWith(".conf") ? JSON.stringify({ preset_folder: (text.match(/"preset_folder"\s*:\s*"([\w-]+)"/) || [])[1] || "" }) : text;
          }
          const result = await postJson<{ saved?: Record<string, string> }>("/api/presets_upload", { files });
          const next = await getJson<PresetMap>("/api/presets");
          setPresets(next);
          const outcomes = Object.entries(result.saved || {});
          setPresetStatus(outcomes.length ? outcomes.map(([slicer, outcome]) => `${slicer}: ${outcome}`).join("; ") : "no presets saved from that folder");
        } catch (error) {
          setPresetStatus(error instanceof Error ? error.message : "preset upload failed");
        }
      },
      presetStatus,
      showSample: async () => {
        const sample = await getJson<Plan>("/api/sample_plan");
        setPlan(sample);
        setPlanNote("");
      },
    };
    return value;
  }, [archive, bom, bomSig, bootError, expandedLayer, exportFiles, exportMain, exportSig, exportStatus, helpAsk, helpReturn, helpSerial, helpTopic, importStatus, meta, plan, planNote, presetStatus, presets, ready, removedLayer, removedPrinter, settingsOpen, settingsSection, spoolStatus, spools, stackFileStatus, state, status, theme, viewer]);

  if (bootError && !api) return <p className="boot-error">{bootError}</p>;
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export type ReadyStore = Omit<Store, "state" | "meta"> & { state: PlannerState; meta: Meta };

export function usePlanner(): ReadyStore {
  const value = useContext(Ctx);
  if (!value || !value.state || !value.meta) throw new Error("planner is not ready");
  return value as ReadyStore;
}

export function useMaybePlanner(): Store | null {
  return useContext(Ctx);
}

export function exportPrinters(state: PlannerState): Printer[] {
  return printersForExport(state.settings) as Printer[];
}

export function estimatePrinter(state: PlannerState): Printer | null {
  return biggestExportPrinter(state.settings) as Printer | null;
}

export { plateKey };
