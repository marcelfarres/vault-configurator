import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { parseSettingNumber } from "../../../planner.mjs";
import type { ChoiceView } from "../labels";
import { usePlanner } from "../store";

/** Stroke icons in the Lucide manner (24 viewBox, 2px round stroke), drawn
 * inline so the app keeps its zero-icon-dependency install. */
const ICON_PATHS = {
  save: (
    <>
      <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
      <path d="M7 3v4a1 1 0 0 0 1 1h7" />
    </>
  ),
  "folder-open": (
    <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
  ),
  store: (
    <>
      <path d="M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5" />
      <path d="M17.77 10.31a4 4 0 0 1-5.55 0h-.44a4 4 0 0 1-5.55 0A4 4 0 0 1 3.4 5.2l.86-2.06A1 1 0 0 1 5.18 2.5h13.64a1 1 0 0 1 .92.64l.86 2.06a4 4 0 0 1-2.83 5.11Z" />
      <path d="M4 10.5V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.5" />
    </>
  ),
  plus: <path d="M5 12h14M12 5v14" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  eye: (
    <>
      <path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  download: <path d="M12 15V3m-5 7 5 5 5-5M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />,
  "arrow-right": <path d="M5 12h14m-7-7 7 7-7 7" />,
  "arrow-left": <path d="M19 12H5m7 7-7-7 7-7" />,
  printer: (
    <>
      <path d="M6 18H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v8H6z" />
      <path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" />
    </>
  ),
  palette: (
    <>
      <path d="M12 22a10 10 0 1 1 10-10c0 4.9-3.6 5-5.5 5H13a2.5 2.5 0 0 0 1.7 4.1c-.5.7-1.4.9-2.7.9Z" />
      <circle cx="13.5" cy="6.5" r="0.6" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r="0.6" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r="0.6" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r="0.6" fill="currentColor" />
    </>
  ),
  appearance: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a10 10 0 0 1 0 20Z" fill="currentColor" stroke="none" />
    </>
  ),
  "check-circle": (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

export function Grip() {
  return (
    <svg className="icon grip" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="3.5" r="1.15" />
      <circle cx="11" cy="3.5" r="1.15" />
      <circle cx="5" cy="8" r="1.15" />
      <circle cx="11" cy="8" r="1.15" />
      <circle cx="5" cy="12.5" r="1.15" />
      <circle cx="11" cy="12.5" r="1.15" />
    </svg>
  );
}

export function Switch({ pressed, label, onToggle }: { pressed: boolean; label: string; onToggle: (next: boolean) => void }) {
  return (
    <button type="button" className="switch" role="switch" aria-checked={pressed} aria-label={label} onClick={() => onToggle(!pressed)}>
      <span />
    </button>
  );
}

/** Deliberate help request beside a labelled field: sets the topic and lets
 * the Help card reveal itself. Hidden when the help preference is off, and
 * never inside a <label> (interactive content there is non-conforming and
 * would activate the labelled control). */
export function HelpButton({ topic, label }: { topic: string; label: string }) {
  const { state, askHelp } = usePlanner();
  if (state?.help === false) return null;
  return (
    <button type="button" className="help-btn" aria-label={`Help: ${label}`} onClick={(event) => askHelp(topic, label, event.currentTarget)}>?</button>
  );
}

/**
 * A number input that only ever commits a valid number. Typing is free; on blur or Enter an
 * empty, non-numeric, or out-of-range value shows an inline error and reverts — it never saves 0 or NaN.
 */
export function NumberField({
  label,
  value,
  min,
  exclusiveMin,
  max,
  step,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  exclusiveMin?: boolean;
  max?: number;
  step?: string;
  onCommit: (next: number) => void;
}) {
  const errorId = useId();
  const [text, setText] = useState(() => String(value));
  const [error, setError] = useState("");
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);
  const commit = (raw: string) => {
    const short = label.replace(/ for .*$/, "");
    const result = parseSettingNumber(raw, { label: short, min, exclusiveMin, max });
    if (result.ok) {
      setError("");
      setText(String(result.value));
      if (result.value !== value) onCommit(result.value);
    } else {
      setError(result.error);
      setText(String(value));
    }
  };
  return (
    <span className="num-field">
      <input
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        type="number"
        min={min}
        step={step}
        value={text}
        onFocus={() => { focused.current = true; }}
        onChange={(event) => { setText(event.target.value); if (error) setError(""); }}
        onBlur={(event) => { focused.current = false; commit(event.target.value); }}
        onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }}
      />
      {error ? <span className="field-error" id={errorId} role="alert">{error}</span> : null}
    </span>
  );
}

export function ChoiceSelect({
  label,
  help,
  view,
  onChange,
}: {
  label: string;
  help?: string;
  view: ChoiceView;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const { showHelp } = usePlanner();
  const selected = view.options.find((option) => option.selected);
  return (
    <span className={help ? "field has-help" : "field"}>
      <label htmlFor={id} onClick={() => help && showHelp(help)}>{label}</label>
      <select
        id={id}
        aria-label={label}
        value={selected ? String(selected.value) : ""}
        onFocus={() => help && showHelp(help)}
        onChange={(event) => onChange(event.target.value)}
      >
        {view.options.map((option) => (
          <option key={`${option.value}-${option.mark}`} value={String(option.value)} disabled={option.disabled} title={option.reason || undefined}>
            {option.label}{option.mark ? ` · ${option.mark}` : ""}
          </option>
        ))}
      </select>
      {help ? <HelpButton topic={help} label={label} /> : null}
      {view.warning ? <span className="warn">{view.warning}</span> : null}
    </span>
  );
}

export function Swatch({ color, label }: { color: string; label?: string }) {
  return <span className="swatch" style={{ background: color }} role={label ? "img" : undefined} aria-label={label} />;
}

export function Card({ title, extra, children }: { title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

/** End-of-step footer: what is true about this step now, and one way onward. Never a gate. */
export function StepFooter({ ready, next, onNext }: { ready: string; next: string; onNext: () => void }) {
  return (
    <footer className="step-footer">
      <p className="note">{ready}</p>
      <button type="button" className="btn primary" onClick={() => {
        onNext();
        // This button unmounts with the step: land at the top of the next one, focus on its heading.
        requestAnimationFrame(() => {
          window.scrollTo(0, 0);
          const heading = document.querySelector<HTMLElement>(".page h1");
          if (heading) {
            heading.tabIndex = -1;
            heading.focus({ preventScroll: true });
          }
        });
      }}>{next}<Icon name="arrow-right" /></button>
    </footer>
  );
}
