import { isRecord } from '../shared/messages';
import { ProviderError } from '../providers/types';
import type { TranslationProvider } from './types';

/**
 * Google Cloud Translation - Basic (v2), NMT model.
 * Docs: https://docs.cloud.google.com/translate/docs/reference/rest/v2/translate
 * - POST JSON { q: string[], source, target, format }; answers { data: { translations: [{ translatedText }] } }, one per q, in order.
 * - At most 128 strings and 100 KB per request; Google recommends about 5K characters per request.
 * - English "en" and Sinhala "si" are both NMT languages.
 * - CORS allows chrome-extension:// origins and the X-Goog-Api-Key header (checked live).
 *
 * The API key is the user's own, entered in Settings and kept in chrome.storage.local. It is never bundled.
 */
const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';
const API_KEY_KEY = 'googleTranslateApiKey';
const REQUEST_TIMEOUT_MS = 30_000;

const MESSAGES = {
  setup: 'Translation setup is required. Add a Google Cloud Translation API key under Settings → Translation.',
  network: 'Could not reach Google Cloud Translation. Check your internet connection.',
  timeout: 'Google Cloud Translation took too long to respond.',
  unavailable: 'Google Cloud Translation is not responding right now. Try again later.',
  invalidKey: 'Google rejected the API key. Check it under Settings → Translation.',
  disabled: 'The Cloud Translation API is not enabled for this key’s Google Cloud project, or billing is off. Enable it in the Google Cloud console.',
  denied: 'This API key is not allowed to use Cloud Translation. Check the key’s API restrictions in the Google Cloud console.',
  rateLimit: 'Google Cloud Translation is rate limiting requests. Wait a minute and resume.',
  quota: 'The Google Cloud Translation quota for this project is used up. Raise the quota or try again later.',
  invalid: 'Google Cloud Translation sent a response SubLanka could not match to the subtitles, so nothing from it was used.',
};

export async function loadTranslationKeyStatus(): Promise<boolean> {
  return (await readApiKey()) !== '';
}

export async function saveTranslationApiKey(apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();
  if (trimmed) await chrome.storage.local.set({ [API_KEY_KEY]: trimmed });
  else await chrome.storage.local.remove(API_KEY_KEY);
}

async function readApiKey(): Promise<string> {
  const key = (await chrome.storage.local.get(API_KEY_KEY))[API_KEY_KEY];
  return typeof key === 'string' ? key : '';
}

/** Google errors carry a reason such as API_KEY_INVALID or SERVICE_DISABLED; the message alone is not stable. */
async function toError(response: Response): Promise<ProviderError> {
  const body: unknown = await response.json().catch(() => null);
  const text = JSON.stringify(body ?? '');
  if (/API_KEY_INVALID|API key not valid/i.test(text)) return new ProviderError('invalid-key', MESSAGES.invalidKey);
  if (/SERVICE_DISABLED|accessNotConfigured|BILLING_DISABLED/i.test(text)) return new ProviderError('setup-required', MESSAGES.disabled);
  if (response.status === 429 || /rateLimitExceeded|RATE_LIMIT_EXCEEDED/i.test(text)) return new ProviderError('rate-limit', MESSAGES.rateLimit);
  if (/quota|dailyLimitExceeded|RESOURCE_EXHAUSTED/i.test(text)) return new ProviderError('quota', MESSAGES.quota);
  if (response.status === 401 || response.status === 403) return new ProviderError('invalid-key', MESSAGES.denied);
  if (response.status >= 500) return new ProviderError('unavailable', MESSAGES.unavailable);
  return new ProviderError('invalid-response', `Google Cloud Translation refused the request (HTTP ${response.status}).`);
}

/** Every translation must be a string, and one per input; anything else is rejected rather than guessed at. */
export function mapTranslations(body: unknown, expected: number): string[] {
  const list = isRecord(body) && isRecord(body.data) ? body.data.translations : null;
  if (!Array.isArray(list) || list.length !== expected) throw new ProviderError('invalid-response', MESSAGES.invalid);
  return list.map((item) => {
    if (!isRecord(item) || typeof item.translatedText !== 'string' || !item.translatedText.trim()) {
      throw new ProviderError('invalid-response', MESSAGES.invalid);
    }
    return item.translatedText;
  });
}

export const googleTranslateProvider: TranslationProvider = {
  id: 'google-cloud-translation',
  name: 'Google Cloud Translation',
  maxSegments: 128,
  maxChars: 5000,
  isConfigured: loadTranslationKeyStatus,
  async translate(texts, signal) {
    const apiKey = await readApiKey();
    if (!apiKey) throw new ProviderError('setup-required', MESSAGES.setup);

    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
        // format: text, so the reply is plain text and no HTML entities need decoding.
        body: JSON.stringify({ q: texts, source: 'en', target: 'si', format: 'text' }),
        credentials: 'omit',
        signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
      });
    } catch (error) {
      if (signal.aborted) throw new ProviderError('aborted', 'The translation was cancelled.');
      if (error instanceof DOMException && error.name === 'TimeoutError') throw new ProviderError('network', MESSAGES.timeout);
      throw new ProviderError('network', MESSAGES.network);
    }
    if (!response.ok) throw await toError(response);
    return mapTranslations(await response.json().catch(() => null), texts.length);
  },
};
