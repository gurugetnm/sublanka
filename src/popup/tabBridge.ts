import { CONTENT_SCRIPT_FILE } from '../shared/constants';
import type { DownloadResponse } from '../background/downloadSubtitle';
import { isDetectedMedia, type DetectedMedia } from '../discovery/mediaDetection';
import { DETECT_MEDIA_MESSAGE, isPlayerState, isRecord, type DownloadRequest, type PlayerState, type SubLankaMessage } from '../shared/messages';

export type TabConnection =
  | { kind: 'ready'; tabId: number; state: PlayerState }
  | { kind: 'unsupported' }
  | { kind: 'unavailable' };

const SCRIPTABLE_PROTOCOLS = new Set(['http:', 'https:', 'file:']);

/**
 * Sends one message to the tab's content script and returns the page's real player state.
 * Injecting first is a no-op when the script is already there, and keeps this working after
 * the page reloads or navigates while the popup is open.
 */
export async function sendToTab(tabId: number, message: SubLankaMessage): Promise<PlayerState> {
  await chrome.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT_FILE] });
  const state: unknown = await chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
  if (!isPlayerState(state)) throw new Error('The page did not respond. Reload the page and try again.');
  return state;
}

/** Connects to the active tab. State comes from the page, so it survives the popup closing and reopening. */
export async function connectToActiveTab(): Promise<TabConnection> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || !tab.url) return { kind: 'unavailable' };
  if (!SCRIPTABLE_PROTOCOLS.has(new URL(tab.url).protocol)) return { kind: 'unsupported' };

  try {
    return { kind: 'ready', tabId: tab.id, state: await sendToTab(tab.id, { type: 'sublanka:get-state' }) };
  } catch {
    // e.g. Chrome Web Store, error pages, or file:// without "Allow access to file URLs".
    return { kind: 'unavailable' };
  }
}

/** Best-effort movie/episode details from the page's public metadata; null when the page does not say. */
export async function detectPageMedia(tabId: number): Promise<DetectedMedia | null> {
  await chrome.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT_FILE] });
  const reply: unknown = await chrome.tabs.sendMessage(tabId, DETECT_MEDIA_MESSAGE, { frameId: 0 });
  return isDetectedMedia(reply) ? reply : null;
}

/** Hands a download to the background worker, which finishes it even if the popup closes. */
export async function requestDownload(request: Omit<DownloadRequest, 'type'>): Promise<DownloadResponse> {
  const reply: unknown = await chrome.runtime.sendMessage({ type: 'sublanka:download-subtitle', ...request } satisfies DownloadRequest);
  if (isRecord(reply) && reply.ok === true && isPlayerState(reply.state)) return reply as DownloadResponse;
  if (isRecord(reply) && reply.ok === false && typeof reply.message === 'string') return { ok: false, message: reply.message };
  return { ok: false, message: 'SubLanka could not start the download. Reload the extension and try again.' };
}
