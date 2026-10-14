import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../providers/types';
import { clearSuggestionCache, mapTvmaze, mapWikidata, MAX_SUGGESTIONS, searchTitles } from './titleSearch';

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const signal = () => new AbortController().signal;

// Shaped like real answers from api.tvmaze.com/search/shows and wikidata.org wbsearchentities.
const STRANGER_THINGS = {
  score: 0.69,
  show: {
    id: 2993,
    name: 'Stranger Things',
    premiered: '2016-07-15',
    image: { medium: 'https://static.tvmaze.com/uploads/images/medium_portrait/200/501942.jpg', original: 'x' },
    externals: { tvrage: 48493, thetvdb: 305288, imdb: 'tt4574334' },
  },
};
const NO_IMAGE_SHOW = { score: 0.5, show: { id: 22280, name: 'The Strain: Under Siege', premiered: null, image: null, externals: { imdb: null } } };
const INTERSTELLAR = { id: 'Q13417189', label: 'Interstellar', description: '2014 film by Christopher Nolan' };

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('chrome', { runtime: { getManifest: () => ({ version: '0.4.0' }) } });
  clearSuggestionCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('searchTitles', () => {
  it('searches TV series on TVmaze with no key, sending only the typed title', async () => {
    fetchMock.mockResolvedValue(json([STRANGER_THINGS, NO_IMAGE_SHOW]));
    await expect(searchTitles('episode', '  stranger   things ', signal())).resolves.toEqual([
      {
        kind: 'episode',
        source: 'tvmaze',
        id: '2993',
        title: 'Stranger Things',
        year: 2016,
        posterUrl: 'https://static.tvmaze.com/uploads/images/medium_portrait/200/501942.jpg',
        imdbId: 4574334,
      },
      { kind: 'episode', source: 'tvmaze', id: '22280', title: 'The Strain: Under Siege', year: null, posterUrl: null, imdbId: null },
    ]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://api.tvmaze.com/search/shows?q=stranger+things');
    expect(init?.headers).toEqual({ Accept: 'application/json' });
    expect(init?.credentials).toBe('omit');
  });

  it('searches movies on Wikidata, identifying the app as Wikimedia asks', async () => {
    fetchMock.mockResolvedValue(json({ search: [INTERSTELLAR] }));
    await expect(searchTitles('movie', 'interst', signal())).resolves.toEqual([
      { kind: 'movie', source: 'wikidata', id: 'Q13417189', title: 'Interstellar', year: 2014, posterUrl: null, imdbId: null },
    ]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const parsed = new URL(String(url));
    expect(parsed.origin + parsed.pathname).toBe('https://www.wikidata.org/w/api.php');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      action: 'wbsearchentities',
      search: 'interst',
      language: 'en',
      uselang: 'en',
      type: 'item',
      limit: '50',
      format: 'json',
      origin: '*',
    });
    expect(init?.headers).toEqual({ Accept: 'application/json', 'Api-User-Agent': 'SubLanka/0.4.0 (https://github.com/gurugetnm/sublanka)' });
  });

  it('caches recent answers per type and query', async () => {
    fetchMock.mockImplementation(async () => json([STRANGER_THINGS]));
    await searchTitles('episode', 'Stranger', signal());
    await searchTitles('episode', 'stranger ', signal());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockImplementation(async () => json({ search: [] }));
    await searchTitles('movie', 'stranger', signal());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [429, 'rate-limit', 'TVmaze is receiving too many requests'],
    [503, 'unavailable', 'TVmaze is not responding'],
  ])('maps HTTP %i to %s', async (status, code, message) => {
    fetchMock.mockResolvedValue(json({}, status));
    const error = await searchTitles('episode', 'Lost', signal()).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code });
    expect((error as Error).message).toContain(message);
  });

  it('reports offline and network failures, and does not cache them', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('navigator', { onLine: false });
    await expect(searchTitles('movie', 'Interstellar', signal())).rejects.toThrow('You are offline');
    vi.stubGlobal('navigator', { onLine: true });
    await expect(searchTitles('movie', 'Interstellar', signal())).rejects.toThrow('Could not reach Wikidata');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a cancelled request as aborted', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError')))));
    const pending = searchTitles('episode', 'Lost', controller.signal);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'aborted' });
  });

  it('rejects an unreadable response, including a Wikidata API error body', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 200 }));
    await expect(searchTitles('episode', 'Lost', signal())).rejects.toBeInstanceOf(ProviderError);
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'ratelimited' } }));
    await expect(searchTitles('movie', 'Lost', signal())).rejects.toMatchObject({ code: 'invalid-response' });
  });
});

describe('mapTvmaze', () => {
  it('drops malformed and duplicate shows, rejects images off static.tvmaze.com, and limits the list', () => {
    const shows = [
      STRANGER_THINGS,
      STRANGER_THINGS,
      { show: { id: 'x', name: 'Bad id' } },
      { show: { id: 5, name: '' } },
      null,
      { show: { id: 6, name: 'Evil image', image: { medium: 'http://evil.example/a.jpg' }, externals: { imdb: 'nm123' } } },
      ...Array.from({ length: 20 }, (_, index) => ({ show: { id: 100 + index, name: `Show ${index}` } })),
    ];
    const suggestions = mapTvmaze(shows);
    expect(suggestions).toHaveLength(MAX_SUGGESTIONS);
    expect(suggestions.map((s) => s.id).slice(0, 3)).toEqual(['2993', '6', '100']);
    expect(suggestions[1]).toMatchObject({ posterUrl: null, imdbId: null, year: null });
  });

  it('rejects a body that is not a list', () => {
    expect(() => mapTvmaze({ name: 'Not Found', status: 404 })).toThrow(ProviderError);
  });
});

describe('mapWikidata', () => {
  it('keeps only films, reads the year from the description, and never invents one', () => {
    const suggestions = mapWikidata({
      search: [
        INTERSTELLAR,
        { id: 'Q1', label: 'Toy Story', description: 'CGI-animated film series and Disney/Pixar media franchise' },
        { id: 'Q2', label: 'Interstellar travel', description: 'hypothetical travel between stars' },
        { id: 'Q3', label: 'Spirited Girl', description: "character from 1999 film 'The Thirteenth Year'" },
        { id: 'Q4', label: 'The Matrix', description: '1999 American science fiction action thriller film' },
        { id: 'Q5', label: 'Parasite', description: 'film' },
        { id: 'Q6', label: 'No description' },
        { id: 'P31', label: 'Not an item', description: '2000 film' },
        INTERSTELLAR,
      ],
    });
    expect(suggestions.map(({ id, title, year }) => ({ id, title, year }))).toEqual([
      { id: 'Q13417189', title: 'Interstellar', year: 2014 },
      { id: 'Q4', title: 'The Matrix', year: 1999 },
      { id: 'Q5', title: 'Parasite', year: null },
    ]);
  });
});
