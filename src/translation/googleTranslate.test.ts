import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../providers/types';
import { googleTranslateProvider, mapTranslations } from './googleTranslate';

let local: Record<string, unknown>;
const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const googleError = (status: number, reason: string, message = 'error') => json({ error: { code: status, message, details: [{ reason }] } }, status);

beforeEach(() => {
  local = { googleTranslateApiKey: 'test-key' };
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('chrome', { storage: { local: { get: vi.fn(async (key: string) => ({ [key]: local[key] })) } } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

const translate = (texts: string[]) => googleTranslateProvider.translate(texts, new AbortController().signal);
const codeOf = (promise: Promise<unknown>) => promise.then(() => 'ok', (error: unknown) => (error instanceof ProviderError ? error.code : 'other'));

describe('googleTranslateProvider', () => {
  it('sends the documented v2 request with the key in a header, not the URL', async () => {
    fetchMock.mockResolvedValue(json({ data: { translations: [{ translatedText: 'ආයුබෝවන්.' }, { translatedText: 'පළමු\nදෙවන' }] } }));

    await expect(translate(['Hello.', 'First\nsecond'])).resolves.toEqual(['ආයුබෝවන්.', 'පළමු\nදෙවන']);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://translation.googleapis.com/language/translate/v2');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json', 'X-Goog-Api-Key': 'test-key' });
    expect(JSON.parse(String(init?.body))).toEqual({ q: ['Hello.', 'First\nsecond'], source: 'en', target: 'si', format: 'text' });
    expect(init?.credentials).toBe('omit');
  });

  it('needs setup when no key is saved, without any request', async () => {
    local = {};
    expect(await googleTranslateProvider.isConfigured()).toBe(false);
    expect(await codeOf(translate(['Hi']))).toBe('setup-required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid key (real response shape)', googleError(400, 'API_KEY_INVALID', 'API key not valid. Please pass a valid API key.'), 'invalid-key'],
    ['API not enabled', googleError(403, 'SERVICE_DISABLED'), 'setup-required'],
    ['rate limited', googleError(429, 'RATE_LIMIT_EXCEEDED'), 'rate-limit'],
    ['quota exhausted', googleError(403, 'dailyLimitExceeded', 'Daily Limit Exceeded: quota'), 'quota'],
    ['key restricted', googleError(403, 'API_KEY_SERVICE_BLOCKED'), 'invalid-key'],
    ['server error', json({}, 503), 'unavailable'],
    ['other bad request', googleError(400, 'INVALID_ARGUMENT'), 'invalid-response'],
  ])('maps %s', async (_name, response, code) => {
    fetchMock.mockResolvedValue(response);
    expect(await codeOf(translate(['Hi']))).toBe(code);
  });

  it('maps network failures and cancellation', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await codeOf(translate(['Hi']))).toBe('network');

    const controller = new AbortController();
    controller.abort();
    expect(await codeOf(googleTranslateProvider.translate(['Hi'], controller.signal))).toBe('aborted');
  });
});

describe('mapTranslations', () => {
  it.each([
    ['too few translations', { data: { translations: [{ translatedText: 'අ' }] } }],
    ['too many translations', { data: { translations: [{ translatedText: 'අ' }, { translatedText: 'ආ' }, { translatedText: 'ඇ' }] } }],
    ['an empty translation', { data: { translations: [{ translatedText: 'අ' }, { translatedText: '  ' }] } }],
    ['a non-string translation', { data: { translations: [{ translatedText: 'අ' }, { translatedText: 7 }] } }],
    ['no data', { translations: [] }],
    ['null', null],
  ])('rejects %s instead of guessing a mapping', (_name, body) => {
    expect(() => mapTranslations(body, 2)).toThrow(ProviderError);
  });
});
