import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../providers/types';
import { clearSuggestionCache, mapSuggestions, MAX_SUGGESTIONS, searchTitles } from './tmdb';

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const signal = () => new AbortController().signal;
let local: Record<string, unknown>;

const MOVIE = { id: 157336, title: 'Interstellar', release_date: '2014-11-05', poster_path: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', adult: false };
const SERIES = { id: 66732, name: 'Stranger Things', first_air_date: '2016-07-15', poster_path: null, adult: false };

beforeEach(() => {
  local = { tmdbApiKey: 'eyJhbGciOiJIUzI1NiJ9.token' };
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('chrome', { storage: { local: { get: vi.fn(async (key: string) => (key in local ? { [key]: local[key] } : {})) } } });
  clearSuggestionCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('searchTitles', () => {
  it('searches movies with the access token, sending only the typed title', async () => {
    fetchMock.mockResolvedValue(json({ page: 1, results: [MOVIE] }));
    await expect(searchTitles('movie', '  interstellar ', signal())).resolves.toEqual([
      { kind: 'movie', tmdbId: 157336, title: 'Interstellar', year: 2014, posterPath: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg' },
    ]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://api.themoviedb.org/3/search/movie?query=interstellar&include_adult=false&page=1');
    expect(init?.headers).toEqual({ Accept: 'application/json', Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.token' });
    expect(init?.credentials).toBe('omit');
  });

  it('searches TV series with a v3 API key as a parameter and reads name and first-air date', async () => {
    local.tmdbApiKey = '0123456789abcdef0123456789abcdef';
    fetchMock.mockResolvedValue(json({ results: [SERIES] }));
    await expect(searchTitles('episode', 'strang', signal())).resolves.toEqual([
      { kind: 'episode', tmdbId: 66732, title: 'Stranger Things', year: 2016, posterPath: null },
    ]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain('/3/search/tv?query=strang&include_adult=false&page=1&api_key=0123456789abcdef0123456789abcdef');
    expect(init?.headers).toEqual({ Accept: 'application/json' });
  });

  it('caches recent answers per type and query', async () => {
    fetchMock.mockImplementation(async () => json({ results: [MOVIE] }));
    await searchTitles('movie', 'Inter', signal());
    await searchTitles('movie', 'inter ', signal());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await searchTitles('episode', 'inter', signal());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('needs a key and sends nothing without one', async () => {
    local = {};
    await expect(searchTitles('movie', 'Interstellar', signal())).rejects.toMatchObject({ code: 'setup-required' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'invalid-key'],
    [429, 'rate-limit'],
    [503, 'unavailable'],
  ])('maps HTTP %i to %s', async (status, code) => {
    fetchMock.mockResolvedValue(json({ status_code: 7 }, status));
    await expect(searchTitles('movie', 'Interstellar', signal())).rejects.toMatchObject({ code });
  });

  it('reports offline and network failures, and does not cache them', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('navigator', { onLine: false });
    await expect(searchTitles('movie', 'Interstellar', signal())).rejects.toThrow('You are offline');
    vi.stubGlobal('navigator', { onLine: true });
    await expect(searchTitles('movie', 'Interstellar', signal())).rejects.toMatchObject({ code: 'network' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a cancelled request as aborted', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError')))));
    const pending = searchTitles('movie', 'Interstellar', controller.signal);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'aborted' });
  });

  it('rejects an unreadable response', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }));
    await expect(searchTitles('movie', 'Interstellar', signal())).rejects.toBeInstanceOf(ProviderError);
  });
});

describe('mapSuggestions', () => {
  it('drops malformed, adult and duplicate items, keeps missing dates and posters as null, and limits the list', () => {
    const results = [
      MOVIE,
      MOVIE,
      { ...MOVIE, id: 2, adult: true },
      { id: 3 },
      { id: -1, title: 'Bad id' },
      null,
      { id: 4, title: 'No date', release_date: '', poster_path: 'https://evil.example/x.jpg' },
      ...Array.from({ length: 20 }, (_, index) => ({ id: 100 + index, title: `Film ${index}` })),
    ];
    const suggestions = mapSuggestions({ results }, 'movie');
    expect(suggestions).toHaveLength(MAX_SUGGESTIONS);
    expect(suggestions.map((s) => s.tmdbId).slice(0, 3)).toEqual([157336, 4, 100]);
    expect(suggestions[1]).toEqual({ kind: 'movie', tmdbId: 4, title: 'No date', year: null, posterPath: null });
  });

  it('rejects a body without a results list', () => {
    expect(() => mapSuggestions({ status_code: 34 }, 'movie')).toThrow(ProviderError);
  });
});
