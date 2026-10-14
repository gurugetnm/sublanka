import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DetectedMedia } from '../../discovery/mediaDetection';
import { ProviderError, type SearchPage, type SubtitleQuery, type SubtitleResult } from '../../providers/types';
import type { PlayerState } from '../../shared/messages';
import { SearchPanel } from './SearchPanel';

const mocks = vi.hoisted(() => ({
  search: vi.fn<(query: SubtitleQuery, signal: AbortSignal) => Promise<SearchPage>>(),
  detectPageMedia: vi.fn<(tabId: number) => Promise<DetectedMedia | null>>(),
  requestDownload: vi.fn(),
}));
vi.mock('../../providers', () => ({
  SINHALA_LANGUAGE: 'si',
  PROVIDERS: { opensubtitles: { id: 'opensubtitles', name: 'OpenSubtitles', search: mocks.search, download: vi.fn() } },
}));
vi.mock('../tabBridge', () => ({ detectPageMedia: mocks.detectPageMedia, requestDownload: mocks.requestDownload }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STATE: PlayerState = {
  track: { fileName: 'Interstellar.srt', cueCount: 10, source: 'opensubtitles' },
  subtitlesEnabled: true,
  demoVisible: false,
  videos: [],
  attachedVideoId: null,
  hasFrames: false,
};

function subtitle(id: string, release: string, feature: Partial<SubtitleResult['feature']> = {}): SubtitleResult {
  return {
    provider: 'opensubtitles',
    id,
    downloadId: `file-${id}`,
    release,
    fileName: `${release}.srt`,
    fileCount: 1,
    language: 'si',
    feature: { kind: 'movie', title: 'Interstellar', seriesTitle: null, year: 2014, season: null, episode: null, ...feature },
    uploadDate: '2021-03-14T10:00:00Z',
    downloadCount: 42,
    hearingImpaired: false,
    aiTranslated: false,
    machineTranslated: false,
    fromTrusted: false,
    pageUrl: null,
  };
}
const page = (results: SubtitleResult[], extra: Partial<SearchPage> = {}): SearchPage => ({ results, page: 1, totalPages: 1, totalCount: results.length, ...extra });

let session: Record<string, unknown>;
const storageListeners: ((changes: Record<string, { newValue?: unknown }>, area: string) => void)[] = [];
let container: HTMLDivElement;
let root: Root;
const props = { onOpenSettings: vi.fn(), onTrackLoaded: vi.fn() };

beforeEach(() => {
  session = {};
  storageListeners.length = 0;
  vi.stubGlobal('chrome', {
    storage: {
      session: {
        get: vi.fn(async (key: string) => (key in session ? { [key]: session[key] } : {})),
        set: vi.fn(async (items: Record<string, unknown>) => void Object.assign(session, items)),
      },
      onChanged: { addListener: (listener: (typeof storageListeners)[number]) => storageListeners.push(listener), removeListener: vi.fn() },
    },
  });
  mocks.detectPageMedia.mockResolvedValue(null);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

async function render(overrides: Partial<Parameters<typeof SearchPanel>[0]> = {}) {
  await act(async () => {
    root.render(<SearchPanel tabId={7} currentTrack={null} account={{ hasApiKey: true, username: null }} {...props} {...overrides} />);
  });
}

function input(id: string): HTMLInputElement {
  const element = container.querySelector<HTMLInputElement>(`#${id}`);
  if (!element) throw new Error(`No #${id} input`);
  return element;
}
const button = (text: string) => [...container.querySelectorAll('button')].find((element) => element.textContent?.includes(text));
const text = () => container.textContent ?? '';

async function type(id: string, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input(id), value);
    input(id).dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function click(element: Element | undefined) {
  expect(element).toBeDefined();
  await act(async () => (element as HTMLElement).click());
}
async function submit() {
  await act(async () => container.querySelector('form')?.requestSubmit());
}

describe('SearchPanel', () => {
  it('searches manually when nothing is detected on the page', async () => {
    mocks.search.mockResolvedValue(page([subtitle('1', 'Interstellar.2014.BluRay')]));
    await render();
    expect(text()).toContain('No movie or episode details found on this page');

    await type('search-title', 'Interstellar');
    await type('search-year', '2014');
    await submit();

    expect(mocks.search).toHaveBeenCalledWith({ kind: 'movie', title: 'Interstellar', year: 2014, language: 'si', page: 1 }, expect.any(AbortSignal));
    expect(text()).toContain('1 Sinhala subtitle for “Interstellar (2014)”');
    expect(text()).toContain('Interstellar.2014.BluRay');
    expect(text()).toContain('Strong match');
  });

  it('pre-fills a detected episode, labelled as a guess, and searches with the user’s correction', async () => {
    mocks.detectPageMedia.mockResolvedValue({ kind: 'episode', title: 'Stranger Thing', season: 1, episode: 3, source: 'page-title' });
    mocks.search.mockResolvedValue(page([]));
    await render();

    expect(text()).toContain('Possible match from the tab title: Stranger Thing · S01E03');
    expect(input('search-title').value).toBe('Stranger Thing');
    expect(input('search-season').value).toBe('1');

    await type('search-title', 'Stranger Things');
    expect(button('Use')).toBeDefined(); // the guess can be restored
    await submit();
    expect(mocks.search.mock.calls[0]?.[0]).toEqual({ kind: 'episode', title: 'Stranger Things', season: 1, episode: 3, language: 'si', page: 1 });
  });

  it('shows the empty state when no Sinhala subtitles exist', async () => {
    mocks.search.mockResolvedValue(page([]));
    await render();
    await type('search-title', 'Unknown film');
    await submit();
    expect(text()).toContain('No Sinhala subtitles found. Try another title or release.');
  });

  it('shows a loading state and lets the user cancel the search', async () => {
    let signal: AbortSignal | undefined;
    mocks.search.mockImplementation((_query, s) => {
      signal = s;
      return new Promise(() => undefined);
    });
    await render();
    await type('search-title', 'Interstellar');
    await submit();

    expect(text()).toContain('Searching OpenSubtitles…');
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    await click(button('Cancel search'));
    expect(signal?.aborted).toBe(true);
    expect(text()).not.toContain('Searching OpenSubtitles…');
    expect(button('Search')).toBeDefined();
  });

  it('shows provider errors and links to settings for setup problems', async () => {
    mocks.search.mockRejectedValueOnce(new ProviderError('rate-limit', 'Too many requests to OpenSubtitles. Wait a few seconds and try again.'));
    await render();
    await type('search-title', 'Interstellar');
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Too many requests to OpenSubtitles. Wait a few seconds and try again.');

    mocks.search.mockRejectedValueOnce(new ProviderError('invalid-key', 'OpenSubtitles rejected the API key.'));
    await submit();
    await click(button('Open settings'));
    expect(props.onOpenSettings).toHaveBeenCalled();
  });

  it('asks for provider setup before searching without an API key', async () => {
    await render({ account: { hasApiKey: false, username: null } });
    expect(text()).toContain('Subtitle provider setup is required before searching.');
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
  });

  it('validates the form before sending anything', async () => {
    await render();
    await submit();
    expect(text()).toContain('Enter a movie or series title.');
    await click(container.querySelector('input[value="episode"]')?.closest('label') ?? undefined);
    await type('search-title', 'Lost');
    await type('search-episode', '3');
    await submit();
    expect(text()).toContain('Enter the season number for this episode.');
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it('ignores a slower, older search that finishes after a newer one', async () => {
    let finishOld: (value: SearchPage) => void = () => undefined;
    mocks.search
      .mockImplementationOnce(() => new Promise((resolve) => (finishOld = resolve)))
      .mockResolvedValueOnce(page([subtitle('2', 'New.Release')]));
    await render();
    await type('search-title', 'Interstellar');
    await submit();
    await submit();
    await act(async () => finishOld(page([subtitle('1', 'Old.Release')])));
    expect(text()).toContain('New.Release');
    expect(text()).not.toContain('Old.Release');
  });

  it('loads a chosen result through the background worker, showing progress and warning about replacement', async () => {
    mocks.search.mockResolvedValue(page([subtitle('1', 'Interstellar.2014.BluRay')]));
    let finish: (value: unknown) => void = () => undefined;
    mocks.requestDownload.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await render({ currentTrack: { fileName: 'local.srt', cueCount: 3, source: 'local' } });
    await type('search-title', 'Interstellar');
    await submit();
    expect(text()).toContain('Loading a result replaces “local.srt”.');

    await click(button('Load subtitles'));
    expect(mocks.requestDownload).toHaveBeenCalledWith({ tabId: 7, provider: 'opensubtitles', downloadId: 'file-1', label: 'Interstellar.2014.BluRay.srt' });
    expect(text()).toContain('Downloading Interstellar.2014.BluRay.srt…');
    expect(button('Loading…')?.disabled).toBe(true);

    await act(async () => finish({ ok: true, state: STATE, warnings: ['Skipped block 4'], remaining: 3 }));
    expect(props.onTrackLoaded).toHaveBeenCalledWith(STATE, ['Skipped block 4']);
  });

  it('shows download failures', async () => {
    mocks.search.mockResolvedValue(page([subtitle('1', 'Film')]));
    mocks.requestDownload.mockResolvedValue({ ok: false, message: 'Download limit reached. Please try again later.' });
    await render();
    await type('search-title', 'Interstellar');
    await submit();
    await click(button('Load subtitles'));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Download limit reached. Please try again later.');
  });

  it('restores the last search and an in-progress download when the popup reopens', async () => {
    session.searchState = {
      form: { kind: 'movie', title: 'Interstellar', year: '2014', season: '', episode: '' },
      results: { query: { kind: 'movie', title: 'Interstellar', year: 2014, language: 'si', page: 1 }, page: page([subtitle('1', 'Saved.Release')], { totalPages: 2 }) },
    };
    session.downloadStatus = { tabId: 7, downloadId: 'file-1', label: 'Saved.Release.srt', phase: 'loading', message: 'Downloading Saved.Release.srt…', remaining: null, startedAt: Date.now() };
    mocks.detectPageMedia.mockResolvedValue({ kind: 'movie', title: 'Something Else', source: 'page-title' });
    await render();

    expect(input('search-title').value).toBe('Interstellar'); // detection never overwrites the user's form
    expect(text()).toContain('Saved.Release');
    expect(text()).toContain('Downloading Saved.Release.srt…');
    expect(button('Show more results')).toBeDefined();

    await act(async () => {
      for (const listener of storageListeners) {
        listener({ downloadStatus: { newValue: { ...(session.downloadStatus as object), phase: 'loaded', message: 'Loaded Saved.Release.srt from OpenSubtitles.' } } }, 'session');
      }
    });
    expect(text()).toContain('Loaded Saved.Release.srt from OpenSubtitles.');
  });

  it('marks a download that never finished as interrupted', async () => {
    session.downloadStatus = { tabId: 7, downloadId: 'x', label: 'Film', phase: 'loading', message: 'Downloading Film…', remaining: null, startedAt: Date.now() - 10 * 60_000 };
    await render();
    expect(text()).toContain('The last download was interrupted. Try loading it again.');
  });

  it('loads the next page and appends its results', async () => {
    mocks.search
      .mockResolvedValueOnce(page([subtitle('1', 'First.Page')], { totalPages: 2, totalCount: 2 }))
      .mockResolvedValueOnce(page([subtitle('2', 'Second.Page')], { page: 2, totalPages: 2, totalCount: 2 }));
    await render();
    await type('search-title', 'Interstellar');
    await submit();
    await click(button('Show more results'));
    expect(mocks.search.mock.calls[1]?.[0].page).toBe(2);
    expect(text()).toContain('First.Page');
    expect(text()).toContain('Second.Page');
    expect(button('Show more results')).toBeUndefined();
  });
});
