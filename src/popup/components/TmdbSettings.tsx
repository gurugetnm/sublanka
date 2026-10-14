import { useState } from 'react';
import { clearSuggestionCache, saveTmdbApiKey } from '../../metadata/tmdb';
import { Card, SECONDARY_BUTTON } from './ui';

const INPUT =
  'w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rose-700 dark:border-stone-700 dark:bg-stone-950';
const HELP = 'text-[11px] leading-relaxed text-stone-500 dark:text-stone-400';

export function TmdbSettings({ configured, onChange }: { configured: boolean | null; onChange: (configured: boolean) => void }) {
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(value: string) {
    setBusy(true);
    setError(null);
    try {
      await saveTmdbApiKey(value);
      clearSuggestionCache();
      setApiKey('');
      onChange(value.trim() !== '');
    } catch {
      setError('Could not save the API key.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Title suggestions">
      <p className="text-sm font-medium">TMDB (The Movie Database)</p>
      <p className={`mt-0.5 ${HELP}`}>
        Suggests real movie and series titles as you type in Search. Needs your own free TMDB API key or read access token (
        <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer" className="underline">
          get one
        </a>
        ). It is kept on this device and only the title you type is sent to TMDB. Search works without it.
      </p>
      {configured === null ? (
        <p className="mt-2 text-xs text-stone-500">Loading…</p>
      ) : configured ? (
        <div className="mt-3 flex items-center gap-2">
          <p className="flex-1 text-xs">TMDB key saved on this device.</p>
          <button type="button" className={SECONDARY_BUTTON} disabled={busy} onClick={() => void save('')}>
            Remove key
          </button>
        </div>
      ) : (
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (apiKey.trim()) void save(apiKey);
          }}
        >
          <label className="min-w-0 flex-1 text-xs font-medium text-stone-600 dark:text-stone-300">
            TMDB API key or access token
            <input type="password" autoComplete="off" className={`${INPUT} mt-1`} value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
          </label>
          <button type="submit" className={`${SECONDARY_BUTTON} py-1.5`} disabled={busy || !apiKey.trim()}>
            Save
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {/* Attribution TMDB's API terms require. */}
      <p className={`mt-2 ${HELP}`}>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
    </Card>
  );
}
