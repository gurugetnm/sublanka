import { ProviderError, type MediaKind } from '../providers/types';

/**
 * Title suggestions from TMDB's search API (https://developer.themoviedb.org/reference/search-movie and /search-tv).
 *
 * The key is the user's own, entered in Settings and kept in chrome.storage.local. It is never bundled: anything
 * shipped inside an extension, build-time environment variables included, can be read by anyone who installs it.
 * Only the typed title is sent. TMDB allows cross-origin requests, so no host permission is needed.
 */

const API_KEY_KEY = 'tmdbApiKey';
const API_BASE = 'https://api.themoviedb.org/3';
const POSTER_BASE = 'https://image.tmdb.org/t/p/w92';
export const MAX_SUGGESTIONS = 8;
const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_SIZE = 50;

/** A real TMDB title. kind "episode" means a TV series, matching the search form's TV episode mode. */
export interface TitleSuggestion {
  kind: MediaKind;
  tmdbId: number;
  title: string;
  /** Movie release year or the series' first-air year; null when TMDB has no date. */
  year: number | null;
  /** TMDB image path such as "/abc.jpg", already checked; null when there is no poster. */
  posterPath: string | null;
}

const MESSAGES = {
  setup: 'Add a TMDB API key in Settings to get title suggestions.',
  invalidKey: 'TMDB rejected the API key. Check it under Settings → Title suggestions.',
  rateLimit: 'TMDB is receiving too many requests. Suggestions will be back in a few seconds.',
  offline: 'You are offline, so title suggestions are unavailable.',
  network: 'Could not reach TMDB for suggestions.',
  unavailable: 'TMDB is not responding right now.',
  invalid: 'TMDB sent an unreadable response.',
};

async function readApiKey(): Promise<string> {
  const key = (await chrome.storage.local.get(API_KEY_KEY))[API_KEY_KEY];
  return typeof key === 'string' ? key : '';
}

export async function loadTmdbKeyStatus(): Promise<boolean> {
  return (await readApiKey()) !== '';
}

export async function saveTmdbApiKey(apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();
  if (trimmed) await chrome.storage.local.set({ [API_KEY_KEY]: trimmed });
  else await chrome.storage.local.remove(API_KEY_KEY);
}

export const posterUrl = (path: string) => `${POSTER_BASE}${path}`;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Validates TMDB's untrusted response: malformed, adult and duplicate items are dropped, and at most MAX_SUGGESTIONS kept. */
export function mapSuggestions(body: unknown, kind: MediaKind): TitleSuggestion[] {
  if (!isRecord(body) || !Array.isArray(body.results)) throw new ProviderError('invalid-response', MESSAGES.invalid);
  const suggestions: TitleSuggestion[] = [];
  const seen = new Set<number>();
  for (const item of body.results as unknown[]) {
    if (suggestions.length === MAX_SUGGESTIONS) break;
    if (!isRecord(item) || item.adult === true) continue;
    const { id } = item;
    const title = kind === 'movie' ? item.title : item.name;
    const date = kind === 'movie' ? item.release_date : item.first_air_date;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || seen.has(id)) continue;
    if (typeof title !== 'string' || !title.trim() || title.length > 300) continue;
    seen.add(id);
    suggestions.push({
      kind,
      tmdbId: id,
      title: title.trim(),
      year: typeof date === 'string' && /^\d{4}-/.test(date) ? Number(date.slice(0, 4)) : null,
      posterPath: typeof item.poster_path === 'string' && /^\/[\w-]+\.(jpe?g|png|webp)$/i.test(item.poster_path) ? item.poster_path : null,
    });
  }
  return suggestions;
}

function statusError(status: number): ProviderError {
  if (status === 401) return new ProviderError('invalid-key', MESSAGES.invalidKey);
  if (status === 429) return new ProviderError('rate-limit', MESSAGES.rateLimit);
  return new ProviderError('unavailable', MESSAGES.unavailable);
}

/** Recent answers, so retyping or backspacing does not repeat requests. Lives as long as the popup. */
const cache = new Map<string, { at: number; suggestions: TitleSuggestion[] }>();

export function clearSuggestionCache() {
  cache.clear();
}

export async function searchTitles(kind: MediaKind, text: string, signal: AbortSignal): Promise<TitleSuggestion[]> {
  const query = text.trim().replace(/\s+/g, ' ');
  const cacheKey = `${kind}:${query.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.suggestions;

  const apiKey = await readApiKey();
  if (!apiKey) throw new ProviderError('setup-required', MESSAGES.setup);
  const params = new URLSearchParams({ query, include_adult: 'false', page: '1' });
  const headers: Record<string, string> = { Accept: 'application/json' };
  // TMDB accepts the v3 API key (32 hex characters) as a parameter, or the read access token as a Bearer token.
  if (/^[a-f0-9]{32}$/i.test(apiKey)) params.set('api_key', apiKey);
  else headers.Authorization = `Bearer ${apiKey}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/search/${kind === 'movie' ? 'movie' : 'tv'}?${params}`, {
      headers,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
    });
  } catch (error) {
    if (signal.aborted) throw new ProviderError('aborted', 'The request was cancelled.');
    if (error instanceof DOMException && error.name === 'TimeoutError') throw new ProviderError('unavailable', MESSAGES.unavailable);
    throw new ProviderError('network', navigator.onLine === false ? MESSAGES.offline : MESSAGES.network);
  }
  if (!response.ok) throw statusError(response.status);
  const suggestions = mapSuggestions(await response.json().catch(() => null), kind);

  cache.set(cacheKey, { at: Date.now(), suggestions });
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  return suggestions;
}
