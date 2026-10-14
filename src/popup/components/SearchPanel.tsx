import { LoaderCircle, Search, Settings, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { DetectedMedia } from '../../discovery/mediaDetection';
import { rankResults } from '../../discovery/subtitleRanking';
import type { AccountStatus } from '../../providers/opensubtitles';
import { PROVIDERS, SINHALA_LANGUAGE } from '../../providers';
import { ProviderError, type SearchPage, type SubtitleQuery, type SubtitleResult } from '../../providers/types';
import { DOWNLOAD_STATUS_KEY, isDownloadStatus, type DownloadStatus, type PlayerState } from '../../shared/messages';
import { buildQuery, EMPTY_FORM, loadSearchState, saveSearchState, type SearchForm } from '../searchState';
import { detectPageMedia, requestDownload } from '../tabBridge';
import { SegmentedControl } from './AppearanceSettings';
import { ResultCard } from './ResultCard';
import { TitleField } from './TitleField';
import { Card, PRIMARY_BUTTON, SECONDARY_BUTTON } from './ui';

const provider = PROVIDERS.opensubtitles;
/** A download still "loading" after this long was cut off (e.g. the browser suspended the worker). */
const STALE_DOWNLOAD_MS = 2 * 60_000;

const SOURCE_LABELS: Record<DetectedMedia['source'], string> = {
  'structured-data': 'page structured data',
  'open-graph': 'page sharing tags',
  player: 'video player title',
  'page-title': 'tab title',
  heading: 'page heading',
};

const CONFIDENCE_LABELS: Record<DetectedMedia['confidence'], string> = {
  high: 'Detected from the',
  medium: 'Possible match from the',
  low: 'Unsure guess from the',
};

const INPUT =
  'w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm placeholder:text-stone-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rose-700 dark:border-stone-700 dark:bg-stone-950';
const LABEL = 'mb-1 block text-xs font-medium text-stone-600 dark:text-stone-300';

type SearchStatus =
  | { phase: 'idle' }
  | { phase: 'searching' }
  | { phase: 'done'; query: SubtitleQuery; page: SearchPage }
  | { phase: 'error'; message: string; needsSetup: boolean };

export function describeMedia(media: Pick<DetectedMedia, 'kind' | 'title' | 'year' | 'season' | 'episode'>): string {
  if (media.kind === 'movie') return media.year ? `${media.title} (${media.year})` : media.title;
  const code =
    media.season !== undefined && media.episode !== undefined
      ? ` · S${String(media.season).padStart(2, '0')}E${String(media.episode).padStart(2, '0')}`
      : media.season !== undefined
        ? ` · Season ${media.season}`
        : '';
  return `${media.title}${code}`;
}

function formFromMedia(media: DetectedMedia): SearchForm {
  return {
    kind: media.kind,
    title: media.title,
    year: media.year?.toString() ?? '',
    season: media.season?.toString() ?? '',
    episode: media.episode?.toString() ?? '',
    selected: null,
  };
}

/** A "loading" status left behind by a worker that was cut off is shown as interrupted. */
function restoredStatus(value: DownloadStatus): DownloadStatus {
  return value.phase === 'loading' && Date.now() - value.startedAt > STALE_DOWNLOAD_MS
    ? { ...value, phase: 'failed', message: 'The last download was interrupted. Try loading it again.' }
    : value;
}

const sameForm = (a: SearchForm, b: SearchForm) => (Object.keys(a) as (keyof SearchForm)[]).every((key) => a[key] === b[key]);

export function SearchPanel({
  tabId,
  currentTrack,
  account,
  onOpenSettings,
  onTrackLoaded,
}: {
  tabId: number | null;
  currentTrack: PlayerState['track'];
  /** null while loading. */
  account: AccountStatus | null;
  onOpenSettings: () => void;
  onTrackLoaded: (state: PlayerState, warnings: string[]) => void;
}) {
  const [form, setForm] = useState<SearchForm>(EMPTY_FORM);
  const [restored, setRestored] = useState(false);
  /** undefined while the page is being checked. */
  const [detected, setDetected] = useState<DetectedMedia | null | undefined>(undefined);
  const [detectRun, setDetectRun] = useState(0);
  const [status, setStatus] = useState<SearchStatus>({ phase: 'idle' });
  const [formError, setFormError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [download, setDownload] = useState<DownloadStatus | null>(null);
  const searchRef = useRef<AbortController | null>(null);

  // Restore the last form, results and download notice; the popup is a fresh page every time it opens.
  useEffect(() => {
    let active = true;
    loadSearchState()
      .catch(() => null)
      .then((saved) => {
        if (!active) return;
        if (saved) {
          setForm(saved.form);
          if (saved.results) setStatus({ phase: 'done', ...saved.results });
        }
        setRestored(true);
      });
    chrome.storage.session.get(DOWNLOAD_STATUS_KEY).then(
      (stored) => {
        const saved: unknown = stored[DOWNLOAD_STATUS_KEY];
        if (active && isDownloadStatus(saved)) setDownload(restoredStatus(saved));
      },
      () => undefined,
    );
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      const change = changes[DOWNLOAD_STATUS_KEY];
      if (area === 'session' && change && isDownloadStatus(change.newValue)) setDownload(change.newValue);
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(onChanged);
      searchRef.current?.abort();
    };
  }, []);

  // Detect after restoring, so what the page says only fills an empty form and never overwrites what the user typed.
  useEffect(() => {
    if (tabId === null || !restored) return;
    let active = true;
    detectPageMedia(tabId)
      .catch(() => null)
      .then((media) => {
        if (!active) return;
        setDetected(media);
        // An ambiguous guess is only offered, never filled in. No detection ever picks a title suggestion for the user.
        if (media && media.confidence !== 'low') setForm((current) => (current.title === '' ? formFromMedia(media) : current));
      });
    return () => {
      active = false;
    };
  }, [tabId, restored, detectRun]);

  function persist(nextForm: SearchForm, nextStatus: SearchStatus) {
    const results = nextStatus.phase === 'done' ? { query: nextStatus.query, page: nextStatus.page } : null;
    saveSearchState({ form: nextForm, results }).catch(() => undefined);
  }

  function updateForm(patch: Partial<SearchForm>) {
    const next = { ...form, ...patch };
    setForm(next);
    setFormError(null);
    if (restored) persist(next, status);
  }

  /** Runs one search. A newer search or Cancel aborts it, and its late reply is ignored. */
  async function runSearch(query: SubtitleQuery, previous: SearchPage | null) {
    searchRef.current?.abort();
    const controller = new AbortController();
    searchRef.current = controller;
    if (previous) setLoadingMore(true);
    else setStatus({ phase: 'searching' });

    try {
      let page = await provider.search(query, controller.signal);
      if (searchRef.current !== controller) return;
      // OpenSubtitles may not know the IMDb id; fall back to the title (without the series' premiere year).
      if (!previous && query.imdbId !== undefined && page.results.length === 0) {
        query = { ...query, imdbId: undefined };
        page = await provider.search(query, controller.signal);
        if (searchRef.current !== controller) return;
      }
      const seen = new Set(previous?.results.map((result) => result.id));
      const merged: SearchPage = previous
        ? { ...page, results: [...previous.results, ...page.results.filter((result) => !seen.has(result.id))] }
        : page;
      const next: SearchStatus = { phase: 'done', query, page: merged };
      setStatus(next);
      persist(form, next);
    } catch (error) {
      if (searchRef.current !== controller || controller.signal.aborted) return;
      const message = error instanceof ProviderError ? error.message : 'The search could not be completed. Try again.';
      const needsSetup = error instanceof ProviderError && ['setup-required', 'invalid-key', 'auth'].includes(error.code);
      // A failed "Load more" keeps the results already shown.
      if (previous) setFormError(message);
      else setStatus({ phase: 'error', message, needsSetup });
    } finally {
      if (searchRef.current === controller) {
        searchRef.current = null;
        setLoadingMore(false);
      }
    }
  }

  function submit() {
    const query = buildQuery(form, SINHALA_LANGUAGE);
    if (typeof query === 'string') {
      setFormError(query);
      return;
    }
    setFormError(null);
    void runSearch(query, null);
  }

  function cancel() {
    searchRef.current?.abort();
    searchRef.current = null;
    setLoadingMore(false);
    setStatus((current) => (current.phase === 'searching' ? { phase: 'idle' } : current));
  }

  async function load(result: SubtitleResult) {
    if (tabId === null) return;
    const label = result.fileName ?? result.release;
    // Shown at once; the worker then reports real progress through chrome.storage.session.
    // Runs on click, not during render, so reading the clock is safe.
    // eslint-disable-next-line react-hooks/purity
    const startedAt = Date.now();
    setDownload({ tabId, downloadId: result.downloadId, label, phase: 'loading', message: `Downloading ${label}…`, remaining: null, startedAt });
    const response = await requestDownload({ tabId, provider: result.provider, downloadId: result.downloadId, label }).catch(() => ({
      ok: false as const,
      message: 'SubLanka could not start the download. Reload the extension and try again.',
    }));
    if (response.ok) onTrackLoaded(response.state, response.warnings);
    else setDownload((current) => current && { ...current, phase: 'failed', message: response.message });
  }

  const searching = status.phase === 'searching';
  const needsApiKey = account !== null && !account.hasApiKey;
  const shownDownload = download && download.tabId === tabId ? download : null;
  const downloading = shownDownload?.phase === 'loading';
  const ranked = status.phase === 'done' ? rankResults(status.query, status.page.results) : [];
  const strongCount = ranked.filter(({ match }) => match.level === 'strong').length;

  return (
    <div className="flex flex-col gap-3">
      {needsApiKey && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">Subtitle provider setup is required before searching.</p>
          <p className="mt-1 leading-relaxed">SubLanka searches OpenSubtitles.com with your own free API key.</p>
          <button type="button" className={`${SECONDARY_BUTTON} mt-2`} onClick={onOpenSettings}>
            <Settings className="size-3.5" aria-hidden="true" />
            Set up OpenSubtitles
          </button>
        </div>
      )}

      <Card title="Find Sinhala subtitles">
        <DetectedHint
          tabId={tabId}
          detected={detected}
          form={form}
          onRetry={() => {
            setDetected(undefined);
            setDetectRun((run) => run + 1);
          }}
          onUse={(media) => {
            const next = formFromMedia(media);
            setForm(next);
            setFormError(null);
            persist(next, status);
          }}
        />

        <form
          className="mt-3 flex flex-col gap-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <SegmentedControl
            label="Type"
            name="media-kind"
            value={form.kind}
            options={[
              { value: 'movie', label: 'Movie' },
              { value: 'episode', label: 'TV episode' },
            ]}
            // A movie id is not a series id, so a change of type drops the selection.
            onChange={(kind) => updateForm({ kind, selected: null })}
          />
          <TitleField
            key={form.kind}
            kind={form.kind}
            value={form.title}
            selected={form.selected}
            onType={(title) => updateForm({ title, selected: null })}
            onSelect={(selected) => updateForm({ title: selected.title, year: selected.year?.toString() ?? '', selected })}
            onClear={() => updateForm({ title: '', year: '', selected: null })}
          />
          <div className={`grid gap-2 ${form.kind === 'episode' ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <NumberField id="search-year" label="Year" optional value={form.year} onChange={(year) => updateForm({ year })} />
            {form.kind === 'episode' && (
              <>
                <NumberField id="search-season" label="Season" value={form.season} onChange={(season) => updateForm({ season })} />
                <NumberField id="search-episode" label="Episode" value={form.episode} onChange={(episode) => updateForm({ episode })} />
              </>
            )}
            {form.kind === 'movie' && (
              <div>
                <span className={LABEL}>Language</span>
                <p className="py-1.5 text-sm">Sinhala</p>
              </div>
            )}
          </div>
          {form.kind === 'episode' && <p className="text-xs text-stone-500 dark:text-stone-400">Language: Sinhala</p>}

          {formError && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-300">
              {formError}
            </p>
          )}

          {searching ? (
            <button type="button" className={PRIMARY_BUTTON} onClick={cancel}>
              <X className="size-4" aria-hidden="true" />
              Cancel search
            </button>
          ) : (
            <button type="submit" className={PRIMARY_BUTTON} disabled={needsApiKey}>
              <Search className="size-4" aria-hidden="true" />
              Search
            </button>
          )}
        </form>
      </Card>

      {shownDownload && <DownloadNotice status={shownDownload} />}

      <section aria-label="Search results" aria-live="polite" aria-busy={searching} className="flex flex-col gap-2">
        {searching && (
          <p className="flex items-center justify-center gap-2 py-6 text-sm text-stone-500 dark:text-stone-400">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Searching OpenSubtitles…
          </p>
        )}

        {status.phase === 'error' && (
          <div role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-800 dark:bg-red-950 dark:text-red-200">
            <p>{status.message}</p>
            {status.needsSetup && (
              <button type="button" className={`${SECONDARY_BUTTON} mt-2`} onClick={onOpenSettings}>
                Open settings
              </button>
            )}
          </div>
        )}

        {status.phase === 'done' && ranked.length === 0 && (
          <p className="rounded-xl border border-dashed border-stone-300 px-3 py-5 text-center text-sm text-stone-600 dark:border-stone-700 dark:text-stone-300">
            No Sinhala subtitles found. Try another title or release.
          </p>
        )}

        {status.phase === 'done' && ranked.length > 0 && (
          <>
            <div className="px-1 text-xs text-stone-500 dark:text-stone-400">
              <p>
                {status.page.totalCount.toLocaleString()} Sinhala {status.page.totalCount === 1 ? 'subtitle' : 'subtitles'} for “{describeMedia(status.query)}”
              </p>
              {strongCount > 1 && <p className="mt-0.5">Several close matches. Compare release names before loading.</p>}
              {strongCount === 0 && <p className="mt-0.5">None of these could be confirmed as an exact match. Check the details before loading.</p>}
              {currentTrack && <p className="mt-0.5">Loading a result replaces “{currentTrack.fileName}”.</p>}
            </div>
            <ul className="flex flex-col gap-2">
              {ranked.map(({ result, match }) => (
                <li key={result.id}>
                  <ResultCard
                    result={result}
                    match={match}
                    providerName={provider.name}
                    loading={downloading && shownDownload.downloadId === result.downloadId}
                    disabled={tabId === null || downloading}
                    onLoad={() => void load(result)}
                  />
                </li>
              ))}
            </ul>
            {status.page.page < status.page.totalPages && (
              <button
                type="button"
                className={`${SECONDARY_BUTTON} self-center`}
                disabled={loadingMore}
                onClick={() => void runSearch({ ...status.query, page: status.page.page + 1 }, status.page)}
              >
                {loadingMore && <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />}
                {loadingMore ? 'Loading…' : 'Show more results'}
              </button>
            )}
          </>
        )}
      </section>

      <p className="px-1 text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
        Only the title, year, season and episode above (or the chosen title’s IMDb id) are sent to{' '}
        <a href="https://www.opensubtitles.com/" target="_blank" rel="noreferrer" className="underline">
          OpenSubtitles.com
        </a>
        , which provides the subtitles. Title suggestions send only what you type to{' '}
        <a href="https://www.wikidata.org/" target="_blank" rel="noreferrer" className="underline">
          Wikidata
        </a>{' '}
        (movies) or{' '}
        <a href="https://www.tvmaze.com/" target="_blank" rel="noreferrer" className="underline">
          TVmaze
        </a>{' '}
        (TV).
      </p>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  optional,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  optional?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
        {optional && <span className="font-normal text-stone-400"> (optional)</span>}
      </label>
      <input
        id={id}
        className={INPUT}
        inputMode="numeric"
        value={value}
        maxLength={4}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, ''))}
      />
    </div>
  );
}

function DetectedHint({
  tabId,
  detected,
  form,
  onRetry,
  onUse,
}: {
  tabId: number | null;
  detected: DetectedMedia | null | undefined;
  form: SearchForm;
  onRetry: () => void;
  onUse: (media: DetectedMedia) => void;
}) {
  if (tabId === null) return <p className="text-xs text-stone-500 dark:text-stone-400">Enter the title of what you are watching.</p>;
  if (detected === undefined) {
    return (
      <p className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
        Checking this page for a title…
      </p>
    );
  }
  if (detected === null) {
    return (
      <div className="flex items-start gap-2 text-xs text-stone-500 dark:text-stone-400">
        <p className="min-w-0 flex-1 leading-relaxed">
          No movie or episode details found on this page. Enter the title below. Some players, such as Netflix, show the title only while
          their controls are visible: move the pointer over the video, then check again.
        </p>
        <button type="button" className={`${SECONDARY_BUTTON} shrink-0`} onClick={onRetry}>
          Check again
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg bg-stone-100 px-2.5 py-2 text-xs dark:bg-stone-800">
      <p className="min-w-0 flex-1">
        <span className="text-stone-500 dark:text-stone-400">
          {CONFIDENCE_LABELS[detected.confidence]} {SOURCE_LABELS[detected.source]}:{' '}
        </span>
        <span className="font-medium break-words">{describeMedia(detected)}</span>
        {detected.confidence === 'low' && <span className="text-stone-500 dark:text-stone-400"> Check it before searching.</span>}
      </p>
      {!sameForm(form, formFromMedia(detected)) && (
        <button type="button" className={`${SECONDARY_BUTTON} shrink-0`} onClick={() => onUse(detected)}>
          Use
        </button>
      )}
    </div>
  );
}

function DownloadNotice({ status: { phase, message } }: { status: DownloadStatus }) {
  const style =
    phase === 'loading' ? 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200'
    : phase === 'loaded' ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
    : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200';
  return (
    <p role={phase === 'failed' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs leading-relaxed break-words ${style}`}>
      {phase === 'loading' && <LoaderCircle className="mt-0.5 size-3.5 shrink-0 animate-spin" aria-hidden="true" />}
      <span className="min-w-0">{message}</span>
    </p>
  );
}
