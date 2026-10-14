import { isSubLankaMessage, type OverlayState } from '../shared/messages';
import { hideSubtitle, isSubtitleVisible, showSubtitle } from './subtitleOverlay';

declare global {
  interface Window {
    __sublankaContentScript?: true;
  }
}

// The popup injects this file before every message; register the listener only once per page.
if (!window.__sublankaContentScript) {
  window.__sublankaContentScript = true;

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (state: OverlayState) => void) => {
    if (!isSubLankaMessage(message)) return;
    if (message.type === 'sublanka:show-subtitle') showSubtitle(message.text);
    else hideSubtitle();
    sendResponse({ visible: isSubtitleVisible() });
  });
}
