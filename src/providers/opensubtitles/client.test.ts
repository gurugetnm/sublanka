import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderError, type SubtitleQuery } from '../types';
import { fetchSubtitleFile, login, requestDownload, searchParams, searchSubtitles, type OpenSubtitlesConfig } from './client';
import { downloadResponse, episodeSubtitle, movieSubtitle, searchResponse } from './fixtures';
import { openSubtitlesProvider, saveApiKey, signIn } from '.';

const CONFIG: OpenSubtitlesConfig = { apiKey: 'test-key', token: null, apiHost: 'api.opensubtitles.com', userAgent: 'SubLanka v0.3.0' };
const MOVIE: SubtitleQuery = { kind: 'movie', title: 'Interstellar', year: 2014, language: 'si', page: 1 };
const EPISODE: SubtitleQuery = { kind: 'episode', title: 'Stranger Things', season: 1, episode: 3, language: 'si', page: 1 };

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const signal = () => new AbortController().signal;

async function failure(promise: Promise<unknown>): Promise<ProviderError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ProviderError);
  return error as ProviderError;
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('searchSubtitles', () => {
  it('sends sorted, lowercase parameters with the API key and app identifier', async () => {
    fetchMock.mockResolvedValue(json(searchResponse([movieSubtitle])));
    const page = await searchSubtitles(CONFIG, MOVIE, signal());

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://api.opensubtitles.com/api/v1/subtitles?languages=si&query=interstellar&type=movie&year=2014');
    expect(init?.headers).toEqual({ Accept: 'application/json', 'Api-Key': 'test-key', 'X-User-Agent': 'SubLanka v0.3.0' });
    expect(init?.credentials).toBe('omit');
    expect(page).toMatchObject({ page: 1, totalPages: 1, totalCount: 1 });
    expect(page.results[0]).toEqual({
      provider: 'opensubtitles',
      id: '9000001',
      downloadId: '7000001',
      release: 'Interstellar.2014.1080p.BluRay.x264',
      fileName: 'Interstellar.2014.1080p.BluRay.x264.srt',
      fileCount: 1,
      language: 'si',
      feature: { kind: 'movie', title: 'Interstellar', seriesTitle: null, year: 2014, season: null, episode: null },
      uploadDate: '2021-03-14T10:00:00Z',
      downloadCount: 1520,
      hearingImpaired: false,
      aiTranslated: false,
      machineTranslated: false,
      fromTrusted: true,
      pageUrl: 'https://www.opensubtitles.com/en/subtitles/legacy/9000001',
    });
  });

  it('searches episodes by season and episode number, and maps the series title', async () => {
    fetchMock.mockResolvedValue(json(searchResponse([episodeSubtitle])));
    const page = await searchSubtitles(CONFIG, EPISODE, signal());
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('?episode_number=3&languages=si&query=stranger+things&season_number=1&type=episode');
    expect(page.results[0]?.feature).toEqual({
      kind: 'episode',
      title: 'Chapter Three: Holly, Jolly',
      seriesTitle: 'Stranger Things',
      year: 2016,
      season: 1,
      episode: 3,
    });
  });

  it('requests later pages and reports pagination', async () => {
    fetchMock.mockResolvedValue(json(searchResponse([movieSubtitle], 2, 3)));
    const page = await searchSubtitles(CONFIG, { ...MOVIE, page: 2 }, signal());
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('&page=2&');
    expect(searchParams(MOVIE).has('page')).toBe(false); // page=1 is the default and the API redirects it away
    expect(page).toMatchObject({ page: 2, totalPages: 3 });
  });

  it('searches by a chosen TMDB id instead of the title and year, never as an IMDb id', () => {
    expect(String(searchParams({ ...MOVIE, tmdbId: 157336 }))).toBe('languages=si&tmdb_id=157336&type=movie');
    expect(String(searchParams({ ...EPISODE, year: 2016, tmdbId: 66732 }))).toBe(
      'episode_number=3&languages=si&parent_tmdb_id=66732&season_number=1&type=episode',
    );
  });

  it('returns an empty list when nothing is found', async () => {
    fetchMock.mockResolvedValue(json(searchResponse([])));
    await expect(searchSubtitles(CONFIG, MOVIE, signal())).resolves.toEqual({ results: [], page: 1, totalPages: 1, totalCount: 0 });
  });

  it('drops malformed items, items without files, duplicates and links outside the provider', async () => {
    const offSite = { ...movieSubtitle, id: '3', attributes: { ...movieSubtitle.attributes, url: 'https://evil.example/x' } };
    fetchMock.mockResolvedValue(
      json(searchResponse([movieSubtitle, movieSubtitle, null, { id: '2', attributes: { files: [] } }, { id: '4' }, offSite])),
    );
    const { results } = await searchSubtitles(CONFIG, MOVIE, signal());
    expect(results.map((result) => result.id)).toEqual(['9000001', '3']);
    expect(results[1]?.pageUrl).toBeNull();
  });

  it.each([
    [401, 'auth'],
    [403, 'invalid-key'],
    [429, 'rate-limit'],
    [503, 'unavailable'],
    [400, 'unavailable'],
  ])('maps HTTP %i to %s', async (status, code) => {
    fetchMock.mockResolvedValue(json({ message: 'nope' }, status));
    expect((await failure(searchSubtitles(CONFIG, MOVIE, signal()))).code).toBe(code);
  });

  it('reports network failures', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await failure(searchSubtitles(CONFIG, MOVIE, signal()));
    expect(error.code).toBe('network');
    expect(error.message).toMatch(/internet connection/);
  });

  it('rejects responses that are not the documented shape', async () => {
    fetchMock.mockResolvedValue(json({ unexpected: true }));
    expect((await failure(searchSubtitles(CONFIG, MOVIE, signal()))).code).toBe('invalid-response');
    fetchMock.mockResolvedValue(new Response('<html>maintenance</html>', { status: 200 }));
    expect((await failure(searchSubtitles(CONFIG, MOVIE, signal()))).code).toBe('invalid-response');
  });

  it('reports cancellation', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
    const pending = searchSubtitles(CONFIG, MOVIE, controller.signal);
    controller.abort();
    expect((await failure(pending)).code).toBe('aborted');
  });

  it('sends the sign-in token only when there is one', async () => {
    fetchMock.mockResolvedValue(json(searchResponse([])));
    await searchSubtitles({ ...CONFIG, token: 'tok' }, MOVIE, signal());
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it('never sends credentials to a host outside opensubtitles.com', async () => {
    expect((await failure(searchSubtitles({ ...CONFIG, apiHost: 'evil.example' }, MOVIE, signal()))).code).toBe('setup-required');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('requestDownload', () => {
  it('posts the file id asking for SRT and returns the link and remaining quota', async () => {
    fetchMock.mockResolvedValue(json(downloadResponse));
    await expect(requestDownload(CONFIG, 7000001, signal())).resolves.toEqual({
      link: downloadResponse.link,
      fileName: 'Interstellar.2014.1080p.BluRay.x264.srt',
      remaining: 2,
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://api.opensubtitles.com/api/v1/download');
    expect(init).toMatchObject({ method: 'POST', body: '{"file_id":7000001,"sub_format":"srt"}' });
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' });
  });

  it('explains an exhausted download quota', async () => {
    fetchMock.mockResolvedValue(json({ requests: 5, remaining: 0, message: 'quota', reset_time: '3 hours and 2 minutes' }, 406));
    const error = await failure(requestDownload(CONFIG, 1, signal()));
    expect(error.code).toBe('quota');
    expect(error.message).toBe('Download limit reached. Please try again later. The limit resets in 3 hours and 2 minutes.');
  });

  it('refuses links outside opensubtitles.com', async () => {
    fetchMock.mockResolvedValue(json({ ...downloadResponse, link: 'https://opensubtitles.com.evil.example/file.srt' }));
    expect((await failure(requestDownload(CONFIG, 1, signal()))).code).toBe('invalid-response');
    fetchMock.mockResolvedValue(json({ ...downloadResponse, link: 'http://www.opensubtitles.com/file.srt' }));
    expect((await failure(requestDownload(CONFIG, 1, signal()))).code).toBe('invalid-response');
  });
});

describe('fetchSubtitleFile', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,000\nආයුබෝවන්\n';

  it('downloads the file without sending the API key or token', async () => {
    fetchMock.mockResolvedValue(new Response(srt, { headers: { 'Content-Type': 'application/x-subrip' } }));
    const bytes = await fetchSubtitleFile(downloadResponse.link, signal());
    expect(new TextDecoder().decode(bytes)).toBe(srt);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init).toMatchObject({ credentials: 'omit' });
    expect(init?.headers).toBeUndefined();
  });

  it('rejects HTML pages, oversized files and redirects away from the provider', async () => {
    fetchMock.mockResolvedValue(new Response('<script>alert(1)</script>', { headers: { 'Content-Type': 'text/html' } }));
    expect((await failure(fetchSubtitleFile(downloadResponse.link, signal()))).code).toBe('bad-file');

    fetchMock.mockResolvedValue(new Response(new Uint8Array(5 * 1024 * 1024 + 1)));
    expect((await failure(fetchSubtitleFile(downloadResponse.link, signal()))).message).toMatch(/larger than 5 MB/);

    const redirected = new Response(srt);
    Object.defineProperty(redirected, 'url', { value: 'https://elsewhere.example/file.srt' });
    fetchMock.mockResolvedValue(redirected);
    expect((await failure(fetchSubtitleFile(downloadResponse.link, signal()))).code).toBe('invalid-response');
  });

  it('reports an expired link', async () => {
    fetchMock.mockResolvedValue(new Response('gone', { status: 410 }));
    expect((await failure(fetchSubtitleFile(downloadResponse.link, signal()))).message).toMatch(/expired/);
  });
});

describe('login', () => {
  it('returns the token and accepts a VIP host on opensubtitles.com', async () => {
    fetchMock.mockResolvedValue(json({ token: 'tok', base_url: 'vip-api.opensubtitles.com', user: {} }));
    await expect(login(CONFIG, 'me', 'secret', signal())).resolves.toEqual({ token: 'tok', apiHost: 'vip-api.opensubtitles.com' });
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe('{"username":"me","password":"secret"}');
  });

  it('ignores a base_url outside opensubtitles.com', async () => {
    fetchMock.mockResolvedValue(json({ token: 'tok', base_url: 'evil.example' }));
    await expect(login(CONFIG, 'me', 'secret', signal())).resolves.toEqual({ token: 'tok', apiHost: 'api.opensubtitles.com' });
  });
});

describe('openSubtitlesProvider', () => {
  let local: Record<string, unknown>;
  let session: Record<string, unknown>;
  const area = (store: () => Record<string, unknown>) => ({
    get: vi.fn(async (key: string) => (key in store() ? { [key]: store()[key] } : {})),
    set: vi.fn(async (items: Record<string, unknown>) => void Object.assign(store(), items)),
    remove: vi.fn(async (key: string) => void Reflect.deleteProperty(store(), key)),
  });

  beforeEach(() => {
    local = {};
    session = {};
    vi.stubGlobal('chrome', {
      runtime: { getManifest: () => ({ version: '0.3.0' }) },
      storage: { local: area(() => local), session: area(() => session) },
    });
  });

  it('asks for setup before searching when no API key is saved', async () => {
    const error = await failure(openSubtitlesProvider.search(MOVIE, signal()));
    expect(error).toMatchObject({ code: 'setup-required', message: expect.stringMatching(/setup is required/) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stores the token in session storage only and never the password', async () => {
    await saveApiKey(' key ');
    fetchMock.mockResolvedValue(json({ token: 'tok', base_url: 'api.opensubtitles.com' }));
    await signIn('me', 'secret', signal());
    expect(local).toEqual({ opensubtitlesApiKey: 'key' });
    expect(session).toEqual({ opensubtitlesSession: { token: 'tok', apiHost: 'api.opensubtitles.com', username: 'me' } });
    expect(JSON.stringify([local, session])).not.toContain('secret');
  });

  it('forgets an expired sign-in', async () => {
    local.opensubtitlesApiKey = 'key';
    session.opensubtitlesSession = { token: 'old', apiHost: 'api.opensubtitles.com', username: 'me' };
    fetchMock.mockResolvedValue(json({ message: 'invalid token' }, 401));
    expect((await failure(openSubtitlesProvider.search(MOVIE, signal()))).code).toBe('auth');
    expect(session).toEqual({});
  });

  it('downloads through the documented two-step flow', async () => {
    local.opensubtitlesApiKey = 'key';
    fetchMock.mockResolvedValueOnce(json({ ...downloadResponse, file_name: 'Interstellar.sub' })).mockResolvedValueOnce(new Response('1\n'));
    const file = await openSubtitlesProvider.download('7000001', signal());
    expect(file).toMatchObject({ fileName: 'Interstellar.srt', remaining: 2 });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(['https://api.opensubtitles.com/api/v1/download', downloadResponse.link]);
  });
});
