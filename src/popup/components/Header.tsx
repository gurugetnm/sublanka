import { Captions } from 'lucide-react';

export function Header() {
  return (
    <header className="flex items-center gap-3">
      <div className="flex size-10 items-center justify-center rounded-xl bg-rose-800 text-white">
        <Captions className="size-5" strokeWidth={2.25} aria-hidden="true" />
      </div>
      <div>
        <h1 className="text-[15px] leading-tight font-semibold tracking-tight">SubLanka</h1>
        <p className="text-xs text-stone-500 dark:text-stone-400">Sinhala subtitles, made simple</p>
      </div>
    </header>
  );
}
