import { ProviderError, type MediaKind } from '../providers/types';

/**
 * Title suggestions from free, keyless public APIs. Only the typed title is sent.
 * - TV series: TVmaze show search (https://www.tvmaze.com/api). Data CC BY-SA 4.0, attribution required.
 *   Rate limit: at least 20 calls per 10 seconds per IP, then HTTP 429.
 * - Movies: Wikidata entity prefix search (https://www.wikidata.org/w/api.php?action=help&modules=wbsearchentities).
 *   Data CC0. Wikimedia asks clients to identify themselves; browsers cannot set User-Agent, so Api-User-Agent is sent.
 * Both answer cross-origin requests from any origin, so no host permission is needed.
 */

export type TitleSource = 'tvmaze' | 'wikidata';

/** A real title from TVmaze (kind "episode": a TV series) or Wikidata (kind "movie"). */
export interface TitleSuggestion {
  kind: MediaKind;
  source: TitleSource;
  /** The source's own id: a TVmaze show id or a Wikidata item id ("Q13417189"). */
  id: string;
  title: string;
  /** Movie release year or the series' premiere year; null when unknown. */
  year: number | null;
  /** Thumbnail on static.tvmaze.com, already checked; null when there is none. */
  posterUrl: string | null;
  /** Numeric IMDb id ("tt0903747" → 903747) when the source lists one. */
  imdbId: number | null;
}

export const MAX_SUGGESTIONS = 8;
const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_SIZE = 50;
const SOURCE_NAMES: Record<TitleSource, string> = { tvmaze: 'TVmaze', wikidata: 'Wikidata' };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const validTitle = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '' && value.length <= 300;
const validYear = (year: number) => year >= 1880 && year <= new Date().getFullYear() + 5;

function invalid(source: TitleSource) {
  return new ProviderError('invalid-response', `${SOURCE_NAMES[source]} sent an unreadable response.`);
}

/** TVmaze returns [{ score, show: { id, name, premiered, image: { medium }, externals: { imdb } } }]. */
export function mapTvmaze(body: unknown): TitleSuggestion[] {
  if (!Array.isArray(body)) throw invalid('tvmaze');
  const suggestions: TitleSuggestion[] = [];
  for (const item of body as unknown[]) {
    if (suggestions.length === MAX_SUGGESTIONS) break;
    const show = isRecord(item) && isRecord(item.show) ? item.show : null;
    if (!show || !Number.isSafeInteger(show.id) || (show.id as number) <= 0 || !validTitle(show.name)) continue;
    const id = String(show.id);
    if (suggestions.some((suggestion) => suggestion.id === id)) continue;
    const year = typeof show.premiered === 'string' && /^\d{4}-/.test(show.premiered) ? Number(show.premiered.slice(0, 4)) : null;
    const imdb = isRecord(show.externals) ? show.externals.imdb : null;
    suggestions.push({
      kind: 'episode',
      source: 'tvmaze',
      id,
      title: show.name.trim(),
      year: year !== null && validYear(year) ? year : null,
      posterUrl: isRecord(show.image) ? tvmazeImage(show.image.medium) : null,
      imdbId: typeof imdb === 'string' && /^tt\d{6,10}$/.test(imdb) ? Number(imdb.slice(2)) : null,
    });
  }
  return suggestions;
}

function tvmazeImage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'static.tvmaze.com' ? url.href : null;
  } catch {
    return null;
  }
}

/** Wikidata descriptions of films read like "2014 film by Christopher Nolan"; series, franchises and characters are skipped. */
const FILM = /\b(film|movie)\b/i;
const NOT_A_FILM = /\b(series|franchise|character|soundtrack|festival|award|studio|company|novel|book|album|song)\b/i;

/** Wikidata returns { search: [{ id: "Q…", label, description }] }; only films are kept. */
export function mapWikidata(body: unknown): TitleSuggestion[] {
  if (!isRecord(body) || !Array.isArray(body.search)) throw invalid('wikidata');
  const suggestions: TitleSuggestion[] = [];
  for (const item of body.search as unknown[]) {
    if (suggestions.length === MAX_SUGGESTIONS) break;
    if (!isRecord(item) || typeof item.id !== 'string' || !/^Q\d+$/.test(item.id) || !validTitle(item.label)) continue;
    const { id, label, description } = item;
    if (typeof description !== 'string' || !FILM.test(description) || NOT_A_FILM.test(description)) continue;
    if (suggestions.some((suggestion) => suggestion.id === id)) continue;
    const year = /^(\d{4})\b/.exec(description)?.[1];
    suggestions.push({
      kind: 'movie',
      source: 'wikidata',
      id,
      title: label.trim(),
      year: year && validYear(Number(year)) ? Number(year) : null,
      posterUrl: null,
      imdbId: null,
    });
  }
  return suggestions;
}

function request(kind: MediaKind, query: string): { source: TitleSource; url: string; headers: Record<string, string> } {
  if (kind === 'episode') {
    return { source: 'tvmaze', url: `https://api.tvmaze.com/search/shows?${new URLSearchParams({ q: query })}`, headers: {} };
  }
  // limit=50 (the maximum) because non-film items are filtered out afterwards.
  const params = new URLSearchParams({ action: 'wbsearchentities', search: query, language: 'en', uselang: 'en', type: 'item', limit: '50', format: 'json', origin: '*' });
  const agent = `SubLanka/${chrome.runtime.getManifest().version} (https://github.com/gurugetnm/sublanka)`;
  return { source: 'wikidata', url: `https://www.wikidata.org/w/api.php?${params}`, headers: { 'Api-User-Agent': agent } };
}

function statusError(source: TitleSource, status: number): ProviderError {
  const name = SOURCE_NAMES[source];
  if (status === 429) return new ProviderError('rate-limit', `${name} is receiving too many requests. Suggestions will be back in a few seconds.`);
  return new ProviderError('unavailable', `${name} is not responding right now.`);
}

/** Recent answers, so retyping or backspacing does not repeat requests (and stays well inside rate limits). */
const cache = new Map<string, { at: number; suggestions: TitleSuggestion[] }>();

export function clearSuggestionCache() {
  cache.clear();
}

export async function searchTitles(kind: MediaKind, text: string, signal: AbortSignal): Promise<TitleSuggestion[]> {
  const query = text.trim().replace(/\s+/g, ' ');
  const cacheKey = `${kind}:${query.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.suggestions;

  const { source, url, headers } = request(kind, query);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json', ...headers },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
    });
  } catch (error) {
    if (signal.aborted) throw new ProviderError('aborted', 'The request was cancelled.');
    if (error instanceof DOMException && error.name === 'TimeoutError') throw statusError(source, 504);
    throw new ProviderError(
      'network',
      navigator.onLine === false ? 'You are offline, so title suggestions are unavailable.' : `Could not reach ${SOURCE_NAMES[source]} for suggestions.`,
    );
  }
  if (!response.ok) throw statusError(source, response.status);
  const body: unknown = await response.json().catch(() => null);
  const suggestions = source === 'tvmaze' ? mapTvmaze(body) : mapWikidata(body);

  cache.set(cacheKey, { at: Date.now(), suggestions });
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  return suggestions;
}
