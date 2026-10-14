import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../providers/types';
import type { SubtitleCue } from '../subtitles/types';
import {
  checkTranslationInput,
  cleanEdit,
  createTranslationService,
  isTranslationRequest,
  toBatches,
  translatedCues,
  translateMissing,
  TRANSLATION_JOB_KEY,
  type TranslationJob,
} from './translationJob';
import type { TranslationProvider } from './types';

/** Deterministic test double: "Hello" → "[si] Hello". Never used outside tests. */
function fakeProvider(overrides: Partial<TranslationProvider> = {}): TranslationProvider & { translate: ReturnType<typeof vi.fn> } {
  return {
    id: 'fake',
    name: 'Fake',
    maxSegments: 3,
    maxChars: 1000,
    isConfigured: async () => true,
    translate: vi.fn(async (texts: string[]) => texts.map((text) => `[si] ${text}`)),
    ...overrides,
  } as TranslationProvider & { translate: ReturnType<typeof vi.fn> };
}

const cue = (index: number, text: string, startTime = index * 2, endTime = startTime + 1.5): SubtitleCue => ({ index, startTime, endTime, text });
const noSleep = vi.fn(async () => undefined);
const signal = () => new AbortController().signal;

describe('toBatches', () => {
  it('respects segment and character limits and keeps order', () => {
    expect(toBatches(['a', 'b', 'c', 'd', 'e'], 2, 100)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
    expect(toBatches(['aaaa', 'bbbb', 'cc'], 10, 8)).toEqual([['aaaa', 'bbbb'], ['cc']]);
    expect(toBatches(['a'.repeat(50), 'b'], 10, 8)).toEqual([['a'.repeat(50)], ['b']]);
  });
});

describe('translateMissing', () => {
  it('maps every translation back to its own cue, in order', async () => {
    const provider = fakeProvider();
    const sources = ['One', 'Two\nlines', 'මම', 'Four', 'Five'];
    const translations: (string | null)[] = sources.map(() => null);
    const onBatch = vi.fn(async () => undefined);

    await translateMissing(sources, translations, provider, signal(), onBatch, noSleep);

    expect(translations).toEqual(['[si] One', '[si] Two\nlines', '[si] මම', '[si] Four', '[si] Five']);
    expect(provider.translate).toHaveBeenCalledTimes(2);
    expect(onBatch).toHaveBeenCalledTimes(2);
  });

  it('sends repeated lines once and fills every cue that uses them', async () => {
    const provider = fakeProvider();
    const translations: (string | null)[] = [null, null, null, null];
    await translateMissing(['What?', 'Yes.', 'What?', 'Yes.'], translations, provider, signal(), async () => undefined, noSleep);
    expect(provider.translate).toHaveBeenCalledOnce();
    expect(provider.translate.mock.calls[0]?.[0]).toEqual(['What?', 'Yes.']);
    expect(translations).toEqual(['[si] What?', '[si] Yes.', '[si] What?', '[si] Yes.']);
  });

  it('only translates missing cues on resume and never overwrites finished ones', async () => {
    const provider = fakeProvider();
    const translations = ['edited by hand', null, null];
    await translateMissing(['A', 'B', 'A'], translations, provider, signal(), async () => undefined, noSleep);
    expect(provider.translate.mock.calls[0]?.[0]).toEqual(['B']);
    expect(translations).toEqual(['edited by hand', '[si] B', 'edited by hand']);
  });

  it('handles a large file in many batches', async () => {
    const provider = fakeProvider({ maxSegments: 128, maxChars: 5000 });
    const sources = Array.from({ length: 1200 }, (_, i) => `Line ${i}`);
    const translations: (string | null)[] = sources.map(() => null);
    await translateMissing(sources, translations, provider, signal(), async () => undefined, noSleep);
    expect(provider.translate).toHaveBeenCalledTimes(10);
    expect(translations[1199]).toBe('[si] Line 1199');
  });

  it('retries transient failures with exponential backoff', async () => {
    const provider = fakeProvider();
    provider.translate
      .mockRejectedValueOnce(new ProviderError('rate-limit', 'slow down'))
      .mockRejectedValueOnce(new ProviderError('unavailable', '503'))
      .mockRejectedValueOnce(new ProviderError('network', 'offline'));
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => undefined);
    const translations: (string | null)[] = [null];
    await translateMissing(['Hi'], translations, provider, signal(), async () => undefined, sleep);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 4000]);
    expect(translations).toEqual(['[si] Hi']);
  });

  it('gives up after four attempts at a persistent rate limit', async () => {
    const provider = fakeProvider({ translate: vi.fn().mockRejectedValue(new ProviderError('rate-limit', 'slow down')) });
    await expect(translateMissing(['Hi'], [null], provider, signal(), async () => undefined, noSleep)).rejects.toMatchObject({ code: 'rate-limit' });
    expect(provider.translate).toHaveBeenCalledTimes(4);
  });

  it.each(['invalid-key', 'quota', 'setup-required', 'invalid-response'] as const)('does not retry %s', async (code) => {
    const provider = fakeProvider({ translate: vi.fn().mockRejectedValue(new ProviderError(code, 'no')) });
    await expect(translateMissing(['Hi'], [null], provider, signal(), async () => undefined, noSleep)).rejects.toMatchObject({ code });
    expect(provider.translate).toHaveBeenCalledOnce();
  });

  it('keeps completed batches when a later batch fails', async () => {
    const provider = fakeProvider({ maxSegments: 1 });
    provider.translate.mockResolvedValueOnce(['[si] A']).mockRejectedValueOnce(new ProviderError('quota', 'quota'));
    const translations: (string | null)[] = [null, null];
    await expect(translateMissing(['A', 'B'], translations, provider, signal(), async () => undefined, noSleep)).rejects.toThrow('quota');
    expect(translations).toEqual(['[si] A', null]);
  });

  it('rejects a reply with the wrong number of lines without applying any of it', async () => {
    const provider = fakeProvider({ translate: vi.fn(async () => ['only one']) });
    const translations: (string | null)[] = [null, null];
    await expect(translateMissing(['A', 'B'], translations, provider, signal(), async () => undefined, noSleep)).rejects.toMatchObject({ code: 'invalid-response' });
    expect(translations).toEqual([null, null]);
  });

  it('ignores a late reply that arrives after cancellation', async () => {
    const controller = new AbortController();
    let resolve: (value: string[]) => void = () => undefined;
    const provider = fakeProvider({ translate: vi.fn(() => new Promise<string[]>((r) => (resolve = r))) });
    const translations: (string | null)[] = [null];
    const running = translateMissing(['Hi'], translations, provider, controller.signal, async () => undefined, noSleep);
    controller.abort();
    resolve(['[si] late']);
    await expect(running).rejects.toMatchObject({ code: 'aborted' });
    expect(translations).toEqual([null]);
  });
});

describe('input checks', () => {
  it('rejects empty, oversized and non-dialogue input', () => {
    expect(checkTranslationInput([])).toMatch(/no subtitles/);
    expect(checkTranslationInput(Array.from({ length: 5001 }, (_, i) => cue(i, 'x')))).toMatch(/limit is 5,000/);
    expect(checkTranslationInput(Array.from({ length: 400 }, (_, i) => cue(i, 'x'.repeat(800))))).toMatch(/characters of text/);
    expect(checkTranslationInput([cue(0, 'x'.repeat(1001))])).toMatch(/longer than 1000/);
    expect(checkTranslationInput([cue(0, 'Hello')])).toBeNull();
  });

  it('cleans edits without interpreting HTML', () => {
    expect(cleanEdit('  පළමු\r\n\r\nදෙවන  ')).toBe('පළමු\nදෙවන');
    expect(cleanEdit('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>');
    expect(cleanEdit('a\u0000b')).toBe('ab');
    // Decomposed and composed forms of the same Sinhala letter end up identical.
    expect(cleanEdit('ේ')).toBe('ේ');
    expect(cleanEdit('   \n ')).toBeNull();
    expect(cleanEdit('x'.repeat(1001))).toBeNull();
  });

  it('validates worker requests', () => {
    expect(isTranslationRequest({ type: 'sublanka:translation', action: 'start', fileName: 'a.srt', cues: [cue(0, 'Hi')] })).toBe(true);
    expect(isTranslationRequest({ type: 'sublanka:translation', action: 'start', fileName: 'a.srt', cues: [{ text: 'Hi' }] })).toBe(false);
    expect(isTranslationRequest({ type: 'sublanka:translation', action: 'edit', index: 1.5, text: 'x' })).toBe(false);
    expect(isTranslationRequest({ type: 'sublanka:translation', action: 'delete-everything' })).toBe(false);
  });
});

describe('translatedCues', () => {
  it('keeps identity, timing and overlaps, and changes only the text', () => {
    const job = { cues: [cue(0, 'A', 1, 5), { ...cue(1, 'B', 2, 3), align: 8 }], translations: ['අ', 'ආ'] } as TranslationJob;
    expect(translatedCues(job)).toEqual([
      { index: 0, startTime: 1, endTime: 5, text: 'අ' },
      { index: 1, startTime: 2, endTime: 3, text: 'ආ', align: 8 },
    ]);
    expect(translatedCues({ ...job, translations: ['අ', null] })).toBeNull();
  });
});

describe('createTranslationService', () => {
  let session: Record<string, unknown>;
  const stored = () => session[TRANSLATION_JOB_KEY] as TranslationJob | undefined;
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(() => {
    session = {};
    vi.stubGlobal('chrome', {
      storage: {
        session: {
          get: vi.fn(async (key: string) => (key in session ? { [key]: structuredClone(session[key]) } : {})),
          set: vi.fn(async (items: Record<string, unknown>) => void Object.assign(session, structuredClone(items))),
          remove: vi.fn(async (key: string) => void (session = Object.fromEntries(Object.entries(session).filter(([k]) => k !== key)))),
        },
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('runs a job to completion and stores the result', async () => {
    const service = createTranslationService(fakeProvider());
    const reply = await service.handle({ action: 'start', fileName: 'film.en.srt', cues: [cue(0, 'Hi'), cue(1, 'Bye')] });
    expect(reply).toMatchObject({ ok: true, job: { status: 'running', fileName: 'film.en.srt' } });
    await flush();
    expect(stored()).toMatchObject({ status: 'done', translations: ['[si] Hi', '[si] Bye'] });
  });

  it('refuses to start a second job while one runs', async () => {
    const provider = fakeProvider({ translate: vi.fn(() => new Promise<string[]>(() => undefined)) });
    const service = createTranslationService(provider);
    await service.handle({ action: 'start', fileName: 'a.srt', cues: [cue(0, 'Hi')] });
    expect(await service.handle({ action: 'start', fileName: 'b.srt', cues: [cue(0, 'Hi')] })).toMatchObject({ ok: false });
    expect(await service.handle({ action: 'resume' })).toMatchObject({ ok: true, job: { fileName: 'a.srt' } });
    expect(provider.translate).toHaveBeenCalledOnce();
  });

  it('cancels, keeps finished batches, and resumes only what is missing', async () => {
    let release: () => void = () => undefined;
    const provider = fakeProvider({ maxSegments: 1 });
    provider.translate.mockResolvedValueOnce(['[si] A']).mockImplementationOnce(() => new Promise((_, reject) => (release = () => reject(new ProviderError('aborted', 'x')))));
    const service = createTranslationService(provider);
    await service.handle({ action: 'start', fileName: 'a.srt', cues: [cue(0, 'A'), cue(1, 'B')] });
    await flush();

    const cancelled = await service.handle({ action: 'cancel' });
    release();
    await flush();
    expect(cancelled).toMatchObject({ ok: true, job: { status: 'cancelled' } });
    expect(stored()).toMatchObject({ status: 'cancelled', translations: ['[si] A', null] });
    expect(stored()?.message).toMatch(/1 of 2 subtitles were translated and are kept/);

    provider.translate.mockImplementation(async (texts: string[]) => texts.map((text) => `[si] ${text}`));
    await service.handle({ action: 'resume' });
    await flush();
    expect(provider.translate).toHaveBeenLastCalledWith(['B'], expect.anything());
    expect(stored()).toMatchObject({ status: 'done', translations: ['[si] A', '[si] B'] });
  });

  it('reports a job left "running" by a stopped worker as interrupted', async () => {
    session[TRANSLATION_JOB_KEY] = { id: 'x', fileName: 'a.srt', provider: 'fake', cues: [cue(0, 'A')], translations: [null], status: 'running', message: null, updatedAt: 0 };
    const reply = await createTranslationService(fakeProvider()).handle({ action: 'get' });
    expect(reply).toMatchObject({ ok: true, job: { status: 'interrupted' } });
    expect(stored()?.status).toBe('interrupted');
  });

  it('records failures with a user-facing message', async () => {
    const service = createTranslationService(fakeProvider({ translate: vi.fn().mockRejectedValue(new ProviderError('invalid-key', 'Google rejected the API key.')) }));
    await service.handle({ action: 'start', fileName: 'a.srt', cues: [cue(0, 'A')] });
    await flush();
    expect(stored()).toMatchObject({ status: 'failed', message: 'Google rejected the API key.' });
  });

  it('edits a cue, validating the text, and keeps timing untouched', async () => {
    const service = createTranslationService(fakeProvider());
    await service.handle({ action: 'start', fileName: 'a.srt', cues: [cue(0, 'A', 1, 2)] });
    await flush();
    expect(await service.handle({ action: 'edit', index: 0, text: '  ' })).toMatchObject({ ok: false });
    expect(await service.handle({ action: 'edit', index: 9, text: 'x' })).toMatchObject({ ok: false });
    await service.handle({ action: 'edit', index: 0, text: 'නිවැරදි කළා' });
    expect(stored()).toMatchObject({ translations: ['නිවැරදි කළා'], cues: [{ startTime: 1, endTime: 2, text: 'A' }] });
  });

  it('rejects oversized input before sending anything', async () => {
    const provider = fakeProvider();
    const reply = await createTranslationService(provider).handle({ action: 'start', fileName: 'a.srt', cues: [cue(0, 'x'.repeat(2000))] });
    expect(reply).toMatchObject({ ok: false });
    expect(provider.translate).not.toHaveBeenCalled();
  });

  it('clears a finished job', async () => {
    const service = createTranslationService(fakeProvider());
    await service.handle({ action: 'start', fileName: 'a.srt', cues: [cue(0, 'A')] });
    await flush();
    expect(await service.handle({ action: 'clear' })).toEqual({ ok: true, job: null });
    expect(stored()).toBeUndefined();
  });
});
