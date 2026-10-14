import { FileText, Search } from 'lucide-react';
import { useRef } from 'react';
import type { PlayerState, SubtitleSource } from '../../shared/messages';
import { Card, FileInput, FilePicker, HELP, SECONDARY_BUTTON, Switch } from './ui';

const SOURCE_LABELS: Record<SubtitleSource, string> = { local: 'Local upload', opensubtitles: 'OpenSubtitles', translated: 'Machine translated' };

function trackStatus(state: PlayerState): { label: string; className: string } {
  if (!state.subtitlesEnabled) return { label: 'Off', className: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300' };
  if (state.attachedVideoId === null) {
    return { label: 'Waiting for video', className: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300' };
  }
  return { label: 'Active', className: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' };
}

export function SubtitleTrackCard({
  state,
  disabled,
  busy,
  warnings,
  onFile,
  onRemove,
  onSetEnabled,
  onSearch,
}: {
  state: PlayerState | null;
  disabled: boolean;
  busy: boolean;
  warnings: string[];
  onFile: (file: File) => void;
  onRemove: () => void;
  onSetEnabled: (enabled: boolean) => void;
  onSearch: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const track = state?.track ?? null;
  const status = state && track ? trackStatus(state) : null;

  return (
    <Card
      title="Subtitles"
      aside={status && <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}>{status.label}</span>}
    >
      {state && track ? (
        <>
          <FileInput inputRef={inputRef} onFile={onFile} />
          <div className="flex items-center gap-2.5">
            <FileText className="size-4 shrink-0 text-stone-500 dark:text-stone-400" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={track.fileName}>
                {track.fileName}
              </p>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {track.cueCount.toLocaleString()} cues · {SOURCE_LABELS[track.source]}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Switch checked={state.subtitlesEnabled} label="Show subtitles" disabled={disabled} onChange={onSetEnabled} />
            <div className="ml-auto flex gap-1.5">
              <button
                type="button"
                className={SECONDARY_BUTTON}
                disabled={disabled}
                onClick={() => inputRef.current?.click()}
                title="Replace with a file from this device"
              >
                Replace
              </button>
              <button type="button" className={SECONDARY_BUTTON} disabled={disabled} onClick={onRemove} aria-label={`Remove ${track.fileName}`}>
                Remove
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <FilePicker
            title={busy ? 'Loading subtitles…' : 'Choose or drop a .srt or .vtt file'}
            detail="UTF-8 text, up to 5 MB"
            busy={busy}
            disabled={disabled}
            onFile={onFile}
          />
          {!state && <p className={`mt-1.5 ${HELP}`}>Open a page with a video to load subtitles.</p>}
        </>
      )}

      {!(state && track) && (
        <button type="button" className={`${SECONDARY_BUTTON} mt-2 w-full py-1.5`} onClick={onSearch}>
          <Search className="size-3.5" aria-hidden="true" />
          Search Sinhala subtitles online
        </button>
      )}

      {warnings.length > 0 && (
        <div className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">
            {warnings.length === 1 ? '1 part of the file was' : `${warnings.length} parts of the file were`} skipped:
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {warnings.slice(0, 3).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          {warnings.length > 3 && <p className="mt-1">…and {warnings.length - 3} more.</p>}
        </div>
      )}

      <p className={`mt-2 ${HELP}`}>
        Local files are read on your device and never uploaded. Reloading the page clears the loaded subtitles.
      </p>
    </Card>
  );
}
