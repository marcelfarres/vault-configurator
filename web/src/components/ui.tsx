import { useId, type ReactNode } from "react";
import type { ChoiceView } from "../labels";
import { usePlanner } from "../store";

export function Gear() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Zm8.2 3.1-.9-.2a6.7 6.7 0 0 0-.5-1.2l.6-.8a.9.9 0 0 0-.1-1.2l-1.1-1.1a.9.9 0 0 0-1.2-.1l-.8.6a6.7 6.7 0 0 0-1.2-.5l-.2-.9a.9.9 0 0 0-.9-.7h-1.6a.9.9 0 0 0-.9.7l-.2.9a6.7 6.7 0 0 0-1.2.5l-.8-.6a.9.9 0 0 0-1.2.1L6.7 8.2a.9.9 0 0 0-.1 1.2l.6.8a6.7 6.7 0 0 0-.5 1.2l-.9.2a.9.9 0 0 0-.7.9v1.6c0 .4.3.8.7.9l.9.2c.1.4.3.8.5 1.2l-.6.8a.9.9 0 0 0 .1 1.2l1.1 1.1c.3.3.9.4 1.2.1l.8-.6c.4.2.8.4 1.2.5l.2.9c.1.4.5.7.9.7h1.6c.4 0 .8-.3.9-.7l.2-.9c.4-.1.8-.3 1.2-.5l.8.6c.3.3.9.2 1.2-.1l1.1-1.1a.9.9 0 0 0 .1-1.2l-.6-.8c.2-.4.4-.8.5-1.2l.9-.2c.4-.1.7-.5.7-.9v-1.6a.9.9 0 0 0-.7-.9Z" />
    </svg>
  );
}

export function Grip() {
  return (
    <svg className="icon grip" viewBox="0 0 16 16" aria-hidden="true">
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
    <label className="field" htmlFor={id}>
      <span onClick={() => help && showHelp(help)}>{label}</span>
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
      {view.warning ? <span className="warn">{view.warning}</span> : null}
    </label>
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
