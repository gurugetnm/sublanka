import { Check, Download, FileText, Languages, LoaderCircle, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PlayerState } from '../../shared/messages';
import { readSubtitleFile } from '../../subtitles/subtitleFile';
import { SubtitleParseError, type SubtitleCue } from '../../subtitles/types';
import { googleTranslateProvider } from '../../translation/googleTranslate';
import { downloadText, exportFileName, serializeComparison, serializeCues } from '../../translation/subtitleExport';
import {
  checkTranslationInput,
  countDone,
  TRANSLATION_JOB_KEY,
  translatedCues,
  type TranslationAction,
  type TranslationJob,
} from '../../translation/translationJob';
import { requestTranslation, sendToTab } from '../tabBridge';
import { TranslationPreview } from './TranslationPreview';
import { Card, ErrorBox, FileInput, FilePicker, HELP, PRIMARY_BUTTON, SECONDARY_BUTTON } from './ui';

const provider = googleTranslateProvider;
const CONSENT_KEY = 'translationConsent';

interface SourceFile {
  fileName: string;
  cues: SubtitleCue[];
  warnings: string[];
}

function Progress({ job }: { job: TranslationJob }) {
  const done = countDone(job);
  const total = job.cues.length;
  const percent = Math.floor((done / total) * 100);
  return (
    <div>
      <div
        role="progressbar"
        aria-label="Translation progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800"
      >
        <div className="h-full bg-rose-800 dark:bg-rose-600" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1.5 flex justify-between text-xs text-stone-600 tabular-nums dark:text-stone-300">
        <span>
          {job.status === 'running' ? 'Translating' : 'Translated'} {done.toLocaleString()} / {total.toLocaleString()} subtitles
        </span>
        <span>{percent}% complete</span>
      </p>
    </div>
  );
}

export function TranslatePanel({
  tabId,
  currentTrack,
  configured,
  onOpenSettings,
  onTrackLoaded,
}: {
  tabId: number | null;
  currentTrack: PlayerState['track'];
  /** Null while loading. */
  configured: boolean | null;
  onOpenSettings: () => void;
  onTrackLoaded: (state: PlayerState, warnings: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [job, setJob] = useState<TranslationJob | null>(null);
  const [source, setSource] = useState<SourceFile | null>(null);
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    requestTranslation({ action: 'get' }).then((reply) => reply.ok && setJob(reply.job));
    chrome.storage.local.get(CONSENT_KEY).then((stored) => setConsented(stored[CONSENT_KEY] === true), () => undefined);
    // The worker writes progress after every batch; follow it while the popup is open.
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      const change = changes[TRANSLATION_JOB_KEY];
      if (area === 'session' && change) setJob((change.newValue as TranslationJob | undefined) ?? null);
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  async function act(action: TranslationAction): Promise<string | null> {
    setBusy(true);
    setError(null);
    try {
      const reply = await requestTranslation(action);
      if (!reply.ok) return reply.message;
      setJob(reply.job);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function run(action: TranslationAction) {
    const message = await act(action);
    if (message) setError(message);
  }

  async function chooseFile(file: File) {
    setError(null);
    setNotice(null);
    try {
      const parsed = await readSubtitleFile(file);
      const problem = checkTranslationInput(parsed.cues);
      if (problem) throw new SubtitleParseError(problem);
      setSource({ fileName: file.name, cues: parsed.cues, warnings: parsed.warnings });
    } catch (caught) {
      setSource(null);
      setError(caught instanceof SubtitleParseError ? caught.message : 'The file could not be read.');
    }
  }

  async function start() {
    if (!source) return;
    if (!consented) {
      // The click on "Agree and translate" is the consent; remembered so the notice does not repeat.
      await chrome.storage.local.set({ [CONSENT_KEY]: true }).catch(() => undefined);
      setConsented(true);
    }
    const message = await act({ action: 'start', fileName: source.fileName, cues: source.cues });
    if (message) setError(message);
    else setSource(null);
  }

  async function apply(cues: SubtitleCue[]) {
    if (tabId === null || !job) return;
    setBusy(true);
    setError(null);
    try {
      const state = await sendToTab(tabId, { type: 'sublanka:load-track', fileName: exportFileName(job.fileName, 'srt'), cues, source: 'translated' });
      onTrackLoaded(state, []);
      setNotice('Sinhala subtitles are now playing on this page.');
    } catch {
      setError('Could not reach the page. Reload it and try again.');
    } finally {
      setBusy(false);
    }
  }

  const errorBox = error && <ErrorBox className="mt-2">{error}</ErrorBox>;

  // A job in progress or with results takes over the panel until the user clears it.
  if (job) {
    const cues = translatedCues(job);
    const running = job.status === 'running';
    return (
      <Card title="Translation">
        <div className="flex items-center gap-2.5">
          <FileText className="size-4 shrink-0 text-stone-500 dark:text-stone-400" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={job.fileName}>
              {job.fileName}
            </p>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {job.cues.length.toLocaleString()} subtitles · English → Sinhala · {provider.name}
            </p>
          </div>
        </div>

        <div className="mt-3">
          <Progress job={job} />
          {job.status === 'done' && (
            <p role="status" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
              <Check className="size-3.5" aria-hidden="true" /> Translation complete. Review it below before applying.
            </p>
          )}
          {job.message && <p role="status" className="mt-2 rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">{job.message}</p>}
          {notice && <p role="status" className="mt-2 text-xs text-emerald-800 dark:text-emerald-300">{notice}</p>}
        </div>
        {errorBox}

        {running ? (
          <button type="button" className={`${SECONDARY_BUTTON} mt-3 w-full py-1.5`} disabled={busy} onClick={() => void run({ action: 'cancel' })}>
            Cancel translation
          </button>
        ) : cues ? (
          <>
            <button type="button" className={`${PRIMARY_BUTTON} mt-3`} disabled={busy || tabId === null} onClick={() => void apply(cues)}>
              <Languages className="size-4" aria-hidden="true" />
              Apply Sinhala subtitles
            </button>
            <p className={`mt-1 ${HELP}`}>
              {tabId === null
                ? 'Open a page with a video to apply the subtitles.'
                : currentTrack
                  ? `Replaces the loaded track (${currentTrack.fileName}). Timing offset and appearance stay as they are.`
                  : 'Plays on this page’s video with your timing offset and appearance settings.'}
            </p>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <button type="button" className={SECONDARY_BUTTON} onClick={() => downloadText(exportFileName(job.fileName, 'srt'), serializeCues(cues, 'srt'), 'application/x-subrip')}>
                <Download className="size-3.5" aria-hidden="true" /> SRT
              </button>
              <button type="button" className={SECONDARY_BUTTON} onClick={() => downloadText(exportFileName(job.fileName, 'vtt'), serializeCues(cues, 'vtt'), 'text/vtt')}>
                <Download className="size-3.5" aria-hidden="true" /> VTT
              </button>
              <button
                type="button"
                className={SECONDARY_BUTTON}
                title="English and Sinhala side by side, for checking the translation"
                onClick={() => downloadText(exportFileName(job.fileName, 'review.txt'), serializeComparison(job.cues, job.translations), 'text/plain')}
              >
                <Download className="size-3.5" aria-hidden="true" /> Review
              </button>
            </div>
          </>
        ) : (
          <button type="button" className={`${PRIMARY_BUTTON} mt-3`} disabled={busy || configured === false} onClick={() => void run({ action: 'resume' })}>
            Resume translation
          </button>
        )}

        {!running && (
          <button
            type="button"
            className={`${SECONDARY_BUTTON} mt-2 w-full py-1.5`}
            disabled={busy}
            onClick={() => {
              setNotice(null);
              void run({ action: 'clear' });
            }}
          >
            Translate another file
          </button>
        )}
        {!running && <p className={`mt-1 ${HELP}`}>That discards this translation, including your edits. Download it first to keep it.</p>}

        {(job.status === 'done' || countDone(job) > 0) && !running && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium text-stone-600 dark:text-stone-300">Preview and edit</p>
            <TranslationPreview cues={job.cues} translations={job.translations} onEdit={(index, text) => act({ action: 'edit', index, text })} />
          </div>
        )}
        <p className={`mt-3 ${HELP}`}>
          Machine translation. Names, slang and idioms can come out wrong; check the preview. The job keeps running if you close the popup, and is kept until the browser closes.
        </p>
      </Card>
    );
  }

  const chars = source?.cues.reduce((sum, cue) => sum + cue.text.length, 0) ?? 0;
  return (
    <Card
      title="Translate to Sinhala"
      aside={
        configured !== null && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              configured ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
            }`}
          >
            {configured ? `${provider.name} ready` : 'Setup required'}
          </span>
        )
      }
    >
      {source ? (
        <div className="flex items-center gap-2.5">
          <FileInput inputRef={inputRef} onFile={(file) => void chooseFile(file)} />
          <FileText className="size-4 shrink-0 text-stone-500 dark:text-stone-400" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={source.fileName}>
              {source.fileName}
            </p>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {source.cues.length.toLocaleString()} subtitles · {chars.toLocaleString()} characters
            </p>
          </div>
          <button type="button" className={SECONDARY_BUTTON} onClick={() => inputRef.current?.click()}>
            Change
          </button>
        </div>
      ) : (
        <FilePicker
          title="Choose or drop an English .srt or .vtt file"
          detail="Read on your device. Nothing is sent until you click Translate."
          onFile={(file) => void chooseFile(file)}
        />
      )}

      {source && source.warnings.length > 0 && (
        <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {source.warnings.length} invalid part{source.warnings.length === 1 ? ' was' : 's were'} skipped and will not be translated.
        </p>
      )}

      {configured === false && (
        <button type="button" className={`${SECONDARY_BUTTON} mt-2 w-full py-1.5`} onClick={onOpenSettings}>
          <Settings className="size-3.5" aria-hidden="true" />
          Set up translation in Settings
        </button>
      )}

      <div className="mt-3 rounded-md bg-stone-100 p-2.5 text-[11px] leading-relaxed text-stone-600 dark:bg-stone-800 dark:text-stone-300">
        <p className="font-medium text-stone-700 dark:text-stone-200">{consented ? 'Sent to Google' : 'Before you translate'}</p>
        <p className="mt-0.5">
          The subtitle text (not timings, video, audio or page details) is sent to {provider.name} with your own API key. Google bills
          your Cloud project: the first 500,000 characters each month are free, then about US$20 per million. There is no on-device
          translation in this version.
        </p>
      </div>

      <button type="button" className={`${PRIMARY_BUTTON} mt-3`} disabled={!source || !configured || busy} onClick={() => void start()}>
        {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Languages className="size-4" aria-hidden="true" />}
        {consented ? 'Translate to Sinhala' : 'Agree and translate to Sinhala'}
      </button>
      {errorBox}
    </Card>
  );
}
