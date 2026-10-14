import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerState } from '../../shared/messages';
import { parseSrt } from '../../subtitles/srtParser';
import { parseVtt } from '../../subtitles/vttParser';
import type { TranslationJob, TranslationResponse } from '../../translation/translationJob';
import { TranslatePanel } from './TranslatePanel';

const mocks = vi.hoisted(() => ({
  requestTranslation: vi.fn<(action: unknown) => Promise<TranslationResponse>>(),
  sendToTab: vi.fn(),
}));
vi.mock('../tabBridge', () => mocks);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SRT = '1\n00:01:12,500 --> 00:01:15,200\nI never thought I\'d see you again.\n\n2\n00:01:14,000 --> 00:01:18,000\nWhere are you going?\nWait!\n';
const STATE: PlayerState = { track: null, subtitlesEnabled: true, demoVisible: false, videos: [], attachedVideoId: 1, hasFrames: false };
const CUES = [
  { index: 0, startTime: 72.5, endTime: 75.2, text: "I never thought I'd see you again." },
  { index: 1, startTime: 74, endTime: 78, text: 'Where are you going?\nWait!' },
];
const job = (patch: Partial<TranslationJob> = {}): TranslationJob => ({
  id: 'job-1',
  fileName: 'film.en.srt',
  provider: 'google-cloud-translation',
  cues: CUES,
  translations: ['මම කවදාවත් හිතුවේ නෑ ඔයාව ආයෙත් දකින්න ලැබෙයි කියලා.', 'ඔයා කොහෙද යන්නේ?\nඉන්න!'],
  status: 'done',
  message: null,
  updatedAt: 0,
  ...patch,
});

let local: Record<string, unknown>;
const listeners: ((changes: Record<string, { newValue?: unknown }>, area: string) => void)[] = [];
let container: HTMLDivElement;
let root: Root;
const props = { onOpenSettings: vi.fn(), onTrackLoaded: vi.fn() };

beforeEach(() => {
  local = {};
  listeners.length = 0;
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: local[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => void Object.assign(local, items)),
      },
      onChanged: { addListener: (listener: (typeof listeners)[number]) => listeners.push(listener), removeListener: vi.fn() },
    },
  });
  mocks.requestTranslation.mockResolvedValue({ ok: true, job: null });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

async function render(overrides: Partial<Parameters<typeof TranslatePanel>[0]> = {}) {
  await act(async () => {
    root.render(<TranslatePanel tabId={7} currentTrack={null} configured={true} {...props} {...overrides} />);
  });
}
const button = (name: string | RegExp) =>
  [...container.querySelectorAll('button')].find((element) => (typeof name === 'string' ? element.textContent?.trim() === name : name.test(element.textContent ?? '')));
const click = (name: string | RegExp) => act(async () => button(name)?.click());
async function upload(text: string, name = 'film.en.srt') {
  const input = container.querySelector<HTMLInputElement>('input[type=file]');
  if (!input) throw new Error('no file input');
  Object.defineProperty(input, 'files', { value: [new File([text], name)], configurable: true });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}

describe('TranslatePanel', () => {
  it('shows setup is required and keeps Translate disabled without a key', async () => {
    await render({ configured: false });
    expect(container.textContent).toContain('Setup required');
    expect(button(/translate to Sinhala/)?.disabled).toBe(true);
    await click('Set up translation in Settings');
    expect(props.onOpenSettings).toHaveBeenCalled();
  });

  it('reads an uploaded English file locally and sends nothing until the user agrees', async () => {
    await render();
    await upload(SRT);
    expect(container.textContent).toContain('2 subtitles');
    expect(container.textContent).toContain('sent to Google Cloud Translation');
    expect(mocks.requestTranslation).toHaveBeenCalledTimes(1); // only the initial "get"

    mocks.requestTranslation.mockResolvedValue({ ok: true, job: job({ status: 'running', translations: [null, null] }) });
    await click('Agree and translate to Sinhala');
    expect(mocks.requestTranslation).toHaveBeenLastCalledWith({ action: 'start', fileName: 'film.en.srt', cues: CUES });
    expect(local.translationConsent).toBe(true);
    expect(container.textContent).toContain('Translating 0 / 2 subtitles');
  });

  it('rejects unsupported files with an explanation', async () => {
    await render();
    await upload('hello', 'notes.txt');
    expect(container.querySelector('[role=alert]')?.textContent).toMatch(/Unsupported file type/);
    expect(button(/translate to Sinhala/)?.disabled).toBe(true);
  });

  it('shows real progress from the worker and cancels', async () => {
    mocks.requestTranslation.mockResolvedValue({ ok: true, job: job({ status: 'running', translations: [null, null] }) });
    await render();
    expect(container.textContent).toContain('0% complete');

    await act(async () => listeners.forEach((listener) => listener({ translationJob: { newValue: job({ status: 'running', translations: ['අ', null] }) } }, 'session')));
    expect(container.textContent).toContain('Translating 1 / 2 subtitles');
    expect(container.textContent).toContain('50% complete');
    expect(container.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('1');

    mocks.requestTranslation.mockResolvedValue({ ok: true, job: job({ status: 'cancelled', translations: ['අ', null], message: 'Cancelled. 1 of 2 subtitles were translated and are kept; resume to finish.' }) });
    await click('Cancel translation');
    expect(mocks.requestTranslation).toHaveBeenLastCalledWith({ action: 'cancel' });
    expect(container.textContent).toContain('1 of 2 subtitles were translated and are kept');
    expect(button('Resume translation')).toBeDefined();
    expect(button('Apply Sinhala subtitles')).toBeUndefined();
  });

  it('offers Resume for an interrupted job', async () => {
    mocks.requestTranslation.mockResolvedValue({ ok: true, job: job({ status: 'interrupted', translations: ['අ', null], message: 'The translation was interrupted.' }) });
    await render();
    await click('Resume translation');
    expect(mocks.requestTranslation).toHaveBeenLastCalledWith({ action: 'resume' });
  });

  it('previews English beside Sinhala and saves a manual edit as plain text', async () => {
    mocks.requestTranslation.mockResolvedValue({ ok: true, job: job() });
    await render();
    expect(container.textContent).toContain('Translation complete');
    expect(container.textContent).toContain("I never thought I'd see you again.");
    expect(container.textContent).toContain('00:01:12.500 → 00:01:15.200');

    await click('Edit');
    const textarea = container.querySelector('textarea');
    if (!textarea) throw new Error('no editor');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(textarea, '<b>නව</b>');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    mocks.requestTranslation.mockResolvedValue({ ok: true, job: job({ translations: ['<b>නව</b>', 'ඔයා කොහෙද යන්නේ?\nඉන්න!'] }) });
    await click('Save');
    expect(mocks.requestTranslation).toHaveBeenLastCalledWith({ action: 'edit', index: 0, text: '<b>නව</b>' });
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<b>නව</b>');
  });

  it('applies the translation through the existing load-track message with the original timings', async () => {
    mocks.requestTranslation.mockResolvedValue({ ok: true, job: job() });
    mocks.sendToTab.mockResolvedValue(STATE);
    await render({ currentTrack: { fileName: 'old.srt', cueCount: 3, source: 'local' } });
    expect(container.textContent).toContain('Replaces the loaded track (old.srt)');

    await click('Apply Sinhala subtitles');
    expect(mocks.sendToTab).toHaveBeenCalledWith(7, {
      type: 'sublanka:load-track',
      fileName: 'film.si.srt',
      source: 'translated',
      cues: [
        { ...CUES[0], text: 'මම කවදාවත් හිතුවේ නෑ ඔයාව ආයෙත් දකින්න ලැබෙයි කියලා.' },
        { ...CUES[1], text: 'ඔයා කොහෙද යන්නේ?\nඉන්න!' },
      ],
    });
    expect(props.onTrackLoaded).toHaveBeenCalledWith(STATE, []);
  });

  it.each([
    ['SRT', 'film.si.srt'],
    ['VTT', 'film.si.vtt'],
  ])('exports %s that the existing parser reads back', async (label, fileName) => {
    mocks.requestTranslation.mockResolvedValue({ ok: true, job: job() });
    let blob: Blob | null = null;
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn((value: Blob) => ((blob = value), 'blob:x')), revokeObjectURL: vi.fn() }));
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe(fileName);
    });
    await render();
    await click(label);
    expect(clickSpy).toHaveBeenCalled();
    const text = await (blob as Blob | null)?.text();
    expect((label === 'SRT' ? parseSrt : parseVtt)(text ?? '').cues.map((cue) => [cue.startTime, cue.endTime, cue.text])).toEqual([
      [72.5, 75.2, 'මම කවදාවත් හිතුවේ නෑ ඔයාව ආයෙත් දකින්න ලැබෙයි කියලා.'],
      [74, 78, 'ඔයා කොහෙද යන්නේ?\nඉන්න!'],
    ]);
    clickSpy.mockRestore();
  });

  it('shows worker errors', async () => {
    await render();
    await upload(SRT);
    mocks.requestTranslation.mockResolvedValue({ ok: false, message: 'A translation is already running. Cancel it before starting another.' });
    await click(/translate to Sinhala/);
    expect(container.querySelector('[role=alert]')?.textContent).toContain('already running');
  });
});
