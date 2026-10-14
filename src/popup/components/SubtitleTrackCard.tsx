import { FileText, LoaderCircle, Search, Upload } from 'lucide-react';
import { useRef } from 'react';
import type { PlayerState, SubtitleSource } from '../../shared/messages';

const SOURCE_LABELS: Record<SubtitleSource, string> = { local: 'Local upload', opensubtitles: 'OpenSubtitles' };
import { Card, SECONDARY_BUTTON, Switch } from './ui';

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
      <input
        ref={inputRef}
        type="file"
        accept=".srt,.vtt"
        className="hidden"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = ''; // allow choosing the same file again
          if (file) onFile(file);
        }}
      />

      {state && track ? (
        <>
          <div className="flex items-center gap-2.5">
            <FileText className="size-4 shrink-0 text-stone-400" aria-hidden="true" />
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
              <button type="button" className={SECONDARY_BUTTON} disabled={disabled} onClick={onRemove}>
                Remove
              </button>
            </div>
          </div>
        </>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-stone-300 px-3 py-4 text-sm hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700 dark:hover:bg-stone-800"
        >
          {busy ? (
            <LoaderCircle className="size-5 animate-spin text-stone-400" aria-hidden="true" />
          ) : (
            <Upload className="size-5 text-stone-400" aria-hidden="true" />
          )}
          <span className="font-medium">{busy ? 'Loading subtitles…' : 'Choose .srt or .vtt file'}</span>
          <span className="text-xs text-stone-500 dark:text-stone-400">UTF-8 text, up to 5 MB</span>
        </button>
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

      <p className="mt-2 text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
        Local files are read on your device and never uploaded. Reloading the page clears the loaded subtitles.
      </p>
    </Card>
  );
}
