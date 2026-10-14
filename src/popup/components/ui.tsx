import type { ReactNode } from 'react';

export const SECTION_LABEL = 'text-[11px] font-medium tracking-wide text-stone-500 uppercase dark:text-stone-400';

const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700';

export const SECONDARY_BUTTON = `inline-flex items-center justify-center gap-1.5 rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800 ${FOCUS_RING}`;

export const PRIMARY_BUTTON = `flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-rose-800 text-sm font-medium text-white hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-rose-700 dark:hover:bg-rose-600 ${FOCUS_RING}`;

export function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-900">
      <div className="mb-2 flex min-h-5 items-center justify-between gap-2">
        <h2 className={SECTION_LABEL}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Collapsible section built on <details>, so it is keyboard accessible without extra code. */
export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
      <summary
        className={`flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-2.5 ${FOCUS_RING} [&::-webkit-details-marker]:hidden`}
      >
        <span className={SECTION_LABEL}>{title}</span>
        <span aria-hidden="true" className="text-stone-400 group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
}

export function Switch({
  checked,
  label,
  disabled,
  onChange,
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2 rounded-md text-sm disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
    >
      <span
        aria-hidden="true"
        className={`flex h-5 w-9 items-center rounded-full p-0.5 ${checked ? 'justify-end bg-rose-800 dark:bg-rose-600' : 'justify-start bg-stone-300 dark:bg-stone-700'}`}
      >
        <span className="size-4 rounded-full bg-white shadow-sm" />
      </span>
      {label}
    </button>
  );
}
