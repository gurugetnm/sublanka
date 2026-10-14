import { CONTENT_SCRIPT_FILE, DEMO_SUBTITLE_TEXT, OVERLAY_TAG } from '../shared/constants';
import type { OverlayState, SubLankaMessage } from '../shared/messages';

export type TabStatus =
  | { kind: 'ready'; tabId: number; subtitleVisible: boolean }
  | { kind: 'unsupported' }
  | { kind: 'unavailable' };

const SCRIPTABLE_PROTOCOLS = new Set(['http:', 'https:', 'file:']);

/**
 * Probes the active tab. Overlay visibility is read from the page DOM, not popup state,
 * so it stays correct after the popup closes and reopens.
 */
export async function getActiveTabStatus(): Promise<TabStatus> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || !tab.url) return { kind: 'unavailable' };
  if (!SCRIPTABLE_PROTOCOLS.has(new URL(tab.url).protocol)) return { kind: 'unsupported' };

  try {
    const [probe] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (tag: string) => document.querySelector(tag) !== null,
      args: [OVERLAY_TAG],
    });
    return { kind: 'ready', tabId: tab.id, subtitleVisible: probe?.result === true };
  } catch {
    // e.g. Chrome Web Store, error pages, or file:// without "Allow access to file URLs".
    return { kind: 'unavailable' };
  }
}

/** Shows or hides the demo subtitle in the tab and returns whether it is now visible. */
export async function setDemoSubtitle(tabId: number, visible: boolean): Promise<boolean> {
  await chrome.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT_FILE] });
  const message: SubLankaMessage = visible
    ? { type: 'sublanka:show-subtitle', text: DEMO_SUBTITLE_TEXT }
    : { type: 'sublanka:hide-subtitle' };
  const state = (await chrome.tabs.sendMessage(tabId, message, { frameId: 0 })) as OverlayState | undefined;
  return state?.visible === true;
}
