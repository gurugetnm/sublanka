import { DOWNLOAD_STATUS_KEY, type DownloadRequest, type DownloadStatus, type PlayerState } from '../shared/messages';
import { sendToTab } from '../popup/tabBridge';
import { PROVIDERS } from '../providers';
import { ProviderError } from '../providers/types';
import { readSubtitleFile } from '../subtitles/subtitleFile';
import { SubtitleParseError } from '../subtitles/types';

/** Covers the link request and the file download; each request also has its own 30 s timeout. */
const DOWNLOAD_TIMEOUT_MS = 90_000;

export type DownloadResponse = { ok: true; state: PlayerState; warnings: string[]; remaining: number | null } | { ok: false; message: string };

class PageChangedError extends Error {}

/** The tab must still show the page the user was on; activeTab access ends when it navigates away. */
async function currentUrl(tabId: number): Promise<string> {
  try {
    return (await chrome.tabs.get(tabId)).url ?? '';
  } catch {
    throw new PageChangedError();
  }
}

function describe(error: unknown): string {
  if (error instanceof ProviderError) return error.message;
  if (error instanceof SubtitleParseError) return `The selected subtitle file could not be loaded. ${error.message}`;
  if (error instanceof PageChangedError) {
    return 'The page changed while the subtitle was downloading, so it was not loaded. Open SubLanka on the new page to try again.';
  }
  return 'The subtitle was downloaded but could not be added to the page. Reload the page and try again.';
}

/**
 * Downloads one search result, parses it with the same code as a local file, and loads it into the tab.
 * Runs in the service worker so it finishes even if the popup closes; progress is mirrored to
 * chrome.storage.session for a popup that reopens.
 */
export async function downloadAndLoad(request: DownloadRequest): Promise<DownloadResponse> {
  const status: DownloadStatus = {
    tabId: request.tabId,
    downloadId: request.downloadId,
    label: request.label,
    phase: 'loading',
    message: `Downloading ${request.label}…`,
    remaining: null,
    startedAt: Date.now(),
  };
  const report = (patch: Partial<DownloadStatus>) =>
    chrome.storage.session.set({ [DOWNLOAD_STATUS_KEY]: Object.assign(status, patch) }).catch(() => undefined);
  await report({});

  try {
    const provider = Object.values(PROVIDERS).find(({ id }) => id === request.provider);
    if (!provider) throw new ProviderError('bad-file', 'This subtitle source is not supported.');
    const pageUrl = await currentUrl(request.tabId);

    const file = await provider.download(request.downloadId, AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS));
    const parsed = await readSubtitleFile(new File([file.bytes], file.fileName));
    if ((await currentUrl(request.tabId)) !== pageUrl) throw new PageChangedError();

    const state = await sendToTab(request.tabId, {
      type: 'sublanka:load-track',
      fileName: file.fileName,
      cues: parsed.cues,
      source: provider.id,
    });
    const left = file.remaining === null ? '' : ` ${Math.max(0, file.remaining)} downloads left today.`;
    await report({ phase: 'loaded', message: `Loaded ${file.fileName} from ${provider.name}.${left}`, remaining: file.remaining });
    return { ok: true, state, warnings: parsed.warnings, remaining: file.remaining };
  } catch (error) {
    const message = describe(error);
    await report({ phase: 'failed', message });
    return { ok: false, message };
  }
}
