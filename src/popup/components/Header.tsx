import { Captions } from 'lucide-react';

export function Header({ version }: { version: string }) {
  return (
    <header className="flex items-center gap-2.5">
      <div className="flex size-8 items-center justify-center rounded-lg bg-rose-800 text-white">
        <Captions className="size-4" strokeWidth={2.25} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="text-[15px] leading-tight font-semibold tracking-tight">SubLanka</h1>
        <p className="text-xs text-stone-500 dark:text-stone-400">Sinhala subtitles, made simple</p>
      </div>
      <span className="text-[11px] text-stone-500 tabular-nums dark:text-stone-400">v{version}</span>
    </header>
  );
}
