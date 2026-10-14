import { isDownloadRequest } from '../shared/messages';
import { downloadAndLoad } from './downloadSubtitle';

// Event-driven only: no timers or polling. Chrome keeps the worker alive while a message response is pending.
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  // Only the extension's own popup may start downloads; content scripts (sender.tab set) may not.
  if (sender.id !== chrome.runtime.id || sender.tab || !isDownloadRequest(message)) return;
  downloadAndLoad(message).then(sendResponse);
  return true;
});
