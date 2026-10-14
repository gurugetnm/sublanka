import { Captions, Languages, Search, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { loadAccountStatus, type AccountStatus } from '../providers/opensubtitles';
import type { PlayerState, SubLankaMessage } from '../shared/messages';
import { DEFAULT_SETTINGS, loadSettings, normalizeOffset, saveSettings, type SubtitleSettings } from '../shared/settings';
import { readSubtitleFile } from '../subtitles/subtitleFile';
import { SubtitleParseError } from '../subtitles/types';
import { AppearanceSettings } from './components/AppearanceSettings';
import { DeveloperTools } from './components/DeveloperTools';
import { Header } from './components/Header';
import { PlayerStatusCard } from './components/PlayerStatusCard';
import { PositionCard } from './components/PositionCard';
import { PrivacyInfo } from './components/PrivacyInfo';
import { ProviderSettings } from './components/ProviderSettings';
import { SearchPanel } from './components/SearchPanel';
import { SubtitleTrackCard } from './components/SubtitleTrackCard';
import { Tabs, type TabItem } from './components/Tabs';
import { TimingCard } from './components/TimingCard';
import { TranslatePanel } from './components/TranslatePanel';
import { TranslationSettings } from './components/TranslationSettings';
import { ErrorBox, SECONDARY_BUTTON } from './components/ui';
import { loadTranslationKeyStatus } from '../translation/googleTranslate';
import { connectToActiveTab, sendToTab, type TabConnection } from './tabBridge';

const PAGE_ERROR = 'Could not reach the page. Reload it and try again.';

type Section = 'subtitles' | 'search' | 'translate' | 'settings';
const SECTIONS: TabItem<Section>[] = [
  { id: 'subtitles', label: 'Subtitles', icon: Captions },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'translate', label: 'Translate', icon: Languages },
  { id: 'settings', label: 'Settings', icon: Settings },
];
const SECTION_KEY = 'sublanka.section';

/** The last open tab is a per-device convenience; localStorage can be unavailable, so failures are ignored. */
function initialSection(): Section {
  try {
    return SECTIONS.find(({ id }) => id === localStorage.getItem(SECTION_KEY))?.id ?? 'subtitles';
  } catch {
    return 'subtitles';
  }
}

export function App() {
  const [connection, setConnection] = useState<TabConnection | null>(null);
  // null until storage answers, so temporary defaults are never shown or saved over real settings.
  const [settings, setSettings] = useState<SubtitleSettings | null>(null);
  const settingsRef = useRef<SubtitleSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [section, setSection] = useState<Section>(initialSection);
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [translationReady, setTranslationReady] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  function openSection(next: Section) {
    setSection(next);
    // All panels share one scroll area; a new tab starts at its top, not where the last one was left.
    scrollRef.current?.scrollTo({ top: 0 });
    try {
      localStorage.setItem(SECTION_KEY, next);
    } catch {
      // Not remembered; nothing else depends on it.
    }
  }

  useEffect(() => {
    loadAccountStatus().then(setAccount, () => setAccount({ hasApiKey: false, username: null }));
    loadTranslationKeyStatus().then(setTranslationReady, () => setTranslationReady(false));
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
  const panel = (id: Section) => ({ id: `panel-${id}`, role: 'tabpanel', 'aria-labelledby': `tab-${id}`, hidden: section !== id });

  function onTrackLoaded(next: PlayerState, trackWarnings: string[]) {
    if (tabId !== null) setConnection({ kind: 'ready', tabId, state: next });
    setWarnings(trackWarnings);
  }

  return (
    <main className="flex h-full flex-col">
      <div className="flex flex-col gap-3 border-b border-stone-200 px-4 pt-3 pb-3 dark:border-stone-800">
        <Header version={chrome.runtime.getManifest().version} />
        <Tabs tabs={SECTIONS} value={section} onChange={openSection} />
      </div>

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {error && (
          <ErrorBox
            actions={
              <>
                {error === PAGE_ERROR && tabId !== null && (
                  <button type="button" className={SECONDARY_BUTTON} onClick={() => void chrome.tabs.reload(tabId).then(() => window.close())}>
                    Reload page
                  </button>
                )}
                <button type="button" className={SECONDARY_BUTTON} onClick={() => setError(null)}>
                  Dismiss
                </button>
              </>
            }
          >
            {error}
          </ErrorBox>
        )}

        {/* Panels stay mounted while hidden, so a running search or typed form survives switching tabs. */}
        <div {...panel('subtitles')} className="flex flex-col gap-3">
          <PlayerStatusCard
            connection={connection}
            disabled={busy}
            onSelectVideo={(videoId) => run({ type: 'sublanka:select-video', videoId })}
          />
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
            onSearch={() => openSection('search')}
          />
          <TimingCard
            offset={settings?.offset ?? null}
            onAdjust={(delta) => updateSettings((current) => ({ offset: normalizeOffset(current.offset + delta) }))}
            onReset={() => updateSettings(() => ({ offset: 0 }))}
          />
        </div>

        <div {...panel('search')}>
          <SearchPanel
            tabId={tabId}
            currentTrack={state?.track ?? null}
            account={account}
            onOpenSettings={() => openSection('settings')}
            onOpenSubtitles={() => openSection('subtitles')}
            onTrackLoaded={onTrackLoaded}
          />
        </div>

        <div {...panel('translate')}>
          <TranslatePanel
            tabId={tabId}
            currentTrack={state?.track ?? null}
            configured={translationReady}
            onOpenSettings={() => openSection('settings')}
            onTrackLoaded={onTrackLoaded}
          />
        </div>

        <div {...panel('settings')} className="flex flex-col gap-3">
          <AppearanceSettings settings={settings} onChange={(patch) => updateSettings(() => patch)} />
          <PositionCard settings={settings} onChange={(patch) => updateSettings(() => patch)} />
          <ProviderSettings account={account} onChange={setAccount} />
          <TranslationSettings configured={translationReady} onChange={setTranslationReady} />
          <PrivacyInfo />
          <DeveloperTools
            demoVisible={state?.demoVisible ?? false}
            disabled={!ready || busy}
            onToggleDemo={() => run({ type: 'sublanka:set-demo', visible: !state?.demoVisible })}
          />
        </div>
      </div>
    </main>
  );
}
