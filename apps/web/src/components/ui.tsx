'use client';

import Link from 'next/link';
import { useEffect, useId, useState, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ApiError } from '@/lib/api';
import { statusLabel, statusTone } from '@/lib/format';

export function PageHead({ title, sub, actions, crumbs }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; crumbs?: { href: string; label: string }[] }) {
  return (
    <div className="page-head">
      <div>
        {crumbs && (
          <div className="crumbs">
            {crumbs.map((c, i) => (
              <span key={c.href}>
                {i > 0 && ' / '}
                <Link href={c.href}>{c.label}</Link>
              </span>
            ))}
          </div>
        )}
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, flush, footer, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean; footer?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className ?? ''}`}>
      {(title || actions) && (
        <div className="hd">
          {typeof title === 'string' ? <h2>{title}</h2> : title}
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      <div className={`bd ${flush ? 'flush' : ''}`}>{children}</div>
      {footer && <div className="ft">{footer}</div>}
    </section>
  );
}

export function Status({ s, label }: { s: string | null | undefined; label?: string }) {
  if (!s) return <span className="faint">—</span>;
  return <span className={`chip ${statusTone(s)}`}>{label ?? statusLabel(s)}</span>;
}

export function Btn({ kind, size, loading, children, ...rest }: { kind?: 'pri' | 'danger' | 'ghost'; size?: 'sm'; loading?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`btn ${kind ?? ''} ${size ?? ''}`} disabled={loading || rest.disabled} {...rest}>
      {loading && <span className="spinner" style={{ width: 14, height: 14 }} />}
      {children}
    </button>
  );
}

export function Field({ label, error, hint, required, children, className }: { label: string; error?: string; hint?: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${error ? 'invalid' : ''} ${className ?? ''}`}>
      <span>
        {label}
        {required && <span className="req"> *</span>}
      </span>
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} value={p.value ?? ''} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} value={p.value ?? ''} />;

export function Select({ options, placeholder, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <select {...p} value={p.value ?? ''}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Check({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading">
      <span className="spinner" />
      <span className="small">{label}</span>
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error as ApiError;
  const blockers = e instanceof ApiError ? e.details?.blockers : undefined;
  return (
    <div className="alert bad" role="alert">
      {e.message ?? String(error)}
      {blockers && blockers.length > 0 && (
        <ul>
          {blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Modal({ title, onClose, children, footer, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const id = useId();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="hd">
          <h2 id={id}>{title}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="bd">{children}</div>
        {footer && <div className="ft">{footer}</div>}
      </div>
    </div>
  );
}

export function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  if (pages <= 1) return <div className="small muted" style={{ padding: '10px 16px' }}>{total} record(s)</div>;
  return (
    <div className="between small" style={{ padding: '10px 16px' }}>
      <span className="muted">
        {total} records · page {page} of {pages}
      </span>
      <div className="row">
        <Btn size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ‹ Prev
        </Btn>
        <Btn size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next ›
        </Btn>
      </div>
    </div>
  );
}

/** Debounced search input. */
export function Search({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    const t = setTimeout(() => v !== value && onChange(v), 300);
    return () => clearTimeout(t);
  }, [v, value, onChange]);
  return <input className="search" type="search" placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} aria-label={placeholder} />;
}

export function KV({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="kv">
      {rows.map(([k, v], i) => (
        <div key={i} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v === null || v === undefined || v === '' ? <span className="faint">—</span> : v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="steps">
      {steps.map((s, i) => (
        <span key={s} className={`step ${i < current ? 'done' : i === current ? 'cur' : ''}`}>
          {i < current ? '✓' : `${i + 1}.`} {s}
        </span>
      ))}
    </div>
  );
}

/** Field-error lookup for an ApiError returned by a form submission. */
export const fieldErr = (e: unknown, k: string) => (e instanceof ApiError ? e.fields[k] : undefined);
