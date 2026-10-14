import { detectMedia, isNetflixWatchPage, type DetectedMedia } from '../discovery/mediaDetection';

export interface MediaWatcherOptions {
  /** Delay between retries while the popup waits for a late-rendered title. */
  retryMs?: number;
  /** Total tries per request, so a page without a title answers within retryMs × attempts. */
  attempts?: number;
  /** How often a Netflix watch page is re-read in the background. */
  watchMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Netflix is a single-page app that shows the title only while the player controls or the pause overlay are visible.
 * The watcher re-reads a watch page on a slow timer and remembers the last title it saw for the current URL, so the
 * popup can still answer after the controls hide. A URL change (next episode, back to browse) forgets it.
 * A timer instead of a MutationObserver: the player mutates constantly, and one read every few seconds is enough.
 */
export function createMediaWatcher(document: Document, currentUrl: () => string, options: MediaWatcherOptions = {}) {
  const { retryMs = 500, attempts = 8, watchMs = 2000 } = options;
  let seen: { url: string; media: DetectedMedia } | null = null;

  const look = (): DetectedMedia | null => {
    const url = currentUrl();
    if (seen?.url !== url) seen = null;
    const media = detectMedia(document, url);
    // Only Netflix hides its title again; elsewhere the page's current metadata is the answer.
    if (media && isNetflixWatchPage(url)) seen = { url, media };
    return media ?? seen?.media ?? null;
  };

  const timer = setInterval(() => {
    if (isNetflixWatchPage(currentUrl())) look();
    else seen = null;
  }, watchMs);

  return {
    /** Answers for the page as it is now. On Netflix watch pages it retries briefly, since the title renders late. */
    async detect(): Promise<DetectedMedia | null> {
      const url = currentUrl();
      for (let attempt = 1; ; attempt++) {
        // Navigated while waiting: the answer would describe a page the user has left.
        if (currentUrl() !== url) return null;
        const media = look();
        if (media || attempt >= attempts || !isNetflixWatchPage(url)) return media;
        await sleep(retryMs);
      }
    },
    stop: () => clearInterval(timer),
  };
}
