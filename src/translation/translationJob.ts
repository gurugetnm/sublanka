import { isRecord, isSubtitleCue } from '../shared/messages';
import { ProviderError } from '../providers/types';
import type { SubtitleCue } from '../subtitles/types';
import type { TranslationProvider } from './types';

/** Keeps a job inside chrome.storage.session's quota and its cost bounded (300K chars ≈ US$6 at Google's list price). */
export const MAX_TRANSLATION_CUES = 5000;
export const MAX_TRANSLATION_CHARS = 300_000;
const MAX_CUE_CHARS = 1000;
const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 1000;

export const TRANSLATION_JOB_KEY = 'translationJob';

export type JobStatus = 'running' | 'cancelled' | 'failed' | 'interrupted' | 'done';

/**
 * One translation at a time, kept in chrome.storage.session (memory only, cleared when the browser closes)
 * so a reopened popup sees it and an interrupted job can resume. Cue timings are never sent anywhere.
 */
export interface TranslationJob {
  id: string;
  fileName: string;
  provider: string;
  /** The English cues exactly as parsed; translations[i] belongs to cues[i]. */
  cues: SubtitleCue[];
  /** null until that cue's batch has completed. */
  translations: (string | null)[];
  status: JobStatus;
  /** Why the job stopped, for the popup. */
  message: string | null;
  updatedAt: number;
}

export type TranslationAction =
  | { action: 'get' }
  | { action: 'start'; fileName: string; cues: SubtitleCue[] }
  | { action: 'resume' }
  | { action: 'cancel' }
  | { action: 'edit'; index: number; text: string }
  | { action: 'clear' };
export type TranslationRequest = { type: 'sublanka:translation' } & TranslationAction;
export type TranslationResponse = { ok: true; job: TranslationJob | null } | { ok: false; message: string };

export function isTranslationRequest(value: unknown): value is TranslationRequest {
  if (!isRecord(value) || value.type !== 'sublanka:translation') return false;
  switch (value.action) {
    case 'get':
    case 'resume':
    case 'cancel':
    case 'clear':
      return true;
    case 'start':
      return typeof value.fileName === 'string' && Array.isArray(value.cues) && value.cues.every(isSubtitleCue);
    case 'edit':
      return Number.isInteger(value.index) && typeof value.text === 'string';
    default:
      return false;
  }
}

export const countDone = (job: TranslationJob) => job.translations.filter((text) => text !== null).length;

/** Checks a file before any text leaves the device. Returns a user-facing problem, or null. */
export function checkTranslationInput(cues: SubtitleCue[]): string | null {
  if (cues.length === 0) return 'The file has no subtitles to translate.';
  if (cues.length > MAX_TRANSLATION_CUES) return `This file has ${cues.length.toLocaleString()} subtitles. The limit is ${MAX_TRANSLATION_CUES.toLocaleString()}.`;
  const chars = cues.reduce((sum, cue) => sum + cue.text.length, 0);
  if (chars > MAX_TRANSLATION_CHARS) return `This file has ${chars.toLocaleString()} characters of text. The limit is ${MAX_TRANSLATION_CHARS.toLocaleString()}.`;
  if (cues.some((cue) => cue.text.length > MAX_CUE_CHARS)) return `A subtitle in this file is longer than ${MAX_CUE_CHARS} characters, so it does not look like dialogue.`;
  return null;
}

/** Cleans a manual edit: Unicode NFC, LF line breaks, no empty lines or control characters. Null when nothing is left. */
export function cleanEdit(text: string): string | null {
  const cleaned = text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
  return cleaned && cleaned.length <= MAX_CUE_CHARS ? cleaned : null;
}

/** Groups texts into requests within the provider's segment and character limits; a single long text still gets its own batch. */
export function toBatches(texts: string[], maxSegments: number, maxChars: number): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let chars = 0;
  for (const text of texts) {
    if (batch.length && (batch.length >= maxSegments || chars + text.length > maxChars)) {
      batches.push(batch);
      batch = [];
      chars = 0;
    }
    batch.push(text);
    chars += text.length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

const RETRYABLE = new Set(['rate-limit', 'unavailable', 'network']);

export const abortableSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new ProviderError('aborted', 'The translation was cancelled.'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });

/**
 * Translates every null slot in `translations` in place, one batch at a time, calling onBatch after each
 * completed batch. Identical lines ("Yes.", "What?") are sent once per job. Transient failures retry with
 * exponential backoff (1 s, 2 s, 4 s); key, quota and validation failures do not.
 */
export async function translateMissing(
  sources: string[],
  translations: (string | null)[],
  provider: TranslationProvider,
  signal: AbortSignal,
  onBatch: () => Promise<void>,
  sleep = abortableSleep,
): Promise<void> {
  // Reuse lines already translated earlier in this job (e.g. before a resume).
  const known = new Map<string, string>();
  sources.forEach((source, i) => {
    const done = translations[i];
    if (done != null) known.set(source, done);
  });
  const pending = new Map<string, number[]>();
  sources.forEach((source, i) => {
    if (translations[i] !== null) return;
    const reuse = known.get(source);
    if (reuse !== undefined) translations[i] = reuse;
    else pending.set(source, [...(pending.get(source) ?? []), i]);
  });
  if (pending.size === 0) return;

  for (const batch of toBatches([...pending.keys()], provider.maxSegments, provider.maxChars)) {
    let result: string[] | null = null;
    for (let attempt = 1; result === null; attempt++) {
      try {
        result = await provider.translate(batch, signal);
      } catch (error) {
        if (signal.aborted) throw new ProviderError('aborted', 'The translation was cancelled.');
        if (!(error instanceof ProviderError) || !RETRYABLE.has(error.code) || attempt >= MAX_ATTEMPTS) throw error;
        await sleep(BASE_DELAY_MS * 2 ** (attempt - 1), signal);
      }
    }
    // A late reply after cancellation must not change the job.
    if (signal.aborted) throw new ProviderError('aborted', 'The translation was cancelled.');
    if (result.length !== batch.length) throw new ProviderError('invalid-response', 'The translation service returned the wrong number of lines, so the batch was not used.');
    batch.forEach((source, i) => {
      for (const index of pending.get(source) ?? []) if (translations[index] === null) translations[index] = result[i] ?? null;
    });
    await onBatch();
  }
}

/** Builds playable cues: original identity and timing, translated text. Null when any cue is still untranslated. */
export function translatedCues(job: TranslationJob): SubtitleCue[] | null {
  if (job.translations.some((text) => text === null)) return null;
  return job.cues.map((cue, i) => ({ ...cue, text: job.translations[i] ?? cue.text }));
}

function describe(error: unknown): string {
  if (error instanceof ProviderError) return error.message;
  return 'The translation stopped because of an unexpected error. Resume to try the remaining subtitles again.';
}

/**
 * Service-worker side. The worker can be stopped by Chrome at any time; a job stored as "running" with no
 * live run in this worker is reported as "interrupted", and Resume picks up the cues that are still missing.
 */
export function createTranslationService(provider: TranslationProvider) {
  let active: { job: TranslationJob; controller: AbortController } | null = null;

  const save = (job: TranslationJob) => chrome.storage.session.set({ [TRANSLATION_JOB_KEY]: { ...job, updatedAt: Date.now() } });

  async function load(): Promise<TranslationJob | null> {
    if (active) return active.job;
    const job = (await chrome.storage.session.get(TRANSLATION_JOB_KEY))[TRANSLATION_JOB_KEY] as TranslationJob | undefined;
    if (!job) return null;
    if (job.status === 'running') {
      Object.assign(job, { status: 'interrupted', message: 'The translation was interrupted (the browser stopped the background worker). Resume to continue.' });
      await save(job);
    }
    return job;
  }

  /** Not awaited by the message handler: it keeps running after the reply, writing progress after every batch. */
  async function run(job: TranslationJob) {
    const controller = new AbortController();
    active = { job, controller };
    Object.assign(job, { status: 'running', message: null });
    try {
      await save(job);
      const sources = job.cues.map((cue) => cue.text);
      await translateMissing(sources, job.translations, provider, controller.signal, () => save(job));
      job.status = 'done';
    } catch (error) {
      if (controller.signal.aborted) return; // cancel() already saved the job
      Object.assign(job, { status: 'failed', message: describe(error) });
    } finally {
      if (active?.controller === controller) {
        active = null;
        await save(job).catch(() => undefined);
      }
    }
  }

  async function handle(request: TranslationAction): Promise<TranslationResponse> {
    const job = await load();
    switch (request.action) {
      case 'get':
        return { ok: true, job };
      case 'start': {
        if (active) return { ok: false, message: 'A translation is already running. Cancel it before starting another.' };
        const problem = checkTranslationInput(request.cues);
        if (problem) return { ok: false, message: problem };
        const next: TranslationJob = {
          id: crypto.randomUUID(),
          fileName: request.fileName,
          provider: provider.id,
          cues: request.cues,
          translations: request.cues.map(() => null),
          status: 'running',
          message: null,
          updatedAt: Date.now(),
        };
        void run(next);
        return { ok: true, job: next };
      }
      case 'resume':
        if (active) return { ok: true, job: active.job };
        if (!job || job.status === 'done') return { ok: false, message: 'There is no unfinished translation to resume.' };
        void run(job);
        return { ok: true, job };
      case 'cancel': {
        if (!active) return { ok: true, job };
        const { job: running, controller } = active;
        active = null;
        const done = countDone(running);
        Object.assign(running, {
          status: 'cancelled',
          message: done ? `Cancelled. ${done} of ${running.cues.length} subtitles were translated and are kept; resume to finish.` : 'Cancelled before any subtitles were translated.',
        });
        controller.abort();
        await save(running);
        return { ok: true, job: running };
      }
      case 'edit': {
        if (!job || active) return { ok: false, message: 'Edits are possible once the translation has stopped.' };
        const text = cleanEdit(request.text);
        if (text === null) return { ok: false, message: `A subtitle needs some text, up to ${MAX_CUE_CHARS} characters.` };
        if (job.translations[request.index] === undefined) return { ok: false, message: 'That subtitle no longer exists.' };
        job.translations[request.index] = text;
        await save(job);
        return { ok: true, job };
      }
      case 'clear':
        if (active) return { ok: false, message: 'Cancel the running translation first.' };
        await chrome.storage.session.remove(TRANSLATION_JOB_KEY);
        return { ok: true, job: null };
    }
  }

  return { handle };
}
