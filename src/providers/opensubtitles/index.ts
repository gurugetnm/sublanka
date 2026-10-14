import { ProviderError, type DownloadedFile, type SubtitleProvider } from '../types';
import { DEFAULT_API_HOST, fetchSubtitleFile, login, requestDownload, searchSubtitles, type OpenSubtitlesConfig } from './client';

/**
 * Storage:
 * - API key → chrome.storage.local. It is the user's own developer key, entered in Settings, never bundled.
 * - Sign-in token → chrome.storage.session: memory only, cleared when the browser closes, and not readable
 *   by content scripts. The password itself is never stored.
 */
const API_KEY_KEY = 'opensubtitlesApiKey';
const SESSION_KEY = 'opensubtitlesSession';

interface StoredSession {
  token: string;
  apiHost: string;
  username: string;
}

export interface AccountStatus {
  hasApiKey: boolean;
  /** Signed-in username, or null for anonymous downloads. */
  username: string | null;
}

const userAgent = () => `SubLanka v${chrome.runtime.getManifest().version}`;

function parseSession(value: unknown): StoredSession | null {
  if (typeof value !== 'object' || value === null) return null;
  const { token, apiHost, username } = value as Record<string, unknown>;
  return typeof token === 'string' && typeof apiHost === 'string' && typeof username === 'string' ? { token, apiHost, username } : null;
}

async function readApiKey(): Promise<string> {
  const stored = await chrome.storage.local.get(API_KEY_KEY);
  const key = stored[API_KEY_KEY];
  return typeof key === 'string' ? key : '';
}

async function readSession(): Promise<StoredSession | null> {
  return parseSession((await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY]);
}

export async function loadAccountStatus(): Promise<AccountStatus> {
  const [apiKey, session] = await Promise.all([readApiKey(), readSession()]);
  return { hasApiKey: apiKey !== '', username: session?.username ?? null };
}

export async function saveApiKey(apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();
  if (trimmed) await chrome.storage.local.set({ [API_KEY_KEY]: trimmed });
  else await chrome.storage.local.remove(API_KEY_KEY);
  // A session belongs to the key it was created with.
  await chrome.storage.session.remove(SESSION_KEY);
}

export async function signIn(username: string, password: string, signal: AbortSignal): Promise<void> {
  const apiKey = await readApiKey();
  if (!apiKey) throw new ProviderError('setup-required', 'Add your OpenSubtitles API key before signing in.');
  try {
    const { token, apiHost } = await login({ apiKey, userAgent: userAgent() }, username.trim(), password, signal);
    await chrome.storage.session.set({ [SESSION_KEY]: { token, apiHost, username: username.trim() } satisfies StoredSession });
  } catch (error) {
    if (error instanceof ProviderError && error.code === 'auth') {
      throw new ProviderError('auth', 'OpenSubtitles did not accept that username and password.');
    }
    throw error;
  }
}

export function signOut(): Promise<void> {
  return chrome.storage.session.remove(SESSION_KEY);
}

async function loadConfig(): Promise<OpenSubtitlesConfig> {
  const [apiKey, session] = await Promise.all([readApiKey(), readSession()]);
  if (!apiKey) throw new ProviderError('setup-required', 'Subtitle provider setup is required before searching. Add an OpenSubtitles API key in Settings.');
  return { apiKey, token: session?.token ?? null, apiHost: session?.apiHost ?? DEFAULT_API_HOST, userAgent: userAgent() };
}

/** Runs a call; when a saved sign-in has expired, forgets it so the next attempt is anonymous or prompts a new sign-in. */
async function withConfig<T>(call: (config: OpenSubtitlesConfig) => Promise<T>): Promise<T> {
  const config = await loadConfig();
  try {
    return await call(config);
  } catch (error) {
    if (error instanceof ProviderError && error.code === 'auth' && config.token) await signOut();
    throw error;
  }
}

/** OpenSubtitles always delivers SRT here (see requestDownload), so name the file to match its contents. */
function srtName(fileName: string): string {
  return /\.srt$/i.test(fileName) ? fileName : `${fileName.replace(/\.[a-z0-9]{1,4}$/i, '')}.srt`;
}

export const openSubtitlesProvider: SubtitleProvider = {
  id: 'opensubtitles',
  name: 'OpenSubtitles',
  search: (query, signal) => withConfig((config) => searchSubtitles(config, query, signal)),
  download: (downloadId, signal) =>
    withConfig(async (config): Promise<DownloadedFile> => {
      const fileId = Number(downloadId);
      if (!Number.isSafeInteger(fileId) || fileId <= 0) throw new ProviderError('bad-file', 'This subtitle cannot be downloaded.');
      const { link, fileName, remaining } = await requestDownload(config, fileId, signal);
      return { fileName: srtName(fileName), bytes: await fetchSubtitleFile(link, signal), remaining };
    }),
};
