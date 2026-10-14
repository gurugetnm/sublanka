import { useEffect, useRef, useState } from 'react';
import type { SubLankaMessage } from '../shared/messages';
import { DEFAULT_SETTINGS, loadSettings, normalizeOffset, saveSettings, type SubtitleSettings } from '../shared/settings';
import { readSubtitleFile } from '../subtitles/subtitleFile';
import { SubtitleParseError } from '../subtitles/types';
import { AppearanceSettings } from './components/AppearanceSettings';
import { DeveloperTools } from './components/DeveloperTools';
import { Header } from './components/Header';
import { PlayerStatusCard } from './components/PlayerStatusCard';
import { PositionCard } from './components/PositionCard';
import { SubtitleTrackCard } from './components/SubtitleTrackCard';
import { TimingCard } from './components/TimingCard';
import { UpcomingFeatures } from './components/UpcomingFeatures';
import { connectToActiveTab, sendToTab, type TabConnection } from './tabBridge';

const PAGE_ERROR = 'Could not reach the page. Reload it and try again.';

export function App() {
  const [connection, setConnection] = useState<TabConnection | null>(null);
  // null until storage answers, so temporary defaults are never shown or saved over real settings.
  const [settings, setSettings] = useState<SubtitleSettings | null>(null);
  const settingsRef = useRef<SubtitleSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    connectToActiveTab().then(setConnection, () => setConnection({ kind: 'unavailable' }));
    loadSettings()
      .catch(() => {
        setError('Saved settings could not be read, so defaults are in use.');
        return DEFAULT_SETTINGS;
      })
      .then((loaded) => {
        settingsRef.current = loaded;
        setSettings(loaded);
      });
  }, []);

  const ready = connection?.kind === 'ready' ? connection : null;
  const tabId = ready?.tabId ?? null;

  // Keep player status (playing, new or removed videos) live while the popup is open.
  useEffect(() => {
    if (tabId === null) return;
    const timer = setInterval(() => {
      sendToTab(tabId, { type: 'sublanka:get-state' }).then(
        (state) => setConnection({ kind: 'ready', tabId, state }),
        () => setConnection({ kind: 'unavailable' }),
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [tabId]);

  async function run(message: SubLankaMessage) {
    if (tabId === null) return;
    setBusy(true);
    setError(null);
    try {
      setConnection({ kind: 'ready', tabId, state: await sendToTab(tabId, message) });
    } catch {
      setError(PAGE_ERROR);
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file: File) {
    if (tabId === null) return;
    setBusy(true);
    setError(null);
    setWarnings([]);
    try {
      const parsed = await readSubtitleFile(file);
      const state = await sendToTab(tabId, { type: 'sublanka:load-track', fileName: file.name, cues: parsed.cues, source: 'local' });
      setConnection({ kind: 'ready', tabId, state });
      setWarnings(parsed.warnings);
    } catch (caught) {
      setError(caught instanceof SubtitleParseError ? caught.message : PAGE_ERROR);
    } finally {
      setBusy(false);
    }
  }

  /** Saves settings; the content script applies them from chrome.storage. Builds on the latest value, not a stale render. */
  function updateSettings(patch: (current: SubtitleSettings) => Partial<SubtitleSettings>) {
    const current = settingsRef.current;
    if (!current) return;
    const next = { ...current, ...patch(current) };
    settingsRef.current = next;
    setSettings(next);
    saveSettings(next).catch(() => setError('Could not save settings.'));
  }

  const state = ready?.state ?? null;

  return (
    <main className="flex flex-col gap-3 p-4">
      <Header />
      <PlayerStatusCard
        connection={connection}
        disabled={busy}
        onSelectVideo={(videoId) => run({ type: 'sublanka:select-video', videoId })}
      />

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <SubtitleTrackCard
        state={state}
        disabled={!ready || busy}
        busy={busy}
        warnings={warnings}
        onFile={importFile}
        onRemove={() => {
          setWarnings([]);
          void run({ type: 'sublanka:remove-track' });
        }}
        onSetEnabled={(enabled) => run({ type: 'sublanka:set-enabled', enabled })}
      />
      <TimingCard
        offset={settings?.offset ?? null}
        onAdjust={(delta) => updateSettings((current) => ({ offset: normalizeOffset(current.offset + delta) }))}
        onReset={() => updateSettings(() => ({ offset: 0 }))}
      />
      <PositionCard settings={settings} onChange={(patch) => updateSettings(() => patch)} />
      <AppearanceSettings settings={settings} onChange={(patch) => updateSettings(() => patch)} />
      <DeveloperTools
        demoVisible={state?.demoVisible ?? false}
        disabled={!ready || busy}
        onToggleDemo={() => run({ type: 'sublanka:set-demo', visible: !state?.demoVisible })}
      />
      <UpcomingFeatures />

      <footer className="border-t border-stone-200 pt-3 text-[11px] text-stone-400 dark:border-stone-800 dark:text-stone-500">
        SubLanka v{chrome.runtime.getManifest().version}
      </footer>
    </main>
  );
}
