import { isSubLankaMessage, type PlayerState } from '../shared/messages';
import { loadSettings, parseSettings, SETTINGS_STORAGE_KEY } from '../shared/settings';
import { PlaybackController } from './playbackController';

declare global {
  interface Window {
    __sublankaContentScript?: true;
  }
}

// The popup injects this file before every message; set up only once per page.
if (!window.__sublankaContentScript) {
  window.__sublankaContentScript = true;
  const controller = new PlaybackController();

  loadSettings().then(
    (settings) => controller.applySettings(settings),
    () => {
      // Storage unavailable: keep the defaults the controller starts with.
    },
  );
  chrome.storage.onChanged.addListener((changes, area) => {
    const change = changes[SETTINGS_STORAGE_KEY];
    if (area === 'local' && change) controller.applySettings(parseSettings(change.newValue));
  });

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (state: PlayerState) => void) => {
    if (!isSubLankaMessage(message)) return;
    sendResponse(controller.handle(message));
  });
}
