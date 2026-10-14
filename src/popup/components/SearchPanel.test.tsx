import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DetectedMedia } from '../../discovery/mediaDetection';
import type { TitleSuggestion } from '../../metadata/tmdb';
import type { MediaKind } from '../../providers/types';
import { ProviderError, type SearchPage, type SubtitleQuery, type SubtitleResult } from '../../providers/types';
import type { PlayerState } from '../../shared/messages';
import { SearchPanel } from './SearchPanel';

const mocks = vi.hoisted(() => ({
  search: vi.fn<(query: SubtitleQuery, signal: AbortSignal) => Promise<SearchPage>>(),
  detectPageMedia: vi.fn<(tabId: number) => Promise<DetectedMedia | null>>(),
  requestDownload: vi.fn(),
  searchTitles: vi.fn<(kind: MediaKind, text: string, signal: AbortSignal) => Promise<TitleSuggestion[]>>(),
}));
vi.mock('../../metadata/tmdb', () => ({ searchTitles: mocks.searchTitles, posterUrl: (path: string) => `https://image.tmdb.org/t/p/w92${path}` }));
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
    root.render(<SearchPanel tabId={7} currentTrack={null} account={{ hasApiKey: true, username: null }} tmdbReady={true} {...props} {...overrides} />);
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

const INTERSTELLAR: TitleSuggestion = { kind: 'movie', tmdbId: 157336, title: 'Interstellar', year: 2014, posterPath: '/poster.jpg' };
const INTERSTELLAR_DOC: TitleSuggestion = { kind: 'movie', tmdbId: 301959, title: 'Interstellar: Nolan’s Odyssey', year: null, posterPath: null };
const STRANGER_THINGS: TitleSuggestion = { kind: 'episode', tmdbId: 66732, title: 'Stranger Things', year: 2016, posterPath: '/st.jpg' };
const STRANGERS: TitleSuggestion = { kind: 'episode', tmdbId: 1000, title: 'Strangers', year: 2018, posterPath: null };

describe('SearchPanel title suggestions', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const settle = () => act(async () => void vi.advanceTimersByTime(300));
  const options = () => [...container.querySelectorAll<HTMLElement>('[role="option"]')];
  const combobox = () => input('search-title');
  async function key(name: string) {
    await act(async () => void combobox().dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true })));
  }
  async function chooseEpisodeMode() {
    await click(container.querySelector('input[value="episode"]')?.closest('label') ?? undefined);
  }

  it('debounces lookups and waits for at least two characters', async () => {
    mocks.searchTitles.mockResolvedValue([INTERSTELLAR]);
    await render();
    await type('search-title', 'i');
    await settle();
    expect(mocks.searchTitles).not.toHaveBeenCalled();

    await type('search-title', 'in');
    await type('search-title', 'int');
    await act(async () => void vi.advanceTimersByTime(299));
    expect(mocks.searchTitles).not.toHaveBeenCalled();
    await act(async () => void vi.advanceTimersByTime(1));
    expect(mocks.searchTitles).toHaveBeenCalledTimes(1);
    expect(mocks.searchTitles).toHaveBeenCalledWith('movie', 'int', expect.any(AbortSignal));
  });

  it('shows movie suggestions and selects one with the mouse, without searching subtitles', async () => {
    mocks.searchTitles.mockResolvedValue([INTERSTELLAR, INTERSTELLAR_DOC]);
    mocks.search.mockResolvedValue(page([]));
    await render();
    await type('search-title', 'interst');
    expect(combobox().getAttribute('autocomplete')).toBe('off');
    expect(text()).toContain('Searching TMDB…');
    await settle();

    expect(combobox().getAttribute('aria-expanded')).toBe('true');
    expect(options().map((option) => option.textContent)).toEqual(['Interstellar2014 · Movie', 'Interstellar: Nolan’s OdysseyYear unknown · Movie']);
    expect(options()[0]?.querySelector('img')?.getAttribute('src')).toBe('https://image.tmdb.org/t/p/w92/poster.jpg');
    expect(options()[1]?.querySelector('[data-testid="poster-fallback"]')).not.toBeNull(); // missing poster

    await click(options()[0]);
    expect(combobox().value).toBe('Interstellar');
    expect(input('search-year').value).toBe('2014');
    expect(combobox().getAttribute('aria-expanded')).toBe('false');
    expect(text()).toContain('Selected movie from TMDB · 2014');
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.requestDownload).not.toHaveBeenCalled();

    await submit();
    expect(mocks.search).toHaveBeenCalledWith({ kind: 'movie', title: 'Interstellar', year: 2014, tmdbId: 157336, language: 'si', page: 1 }, expect.any(AbortSignal));
  });

  it('picks a TV series with the keyboard, keeps season and episode, and leaves the first-air year out of the episode search', async () => {
    mocks.searchTitles.mockResolvedValue([STRANGERS, STRANGER_THINGS]);
    mocks.search.mockResolvedValue(page([subtitle('1', 'Stranger.Things.S01E03', { kind: 'episode', seriesTitle: 'Stranger Things', season: 1, episode: 3 })]));
    await render();
    await chooseEpisodeMode();
    await type('search-season', '1');
    await type('search-episode', '3');
    await type('search-title', 'strang');
    await settle();
    expect(mocks.searchTitles).toHaveBeenCalledWith('episode', 'strang', expect.any(AbortSignal));
    expect(options()[1]?.textContent).toBe('Stranger Things2016 · TV series');

    await key('ArrowDown');
    await key('ArrowDown');
    expect(combobox().getAttribute('aria-activedescendant')).toBe(options()[1]?.id);
    expect(options()[1]?.getAttribute('aria-selected')).toBe('true');
    await key('Enter');

    expect(combobox().value).toBe('Stranger Things');
    expect(input('search-year').value).toBe('2016');
    expect(input('search-season').value).toBe('1');
    expect(input('search-episode').value).toBe('3');
    expect(mocks.search).not.toHaveBeenCalled(); // Enter picked the suggestion, it did not submit

    await submit();
    expect(mocks.search).toHaveBeenCalledTimes(1);
    expect(mocks.search.mock.calls[0]?.[0]).toEqual({ kind: 'episode', title: 'Stranger Things', tmdbId: 66732, season: 1, episode: 3, language: 'si', page: 1 });
  });

  it('closes on Escape and wraps around with Arrow Up', async () => {
    mocks.searchTitles.mockResolvedValue([INTERSTELLAR, INTERSTELLAR_DOC]);
    await render();
    await type('search-title', 'inter');
    await settle();
    await key('ArrowUp');
    expect(options()[1]?.getAttribute('aria-selected')).toBe('true');
    await key('Escape');
    expect(combobox().getAttribute('aria-expanded')).toBe('false');
    expect(combobox().value).toBe('inter');
  });

  it('says when TMDB has no match, and still searches the typed title', async () => {
    mocks.searchTitles.mockResolvedValue([]);
    mocks.search.mockResolvedValue(page([]));
    await render();
    await type('search-title', 'zzqx');
    await settle();
    expect(text()).toContain('No matching titles on TMDB. You can still search with the title as typed.');
    await submit();
    expect(mocks.search.mock.calls[0]?.[0]).toEqual({ kind: 'movie', title: 'zzqx', language: 'si', page: 1 });
  });

  it('shows TMDB failures such as rate limiting without blocking a manual search', async () => {
    mocks.searchTitles.mockRejectedValue(new ProviderError('rate-limit', 'TMDB is receiving too many requests.'));
    mocks.search.mockResolvedValue(page([]));
    await render();
    await type('search-title', 'Interstellar');
    await settle();
    expect(text()).toContain('TMDB is receiving too many requests. You can still search with the title as typed.');
    await submit();
    expect(mocks.search).toHaveBeenCalledTimes(1);
  });

  it('cancels an outdated lookup and never shows its late answer', async () => {
    const pending: { signal: AbortSignal; resolve: (value: TitleSuggestion[]) => void }[] = [];
    mocks.searchTitles.mockImplementation((_kind, _text, signal) => new Promise((resolve) => pending.push({ signal, resolve })));
    await render();
    await type('search-title', 'inte');
    await settle();
    await type('search-title', 'inter');
    expect(pending[0]?.signal.aborted).toBe(true);
    await settle();

    await act(async () => pending[1]?.resolve([INTERSTELLAR]));
    await act(async () => pending[0]?.resolve([INTERSTELLAR_DOC]));
    expect(options().map((option) => option.textContent)).toEqual(['Interstellar2014 · Movie']);
  });

  it('forgets the TMDB id as soon as the title is edited', async () => {
    mocks.searchTitles.mockResolvedValue([INTERSTELLAR]);
    mocks.search.mockResolvedValue(page([]));
    await render();
    await type('search-title', 'inter');
    await settle();
    await click(options()[0]);
    await type('search-title', 'Interstellar 2');
    expect(text()).not.toContain('Selected movie from TMDB');
    await submit();
    expect(mocks.search.mock.calls[0]?.[0]).not.toHaveProperty('tmdbId');
    expect(session.searchState).toMatchObject({ form: { title: 'Interstellar 2', selected: null } });
  });

  it('clears the title, year and selection with the clear button', async () => {
    mocks.searchTitles.mockResolvedValue([INTERSTELLAR]);
    await render();
    await type('search-title', 'inter');
    await settle();
    await click(options()[0]);
    await click(container.querySelector('[aria-label="Clear title"]') ?? undefined);
    expect(combobox().value).toBe('');
    expect(input('search-year').value).toBe('');
    expect(text()).not.toContain('Selected movie from TMDB');
  });

  it('drops a movie selection when switching to TV episode', async () => {
    mocks.searchTitles.mockResolvedValue([INTERSTELLAR]);
    mocks.search.mockResolvedValue(page([]));
    await render();
    await type('search-title', 'inter');
    await settle();
    await click(options()[0]);
    await chooseEpisodeMode();
    expect(combobox().getAttribute('aria-expanded')).toBe('false');
    expect(text()).not.toContain('Selected movie from TMDB');
    await submit();
    expect(mocks.search.mock.calls[0]?.[0]).toEqual({ kind: 'episode', title: 'Interstellar', year: 2014, language: 'si', page: 1 });
  });

  it('falls back to a title search when OpenSubtitles knows nothing under the TMDB id', async () => {
    mocks.searchTitles.mockResolvedValue([STRANGER_THINGS]);
    mocks.search.mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([subtitle('1', 'Stranger.Things.S02E01')], { totalPages: 2 }));
    await render();
    await chooseEpisodeMode();
    await type('search-title', 'strang');
    await settle();
    await click(options()[0]);
    await type('search-season', '2');
    await type('search-episode', '1');
    await submit();
    expect(mocks.search.mock.calls.map(([query]) => query)).toEqual([
      { kind: 'episode', title: 'Stranger Things', tmdbId: 66732, season: 2, episode: 1, language: 'si', page: 1 },
      { kind: 'episode', title: 'Stranger Things', tmdbId: undefined, season: 2, episode: 1, language: 'si', page: 1 },
    ]);
    expect(text()).toContain('Stranger.Things.S02E01');
  });

  it('works without a TMDB key: no lookups, a hint to set one up, and manual search', async () => {
    mocks.search.mockResolvedValue(page([]));
    await render({ tmdbReady: false });
    expect(text()).toContain('Title suggestions are off.');
    await type('search-title', 'Interstellar');
    await settle();
    expect(mocks.searchTitles).not.toHaveBeenCalled();
    expect(combobox().getAttribute('aria-expanded')).toBe('false');
    await click(button('Add a TMDB key'));
    expect(props.onOpenSettings).toHaveBeenCalled();
    await submit();
    expect(mocks.search).toHaveBeenCalledTimes(1);
  });

  it('drops a saved selection that no longer matches the saved title', async () => {
    session.searchState = { form: { kind: 'movie', title: 'Edited', year: '2014', season: '', episode: '', selected: INTERSTELLAR }, results: null };
    mocks.search.mockResolvedValue(page([]));
    await render();
    expect(text()).not.toContain('Selected movie from TMDB');
    await submit();
    expect(mocks.search.mock.calls[0]?.[0]).not.toHaveProperty('tmdbId');
  });
});
