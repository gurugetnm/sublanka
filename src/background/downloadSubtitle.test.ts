import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerState } from '../shared/messages';
import { ProviderError, type DownloadedFile } from '../providers/types';
import { downloadAndLoad } from './downloadSubtitle';

const { download } = vi.hoisted(() => ({ download: vi.fn<(id: string, signal: AbortSignal) => Promise<DownloadedFile>>() }));
vi.mock('../providers', () => ({ PROVIDERS: { opensubtitles: { id: 'opensubtitles', name: 'OpenSubtitles', search: vi.fn(), download } } }));

const SRT = '1\n00:00:01,000 --> 00:00:02,500\nආයුබෝවන්\n\n2\n00:00:03,000 --> 00:00:04,000\n<i>ස්තූතියි</i>\n';
const VTT = 'WEBVTT\n\n00:01.000 --> 00:02.000\nපළමු පේළිය\n';
const STATE: PlayerState = {
  track: { fileName: 'Film.srt', cueCount: 2, source: 'opensubtitles' },
  subtitlesEnabled: true,
  demoVisible: false,
  videos: [],
  attachedVideoId: null,
  hasFrames: false,
};
const REQUEST = { type: 'sublanka:download-subtitle', tabId: 4, provider: 'opensubtitles', downloadId: '7000001', label: 'Film' } as const;

const file = (text: string, fileName = 'Film.srt', remaining: number | null = 4): DownloadedFile => ({
  fileName,
  bytes: new TextEncoder().encode(text).buffer,
  remaining,
});

const chromeMock = {
  tabs: { get: vi.fn(), sendMessage: vi.fn() },
  scripting: { executeScript: vi.fn() },
  storage: { session: { set: vi.fn() } },
};
const lastStatus = () => chromeMock.storage.session.set.mock.calls.at(-1)?.[0].downloadStatus;

beforeEach(() => {
  vi.stubGlobal('chrome', chromeMock);
  chromeMock.tabs.get.mockResolvedValue({ id: 4, url: 'https://video.example/watch/1' });
  chromeMock.scripting.executeScript.mockResolvedValue([]);
  chromeMock.tabs.sendMessage.mockResolvedValue(STATE);
  chromeMock.storage.session.set.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('downloadAndLoad', () => {
  it('parses a downloaded SRT with the shared parser and loads it as an OpenSubtitles track', async () => {
    download.mockResolvedValue(file(SRT));
    const response = await downloadAndLoad(REQUEST);

    expect(response).toEqual({ ok: true, state: STATE, warnings: [], remaining: 4 });
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      4,
      {
        type: 'sublanka:load-track',
        fileName: 'Film.srt',
        source: 'opensubtitles',
        cues: [
          { index: 0, startTime: 1, endTime: 2.5, text: 'ආයුබෝවන්' },
          { index: 1, startTime: 3, endTime: 4, text: 'ස්තූතියි' },
        ],
      },
      { frameId: 0 },
    );
    expect(lastStatus()).toMatchObject({ phase: 'loaded', message: 'Loaded Film.srt from OpenSubtitles. 4 downloads left today.' });
  });

  it('loads WebVTT the same way', async () => {
    download.mockResolvedValue(file(VTT, 'Film.vtt', null));
    await expect(downloadAndLoad(REQUEST)).resolves.toMatchObject({ ok: true, remaining: null });
    expect(chromeMock.tabs.sendMessage.mock.calls[0]?.[1]).toMatchObject({ fileName: 'Film.vtt', cues: [{ text: 'පළමු පේළිය' }] });
    expect(lastStatus().message).toBe('Loaded Film.vtt from OpenSubtitles.');
  });

  it('records progress before downloading, for a popup that reopens', async () => {
    download.mockImplementation(async () => {
      expect(lastStatus()).toMatchObject({ tabId: 4, downloadId: '7000001', phase: 'loading', message: 'Downloading Film…' });
      return file(SRT);
    });
    await downloadAndLoad(REQUEST);
    expect(download).toHaveBeenCalled();
  });

  it('reports malformed and non-UTF-8 files without touching the page', async () => {
    download.mockResolvedValue(file('not a subtitle'));
    const malformed = await downloadAndLoad(REQUEST);
    expect(malformed).toEqual({ ok: false, message: expect.stringMatching(/^The selected subtitle file could not be loaded\./) });

    download.mockResolvedValue({ fileName: 'Film.srt', bytes: new Uint8Array([0xff, 0xfe, 0x00]).buffer, remaining: 1 });
    expect(await downloadAndLoad(REQUEST)).toEqual({ ok: false, message: expect.stringMatching(/not UTF-8/) });
    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalled();
    expect(lastStatus().phase).toBe('failed');
  });

  it('passes provider errors such as an exhausted quota through to the user', async () => {
    download.mockRejectedValue(new ProviderError('quota', 'Download limit reached. Please try again later.'));
    await expect(downloadAndLoad(REQUEST)).resolves.toEqual({ ok: false, message: 'Download limit reached. Please try again later.' });
  });

  it('does not load into a page the user navigated away from during the download', async () => {
    download.mockResolvedValue(file(SRT));
    chromeMock.tabs.get.mockResolvedValueOnce({ url: 'https://video.example/watch/1' }).mockResolvedValueOnce({ url: 'https://video.example/watch/2' });
    const response = await downloadAndLoad(REQUEST);
    expect(response).toEqual({ ok: false, message: expect.stringMatching(/page changed/) });
    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('reports a closed tab', async () => {
    chromeMock.tabs.get.mockRejectedValue(new Error('No tab with id: 4'));
    await expect(downloadAndLoad(REQUEST)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/page changed/) });
    expect(download).not.toHaveBeenCalled();
  });

  it('rejects unknown providers', async () => {
    await expect(downloadAndLoad({ ...REQUEST, provider: 'elsewhere' })).resolves.toMatchObject({ ok: false });
    expect(download).not.toHaveBeenCalled();
  });
});

describe('background message listener', () => {
  it('accepts download requests only from the extension itself, not from content scripts', async () => {
    const addListener = vi.fn();
    vi.stubGlobal('chrome', { ...chromeMock, runtime: { id: 'ext', onMessage: { addListener } } });
    await import('./index');
    const listener = addListener.mock.calls[0]?.[0];
    const sendResponse = vi.fn();
    download.mockResolvedValue(file(SRT));

    expect(listener(REQUEST, { id: 'ext', tab: { id: 4 } }, sendResponse)).toBeUndefined();
    expect(listener(REQUEST, { id: 'other' }, sendResponse)).toBeUndefined();
    expect(listener({ type: 'sublanka:download-subtitle' }, { id: 'ext' }, sendResponse)).toBeUndefined();
    expect(listener(REQUEST, { id: 'ext' }, sendResponse)).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ ok: true })));
  });
});
