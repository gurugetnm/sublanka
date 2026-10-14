import { FileUp, Languages, Search, type LucideIcon } from 'lucide-react';

const FEATURES: { label: string; Icon: LucideIcon }[] = [
  { label: 'Find Sinhala subtitles', Icon: Search },
  { label: 'Translate English subtitles', Icon: Languages },
  { label: 'Upload subtitle files', Icon: FileUp },
];

export function UpcomingFeatures() {
  return (
    <section>
      <h2 className="mb-2 text-[11px] font-medium tracking-wide text-stone-500 uppercase dark:text-stone-400">
        Upcoming features
      </h2>
      <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
        {FEATURES.map(({ label, Icon }) => (
          <li key={label} className="flex items-center gap-3 px-3 py-2.5 text-sm text-stone-600 dark:text-stone-300">
            <Icon className="size-4 shrink-0 text-stone-400 dark:text-stone-500" aria-hidden="true" />
            <span className="flex-1">{label}</span>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400">
              Coming soon
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
