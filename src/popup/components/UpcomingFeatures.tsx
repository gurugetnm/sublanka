import { Languages, Search, type LucideIcon } from 'lucide-react';
import { SECTION_LABEL } from './ui';

const FEATURES: { label: string; Icon: LucideIcon }[] = [
  { label: 'Find Sinhala subtitles', Icon: Search },
  { label: 'Translate English subtitles', Icon: Languages },
];

export function UpcomingFeatures() {
  return (
    <section>
      <h2 className={`mb-2 ${SECTION_LABEL}`}>Upcoming features</h2>
      <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
        {FEATURES.map(({ label, Icon }) => (
          <li key={label} className="flex items-center gap-3 px-3 py-2 text-sm text-stone-600 dark:text-stone-300">
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
