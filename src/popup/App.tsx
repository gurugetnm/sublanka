import { Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { TabStatusCard } from './components/TabStatusCard';
import { UpcomingFeatures } from './components/UpcomingFeatures';
import { getActiveTabStatus, setDemoSubtitle, type TabStatus } from './tabBridge';

export function App() {
  const [status, setStatus] = useState<TabStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getActiveTabStatus().then(setStatus, () => setStatus({ kind: 'unavailable' }));
  }, []);

  const ready = status?.kind === 'ready' ? status : null;

  async function toggleDemoSubtitle() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const subtitleVisible = await setDemoSubtitle(ready.tabId, !ready.subtitleVisible);
      setStatus({ ...ready, subtitleVisible });
    } catch {
      setError('Could not update the subtitle on this page. Reload the page and try again.');
    } finally {
      setBusy(false);
    }
  }

  const ButtonIcon = busy ? LoaderCircle : ready?.subtitleVisible ? EyeOff : Eye;

  return (
    <main className="flex flex-col gap-4 p-4">
      <Header />
      <TabStatusCard status={status} />

      <div>
        <button
          type="button"
          onClick={toggleDemoSubtitle}
          disabled={!ready || busy}
          className={`flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 disabled:cursor-not-allowed disabled:opacity-50 ${
            ready?.subtitleVisible
              ? 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800'
              : 'bg-rose-800 text-white hover:bg-rose-900 dark:bg-rose-700 dark:hover:bg-rose-600'
          }`}
        >
          <ButtonIcon className={`size-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
          {ready?.subtitleVisible ? 'Hide Demo Subtitle' : 'Show Demo Subtitle'}
        </button>
        {error && (
          <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>

      <UpcomingFeatures />

      <footer className="border-t border-stone-200 pt-3 text-[11px] text-stone-400 dark:border-stone-800 dark:text-stone-500">
        SubLanka v{chrome.runtime.getManifest().version}
      </footer>
    </main>
  );
}
