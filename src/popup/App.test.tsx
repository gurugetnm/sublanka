import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerState } from '../shared/messages';
import { DEFAULT_SETTINGS } from '../shared/settings';
import { App } from './App';

const mocks = vi.hoisted(() => ({
  connectToActiveTab: vi.fn(),
  sendToTab: vi.fn(),
}));
vi.mock('./tabBridge', () => ({
  connectToActiveTab: mocks.connectToActiveTab,
  sendToTab: mocks.sendToTab,
  detectPageMedia: vi.fn(async () => null),
  requestDownload: vi.fn(),
  requestTranslation: vi.fn(async () => ({ ok: true, job: null })),
}));
vi.mock('../providers/opensubtitles', async (original) => ({
  ...(await original<typeof import('../providers/opensubtitles')>()),
  loadAccountStatus: vi.fn(async () => ({ hasApiKey: true, username: null })),
  saveApiKey: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('../translation/googleTranslate', async (original) => ({
  ...(await original<typeof import('../translation/googleTranslate')>()),
  loadTranslationKeyStatus: vi.fn(async () => false),
  saveTranslationApiKey: vi.fn(),
}));
vi.mock('../shared/settings', async (original) => ({
  ...(await original<typeof import('../shared/settings')>()),
  loadSettings: vi.fn(async () => DEFAULT_SETTINGS),
  saveSettings: vi.fn(async () => undefined),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STATE: PlayerState = {
  track: { fileName: 'film.si.srt', cueCount: 120, source: 'local' },
  subtitlesEnabled: true,
  demoVisible: false,
  videos: [{ id: 1, width: 1280, height: 720, playing: true }],
  attachedVideoId: 1,
  hasFrames: false,
};

let container: HTMLDivElement;
let root: Root;
const reload = vi.fn(async () => undefined);

beforeEach(() => {
  localStorage.clear();
  const area = () => ({ get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) });
  vi.stubGlobal('chrome', {
    runtime: { getManifest: () => ({ version: '1.0.0' }) },
    storage: { local: area(), session: area(), onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
    tabs: { reload },
  });
  vi.stubGlobal('close', vi.fn());
  mocks.connectToActiveTab.mockResolvedValue({ kind: 'ready', tabId: 7, state: STATE });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const render = () => act(async () => root.render(<App />));
const tab = (name: string) => [...container.querySelectorAll<HTMLButtonElement>('[role=tab]')].find((element) => element.textContent === name);
const visiblePanel = () => [...container.querySelectorAll<HTMLElement>('[role=tabpanel]')].find((panel) => !panel.hidden);
const button = (name: string) => [...container.querySelectorAll('button')].find((element) => element.textContent?.trim() === name);

describe('App', () => {
  it('shows the version in the fixed header and opens on the Subtitles tab', async () => {
    await render();
    expect(container.querySelector('header')?.textContent).toContain('v1.0.0');
    expect(tab('Subtitles')?.getAttribute('aria-selected')).toBe('true');
    expect(visiblePanel()?.id).toBe('panel-subtitles');
    expect(visiblePanel()?.textContent).toContain('film.si.srt');
  });

  it('switches tabs, remembers the last one and starts each tab at the top', async () => {
    await render();
    const scroller = visiblePanel()?.parentElement as HTMLElement;
    scroller.scrollTo = vi.fn();
    await act(async () => tab('Settings')?.click());
    expect(visiblePanel()?.id).toBe('panel-settings');
    expect(visiblePanel()?.getAttribute('aria-labelledby')).toBe('tab-settings');
    expect(localStorage.getItem('sublanka.section')).toBe('settings');
    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 0 });

    act(() => root.unmount());
    root = createRoot(container);
    await render();
    expect(visiblePanel()?.id).toBe('panel-settings');
  });

  it('groups settings in a stable order, with privacy information before developer tools', async () => {
    localStorage.setItem('sublanka.section', 'settings');
    await render();
    const headings = [...(visiblePanel()?.querySelectorAll('h2, summary') ?? [])].map((element) => element.textContent?.replace('▾', '').trim());
    expect(headings).toEqual(['Subtitle appearance', 'Position and watermarks', 'Subtitle provider', 'Translation', 'Privacy', 'Developer tools']);
    expect(visiblePanel()?.textContent).toContain('Read and parsed on this device. Never uploaded.');
    expect(visiblePanel()?.querySelector('input[type=password]')).not.toBeNull();
  });

  it('explains a page that stopped responding and offers a reload or dismissal', async () => {
    await render();
    mocks.sendToTab.mockRejectedValueOnce(new Error('gone'));
    await act(async () => container.querySelector<HTMLButtonElement>('[role=switch]')?.click());
    expect(container.querySelector('[role=alert]')?.textContent).toBe('Could not reach the page. Reload it and try again.');

    await act(async () => button('Reload page')?.click());
    expect(reload).toHaveBeenCalledWith(7);
    await act(async () => button('Dismiss')?.click());
    expect(container.querySelector('[role=alert]')).toBeNull();
  });

  it('explains an unsupported page and keeps the upload disabled', async () => {
    mocks.connectToActiveTab.mockResolvedValue({ kind: 'unsupported' });
    await render();
    expect(visiblePanel()?.textContent).toContain('Unsupported page');
    expect(visiblePanel()?.textContent).toContain('Open a page with a video to load subtitles.');
    expect(button('Choose or drop a .srt or .vtt fileUTF-8 text, up to 5 MB')?.hasAttribute('disabled')).toBe(true);
  });
});
