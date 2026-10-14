import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerState } from '../shared/messages';
import { connectToActiveTab, sendToTab } from './tabBridge';

const STATE: PlayerState = {
  track: { fileName: 'film.si.srt', cueCount: 120 },
  subtitlesEnabled: true,
  demoVisible: false,
  videos: [{ id: 1, width: 1280, height: 720, playing: true }],
  attachedVideoId: 1,
  hasFrames: false,
};

const chromeMock = {
  tabs: { query: vi.fn(), sendMessage: vi.fn() },
  scripting: { executeScript: vi.fn() },
};

beforeEach(() => {
  vi.stubGlobal('chrome', chromeMock);
  chromeMock.tabs.query.mockResolvedValue([{ id: 7, url: 'https://example.com/watch' }]);
  chromeMock.scripting.executeScript.mockResolvedValue([]);
  chromeMock.tabs.sendMessage.mockResolvedValue(STATE);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('connectToActiveTab', () => {
  it('restores the page state reported by the content script, including a loaded track', async () => {
    await expect(connectToActiveTab()).resolves.toEqual({ kind: 'ready', tabId: 7, state: STATE });
    expect(chromeMock.scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 7 }, files: ['content.js'] });
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(7, { type: 'sublanka:get-state' }, { frameId: 0 });
  });

  it('reports browser pages as unsupported without touching them', async () => {
    chromeMock.tabs.query.mockResolvedValue([{ id: 7, url: 'chrome://extensions/' }]);
    await expect(connectToActiveTab()).resolves.toEqual({ kind: 'unsupported' });
    expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('reports blocked pages as unavailable', async () => {
    chromeMock.scripting.executeScript.mockRejectedValue(new Error('Cannot access contents of the page'));
    await expect(connectToActiveTab()).resolves.toEqual({ kind: 'unavailable' });
  });

  it('reports a tab without a readable URL as unavailable', async () => {
    chromeMock.tabs.query.mockResolvedValue([{ id: 7 }]);
    await expect(connectToActiveTab()).resolves.toEqual({ kind: 'unavailable' });
  });

  it('reports a page whose content script does not answer as unavailable', async () => {
    chromeMock.tabs.sendMessage.mockResolvedValue(undefined);
    await expect(connectToActiveTab()).resolves.toEqual({ kind: 'unavailable' });
  });
});

describe('sendToTab', () => {
  it('injects before every message so it survives page reloads', async () => {
    const message = { type: 'sublanka:set-enabled', enabled: false } as const;
    await expect(sendToTab(7, message)).resolves.toEqual(STATE);
    expect(chromeMock.scripting.executeScript.mock.invocationCallOrder[0]).toBeLessThan(
      chromeMock.tabs.sendMessage.mock.invocationCallOrder[0] ?? 0,
    );
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(7, message, { frameId: 0 });
  });

  it('rejects malformed replies', async () => {
    chromeMock.tabs.sendMessage.mockResolvedValue({ visible: true });
    await expect(sendToTab(7, { type: 'sublanka:get-state' })).rejects.toThrow('did not respond');
  });

  it('propagates messaging failures', async () => {
    chromeMock.tabs.sendMessage.mockRejectedValue(new Error('Receiving end does not exist.'));
    await expect(sendToTab(7, { type: 'sublanka:remove-track' })).rejects.toThrow('Receiving end does not exist.');
  });
});
