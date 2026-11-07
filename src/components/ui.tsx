'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { COLOR_GROUP_OF, GROUP_META, STATUS_META, TYPE_LABEL, type ActivityType, type WorkStatus } from '@/lib/meta';

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon, tone = 'default' }: {
  label: string; value: React.ReactNode; hint?: string; icon?: React.ReactNode; tone?: 'default' | 'warn' | 'bad' | 'good';
}) {
  const toneCls = { default: 'text-muted', warn: 'text-amber-600 dark:text-amber-400', bad: 'text-red-600 dark:text-red-400', good: 'text-emerald-600 dark:text-emerald-400' }[tone];
  return (
    <div className="card animate-fade-in p-4">
      <div className="flex items-center justify-between text-xs font-medium text-muted">
        <span>{label}</span><span className={toneCls}>{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function TypeBadge({ type }: { type: ActivityType }) {
  const g = GROUP_META[COLOR_GROUP_OF[type]];
  return (
    <span className={clsx('chip', g.soft, g.text)}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: g.hex }} />{TYPE_LABEL[type]}
    </span>
  );
}

export function StatusBadge({ status }: { status: WorkStatus }) {
  const m = STATUS_META[status];
  return <span className={clsx('chip', m.cls)}>{m.label}</span>;
}

export function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={clsx('chip', className)}>{children}</span>;
}

export function EmptyState({ icon, title, text }: { icon?: React.ReactNode; title: string; text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <div className="font-medium">{title}</div>
      {text && <div className="mt-1 max-w-sm text-sm text-muted">{text}</div>}
    </div>
  );
}

/** Tilgjengelig modal (Esc lukker, fokus fanges, klikk utenfor lukker) */
export function Modal({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
        className={clsx('card shadow-float max-h-[90vh] w-full animate-fade-in overflow-y-auto p-5', wide ? 'max-w-2xl' : 'max-w-md')}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">{title}</h2>
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label="Lukk"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Sidepanel for detaljer */
export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/30" onMouseDown={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 h-full w-full max-w-md animate-slide-in overflow-y-auto border-l border-line bg-panel p-6 shadow-float">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold leading-snug">{title}</h2>
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label="Lukk"><X size={16} /></button>
        </div>
        {children}
      </aside>
    </div>
  );
}

/** Enkel toast-varsling */
export function useToast() {
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);
  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(null), 3500); return () => clearTimeout(t); } }, [msg]);
  const node = msg ? (
    <div role="status" className={clsx('fixed bottom-5 right-5 z-[60] animate-fade-in rounded-lg px-4 py-2.5 text-sm text-white shadow-pop',
      msg.tone === 'ok' ? 'bg-zinc-900 dark:bg-zinc-700' : 'bg-red-600')}>{msg.text}</div>
  ) : null;
  return { toast: (text: string, tone: 'ok' | 'err' = 'ok') => setMsg({ text, tone }), toastNode: node };
}

export function Select({ value, onChange, options, label, className }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string; className?: string;
}) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={clsx('input w-auto py-1.5', className)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
