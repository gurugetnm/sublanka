import { MAX_SUBTITLE_FILE_BYTES } from '../../subtitles/subtitleFile';
import { ProviderError, type SearchPage, type SubtitleQuery } from '../types';
import { isProviderUrl, mapDownloadResponse, mapSearchResponse, type DownloadLink } from './mapper';

/**
 * Minimal client for the OpenSubtitles.com REST API v1 (not the retired opensubtitles.org XML-RPC API).
 * Docs: https://opensubtitles.stoplight.io/docs/opensubtitles-api
 */

export const DEFAULT_API_HOST = 'api.opensubtitles.com';
const REQUEST_TIMEOUT_MS = 30_000;

export interface OpenSubtitlesConfig {
  apiKey: string;
  /** Bearer token from POST /login; null for anonymous use. */
  token: string | null;
  /** api.opensubtitles.com, or the base_url /login returned (e.g. a VIP host). */
  apiHost: string;
  /** Identifies the app as the API asks; sent as X-User-Agent because browsers do not let pages set User-Agent. */
  userAgent: string;
}

const MESSAGES = {
  network: 'Could not reach OpenSubtitles. Check your internet connection and try again.',
  timeout: 'OpenSubtitles took too long to respond. Try again in a moment.',
  unavailable: 'OpenSubtitles is not responding right now. Try again later.',
  invalidKey: 'OpenSubtitles rejected the API key. Check it under Settings → Subtitle provider.',
  auth: 'OpenSubtitles did not accept your sign-in. Sign in again under Settings → Subtitle provider.',
  rateLimit: 'Too many requests to OpenSubtitles. Wait a few seconds and try again.',
  quota: 'Download limit reached. Please try again later.',
  expired: 'The download link expired. Try loading the subtitle again.',
};

/** Combines the caller's signal with a timeout, so a stalled request never hangs a search or a worker. */
function withTimeout(signal: AbortSignal): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
}

async function send(url: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: withTimeout(signal) });
  } catch (error) {
    if (signal.aborted) throw new ProviderError('aborted', 'The request was cancelled.');
    if (error instanceof DOMException && error.name === 'TimeoutError') throw new ProviderError('unavailable', MESSAGES.timeout);
    throw new ProviderError('network', MESSAGES.network);
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Maps documented HTTP failures to user-facing errors. */
async function toError(response: Response): Promise<ProviderError> {
  const body = await readJson(response);
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  switch (response.status) {
    case 401:
      return new ProviderError('auth', MESSAGES.auth);
    case 403:
      return new ProviderError('invalid-key', MESSAGES.invalidKey);
    case 406: {
      const reset = typeof record.reset_time === 'string' && record.reset_time.length < 80 ? ` The limit resets in ${record.reset_time}.` : '';
      return new ProviderError('quota', `${MESSAGES.quota}${reset}`);
    }
    case 410:
      return new ProviderError('unavailable', MESSAGES.expired);
    case 429:
      return new ProviderError('rate-limit', MESSAGES.rateLimit);
    default:
      if (response.status >= 500) return new ProviderError('unavailable', MESSAGES.unavailable);
      return new ProviderError('unavailable', `OpenSubtitles could not handle this request (HTTP ${response.status}). Try different search details.`);
  }
}

/** Calls the JSON API. Credentials only ever go to an https opensubtitles.com API host. */
async function callApi(config: OpenSubtitlesConfig, path: string, init: RequestInit, signal: AbortSignal): Promise<unknown> {
  const url = `https://${config.apiHost}/api/v1/${path}`;
  if (!isProviderUrl(url)) throw new ProviderError('setup-required', 'The OpenSubtitles server address is not valid. Sign out and sign in again.');

  const headers: Record<string, string> = { Accept: 'application/json', 'Api-Key': config.apiKey, 'X-User-Agent': config.userAgent };
  if (init.body) headers['Content-Type'] = 'application/json';
  if (config.token) headers.Authorization = `Bearer ${config.token}`;

  const response = await send(url, { ...init, headers, credentials: 'omit' }, signal);
  if (response.url && !isProviderUrl(response.url)) throw new ProviderError('invalid-response', MESSAGES.unavailable);
  if (!response.ok) throw await toError(response);
  const body = await readJson(response);
  if (body === null) throw new ProviderError('invalid-response', 'OpenSubtitles sent an unreadable response. Try again later.');
  return body;
}

/**
 * GET parameters in alphabetical order with lowercase values, as the API docs ask. Default values are
 * left out too: the API answers page=1 with a 301 to the same URL without it, which costs an extra request.
 */
export function searchParams(query: SubtitleQuery): URLSearchParams {
  const params: Record<string, string> = { languages: query.language, type: query.kind };
  // A TMDB id names the exact movie or series, so the title and year are not needed (documented: tmdb_id, parent_tmdb_id).
  if (query.tmdbId !== undefined) params[query.kind === 'movie' ? 'tmdb_id' : 'parent_tmdb_id'] = String(query.tmdbId);
  else {
    params.query = query.title.trim().toLowerCase();
    if (query.year) params.year = String(query.year);
  }
  if (query.page > 1) params.page = String(query.page);
  if (query.kind === 'episode' && query.season !== undefined) params.season_number = String(query.season);
  if (query.kind === 'episode' && query.episode !== undefined) params.episode_number = String(query.episode);
  return new URLSearchParams(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)));
}

export async function searchSubtitles(config: OpenSubtitlesConfig, query: SubtitleQuery, signal: AbortSignal): Promise<SearchPage> {
  const body = await callApi(config, `subtitles?${searchParams(query)}`, { method: 'GET' }, signal);
  return mapSearchResponse(body, query.page);
}

/** Asks for a temporary download link. Each successful call counts against the user's download quota. */
export async function requestDownload(config: OpenSubtitlesConfig, fileId: number, signal: AbortSignal): Promise<DownloadLink> {
  // sub_format "srt" asks the provider to deliver plain SRT text, so no archive handling is needed.
  const body = await callApi(config, 'download', { method: 'POST', body: JSON.stringify({ file_id: fileId, sub_format: 'srt' }) }, signal);
  return mapDownloadResponse(body);
}

/** Reads at most `limit` bytes, so a wrong or hostile response cannot exhaust memory. */
async function readCapped(response: Response, limit: number): Promise<ArrayBuffer> {
  const declared = Number(response.headers.get('Content-Length'));
  if (declared > limit) throw new ProviderError('bad-file', 'The subtitle file is larger than 5 MB, so it was not loaded.');
  const reader = response.body?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new ProviderError('bad-file', 'The subtitle file is larger than 5 MB, so it was not loaded.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

/** Fetches the file behind a download link. No API key or token is sent: the link itself is the authorization. */
export async function fetchSubtitleFile(link: string, signal: AbortSignal): Promise<ArrayBuffer> {
  if (!isProviderUrl(link)) throw new ProviderError('invalid-response', 'The download link is not on opensubtitles.com, so it was not opened.');
  const response = await send(link, { credentials: 'omit' }, signal);
  // Redirects are followed, but the final address must still be on the provider's site.
  if (response.url && !isProviderUrl(response.url)) {
    throw new ProviderError('invalid-response', 'The download was redirected away from opensubtitles.com, so it was not loaded.');
  }
  if (!response.ok) throw await toError(response);
  const type = response.headers.get('Content-Type') ?? '';
  if (/html|json|javascript|image|video|audio/i.test(type)) {
    throw new ProviderError('bad-file', 'OpenSubtitles sent something other than a subtitle file. Try another result.');
  }
  return readCapped(response, MAX_SUBTITLE_FILE_BYTES);
}

export interface LoginResult {
  token: string;
  apiHost: string;
}

/** POST /login. The password is sent once over HTTPS and never stored; only the returned token is kept. */
export async function login(
  config: Pick<OpenSubtitlesConfig, 'apiKey' | 'userAgent'>,
  username: string,
  password: string,
  signal: AbortSignal,
): Promise<LoginResult> {
  const body = await callApi(
    { ...config, token: null, apiHost: DEFAULT_API_HOST },
    'login',
    { method: 'POST', body: JSON.stringify({ username, password }) },
    signal,
  );
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  if (typeof record.token !== 'string' || !record.token) {
    throw new ProviderError('invalid-response', 'OpenSubtitles did not return a sign-in token. Try again later.');
  }
  const baseUrl = typeof record.base_url === 'string' ? record.base_url.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : '';
  // Use the host OpenSubtitles assigns (VIP accounts get their own), but only if it is one of theirs.
  const apiHost = baseUrl && isProviderUrl(`https://${baseUrl}/`) ? baseUrl : DEFAULT_API_HOST;
  return { token: record.token, apiHost };
}
