import { LoaderCircle } from 'lucide-react';
import type { TabStatus } from '../tabBridge';

const STATUS_COPY: Record<TabStatus['kind'], { title: string; detail: string; dot: string }> = {
  ready: {
    title: 'Ready to use',
    detail: 'SubLanka can display subtitles on this page.',
    dot: 'bg-emerald-500',
  },
  unsupported: {
    title: 'Unsupported page',
    detail: 'Browser and extension pages cannot show subtitles. Open a regular website.',
    dot: 'bg-amber-500',
  },
  unavailable: {
    title: 'Unable to access this tab',
    detail: 'Chrome blocked access to this page. Try reloading it, or for local files enable “Allow access to file URLs”.',
    dot: 'bg-red-500',
  },
};

export function TabStatusCard({ status }: { status: TabStatus | null }) {
  return (
    <section
      aria-live="polite"
      className="rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-900"
    >
      <p className="mb-1.5 text-[11px] font-medium tracking-wide text-stone-500 uppercase dark:text-stone-400">
        Current tab
      </p>
      {status === null ? (
        <p className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-300">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Checking this tab…
        </p>
      ) : (
        <>
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className={`size-2 rounded-full ${STATUS_COPY[status.kind].dot}`} aria-hidden="true" />
            {STATUS_COPY[status.kind].title}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
            {STATUS_COPY[status.kind].detail}
          </p>
        </>
      )}
    </section>
  );
}
