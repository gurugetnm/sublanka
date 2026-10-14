import { isDownloadRequest } from '../shared/messages';
import { googleTranslateProvider } from '../translation/googleTranslate';
import { createTranslationService, isTranslationRequest } from '../translation/translationJob';
import { downloadAndLoad } from './downloadSubtitle';

const translation = createTranslationService(googleTranslateProvider);

// Event-driven only: no timers or polling. Chrome keeps the worker alive while a message response is pending,
// and a running translation keeps it alive with a storage write after every batch.
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  // Only the extension's own popup may start work; content scripts (sender.tab set) may not.
  if (sender.id !== chrome.runtime.id || sender.tab) return;
  if (isDownloadRequest(message)) {
    downloadAndLoad(message).then(sendResponse);
    return true;
  }
  if (isTranslationRequest(message)) {
    translation.handle(message).then(sendResponse, () => sendResponse({ ok: false, message: 'SubLanka could not save the translation. Try again.' }));
    return true;
  }
});
