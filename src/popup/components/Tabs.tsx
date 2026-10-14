import type { LucideIcon } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
}

/** WAI-ARIA tabs: one tab stop, arrow/Home/End keys move between tabs. Panels use id `panel-<id>`. */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: TabItem<T>[]; value: T; onChange: (id: T) => void }) {
  const refs = useRef(new Map<T, HTMLButtonElement>());

  function onKeyDown(event: KeyboardEvent) {
    const index = tabs.findIndex((tab) => tab.id === value);
    const next =
      event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
      : event.key === 'Home' ? 0
      : event.key === 'End' ? tabs.length - 1
      : null;
    const tab = next === null ? undefined : tabs[next];
    if (!tab) return;
    event.preventDefault();
    onChange(tab.id);
    refs.current.get(tab.id)?.focus();
  }

  return (
    <div role="tablist" aria-label="SubLanka sections" className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-stone-200/70 p-1 dark:bg-stone-800">
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(element) => {
              if (element) refs.current.set(tab.id, element);
              else refs.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={onKeyDown}
            className={`flex items-center justify-center gap-1.5 rounded-md px-1.5 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 dark:focus-visible:outline-rose-400 ${
              selected
                ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-950 dark:text-stone-50'
                : 'text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-stone-50'
            }`}
          >
            {tab.icon && <tab.icon className="size-3.5 shrink-0" aria-hidden="true" />}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
