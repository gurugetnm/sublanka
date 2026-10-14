import { LoaderCircle, Upload } from 'lucide-react';
import { useRef, useState, type ReactNode, type RefObject } from 'react';

export const SECTION_LABEL = 'text-[11px] font-medium tracking-wide text-stone-500 uppercase dark:text-stone-400';

export const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 dark:focus-visible:outline-rose-400';

export const SECONDARY_BUTTON = `inline-flex items-center justify-center gap-1.5 rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800 ${FOCUS_RING}`;

export const INPUT = `w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm placeholder:text-stone-500 aria-invalid:border-red-600 dark:border-stone-700 dark:bg-stone-950 dark:aria-invalid:border-red-400 ${FOCUS_RING.replace('outline-offset-2', 'outline-offset-1')}`;

export const LABEL = 'mb-1 block text-xs font-medium text-stone-600 dark:text-stone-300';

export const HELP = 'text-[11px] leading-relaxed text-stone-500 dark:text-stone-400';

export const ERROR_BOX = 'rounded-md bg-red-50 px-2.5 py-2 text-xs text-red-800 dark:bg-red-950 dark:text-red-200';

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
        <span aria-hidden="true" className="text-stone-500 group-open:rotate-180 dark:text-stone-400">
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
        className={`flex h-5 w-9 items-center rounded-full p-0.5 ${checked ? 'justify-end bg-rose-800 dark:bg-rose-600' : 'justify-start bg-stone-500 dark:bg-stone-500'}`}
      >
        <span className="size-4 rounded-full bg-white shadow-sm" />
      </span>
      {label}
    </button>
  );
}

/**
 * Subtitle file chooser: click (or Enter/Space) opens the system picker, and a file can also be dropped on it.
 * Dropping is the fallback where the system file dialog closes the extension popup.
 */
export function FilePicker({
  title,
  detail,
  busy = false,
  disabled = false,
  onFile,
}: {
  title: string;
  detail: string;
  busy?: boolean;
  disabled?: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const blocked = disabled || busy;

  return (
    <>
      <FileInput inputRef={inputRef} onFile={onFile} />
      <button
        type="button"
        disabled={blocked}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          if (blocked) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file && !blocked) onFile(file);
        }}
        className={`flex w-full flex-col items-center gap-1 rounded-lg border border-dashed px-3 py-4 text-sm hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-stone-800 ${
          dragging ? 'border-rose-700 bg-rose-50 dark:border-rose-400 dark:bg-rose-950' : 'border-stone-400 dark:border-stone-600'
        } ${FOCUS_RING}`}
      >
        {busy ? (
          <LoaderCircle className="size-5 animate-spin text-stone-500 dark:text-stone-400" aria-hidden="true" />
        ) : (
          <Upload className="size-5 text-stone-500 dark:text-stone-400" aria-hidden="true" />
        )}
        <span className="font-medium">{title}</span>
        <span className="text-xs text-stone-500 dark:text-stone-400">{detail}</span>
      </button>
    </>
  );
}

/** Hidden .srt/.vtt input; opened through `inputRef.current.click()` by a visible button. */
export function FileInput({ inputRef, onFile }: { inputRef: RefObject<HTMLInputElement | null>; onFile: (file: File) => void }) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept=".srt,.vtt"
      className="hidden"
      tabIndex={-1}
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = ''; // allow choosing the same file again
        if (file) onFile(file);
      }}
    />
  );
}

/** Error with optional recovery actions. Only the message is the alert, so screen readers do not read the buttons out with it. */
export function ErrorBox({ children, actions, className = '' }: { children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={`${ERROR_BOX} ${className}`}>
      <p role="alert">{children}</p>
      {actions && <div className="mt-2 flex flex-wrap gap-1.5">{actions}</div>}
    </div>
  );
}
