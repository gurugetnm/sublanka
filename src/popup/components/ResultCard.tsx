import { Download, ExternalLink, LoaderCircle } from 'lucide-react';
import type { MatchAssessment, MatchLevel } from '../../discovery/subtitleRanking';
import type { SubtitleResult } from '../../providers/types';
import { SECONDARY_BUTTON } from './ui';

const LEVELS: Record<MatchLevel, { label: string; className: string }> = {
  strong: { label: 'Strong match', className: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  title: { label: 'Title match', className: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  possible: { label: 'Possible match', className: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300' },
  mismatch: { label: 'Check details', className: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
};

const TAG = 'rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300';

function featureLine({ feature }: SubtitleResult): string | null {
  if (feature.kind === 'episode') {
    const code =
      feature.season !== null && feature.episode !== null
        ? `S${String(feature.season).padStart(2, '0')}E${String(feature.episode).padStart(2, '0')}`
        : null;
    return [feature.seriesTitle, code, feature.title].filter(Boolean).join(' · ') || null;
  }
  if (!feature.title) return null;
  return feature.year ? `${feature.title} (${feature.year})` : feature.title;
}

function formatDate(value: string | null): string | null {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : null;
}

export function ResultCard({
  result,
  match,
  providerName,
  loading,
  disabled,
  onLoad,
}: {
  result: SubtitleResult;
  match: MatchAssessment;
  providerName: string;
  loading: boolean;
  disabled: boolean;
  onLoad: () => void;
}) {
  const level = LEVELS[match.level];
  const feature = featureLine(result);
  const uploaded = formatDate(result.uploadDate);
  const facts = [
    result.downloadCount !== null && `${result.downloadCount.toLocaleString()} downloads`,
    uploaded && `Uploaded ${uploaded}`,
    providerName,
  ].filter(Boolean);

  return (
    <article className="rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-sm font-medium break-all" title={result.release}>
          {result.release}
        </h3>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${level.className}`}>{level.label}</span>
      </div>
      {feature && <p className="mt-0.5 text-xs text-stone-600 dark:text-stone-300">{feature}</p>}
      {match.notes.length > 0 && <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">{match.notes.join(' · ')}</p>}

      <div className="mt-2 flex flex-wrap gap-1">
        <span className={TAG}>{result.language === 'si' ? 'Sinhala' : result.language}</span>
        <span className={TAG}>SRT</span>
        {result.hearingImpaired && <span className={TAG}>Hearing impaired</span>}
        {result.fromTrusted && <span className={TAG}>Trusted uploader</span>}
        {result.aiTranslated && <span className={TAG}>AI translated</span>}
        {result.machineTranslated && <span className={TAG}>Machine translated</span>}
        {result.fileCount > 1 && <span className={TAG}>Part 1 of {result.fileCount} only</span>}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <p className="min-w-0 flex-1 text-[11px] text-stone-500 dark:text-stone-400">
          {facts.join(' · ')}
          {result.pageUrl && (
            <>
              {' · '}
              <a href={result.pageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">
                Details
                <ExternalLink className="size-3" aria-hidden="true" />
                <span className="sr-only"> on {providerName} (opens in a new tab)</span>
              </a>
            </>
          )}
        </p>
        <button
          type="button"
          className={`${SECONDARY_BUTTON} shrink-0`}
          disabled={disabled}
          onClick={onLoad}
          aria-label={`Load subtitles: ${result.release}`}
        >
          {loading ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <Download className="size-3.5" aria-hidden="true" />}
          {loading ? 'Loading…' : 'Load subtitles'}
        </button>
      </div>
    </article>
  );
}
