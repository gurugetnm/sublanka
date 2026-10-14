import { useState } from 'react';
import type { SubtitleCue } from '../../subtitles/types';
import { formatTimestamp } from '../../translation/subtitleExport';
import { INPUT, SECONDARY_BUTTON } from './ui';

/** Small pages instead of an inner scroll box, so the popup has a single scroll area. */
const PAGE_SIZE = 10;

/** English beside Sinhala, 10 cues per page, with a one-cue-at-a-time editor. Text is rendered by React as plain text. */
export function TranslationPreview({
  cues,
  translations,
  onEdit,
}: {
  cues: SubtitleCue[];
  translations: (string | null)[];
  /** Resolves to an error message, or null when saved. */
  onEdit: (index: number, text: string) => Promise<string | null>;
}) {
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<{ index: number; text: string; error: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const pages = Math.max(1, Math.ceil(cues.length / PAGE_SIZE));
  const start = page * PAGE_SIZE;

  async function save() {
    if (!editing || saving) return;
    setSaving(true);
    const error = await onEdit(editing.index, editing.text).finally(() => setSaving(false));
    setEditing(error ? { ...editing, error } : null);
  }

  return (
    <div>
      <ol className="divide-y divide-stone-200 rounded-lg border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
        {cues.slice(start, start + PAGE_SIZE).map((cue, offset) => {
          const index = start + offset;
          const isEditing = editing?.index === index;
          return (
            <li key={index} className="px-2.5 py-2 text-xs">
              <div className="flex items-center justify-between gap-2 text-[11px] text-stone-500 tabular-nums dark:text-stone-400">
                <span>
                  #{index + 1} · {formatTimestamp(cue.startTime, '.')} → {formatTimestamp(cue.endTime, '.')}
                </span>
                {!isEditing && (
                  <button
                    type="button"
                    className="rounded px-1 text-rose-800 hover:underline focus-visible:outline-2 focus-visible:outline-rose-700 dark:text-rose-300 dark:focus-visible:outline-rose-400"
                    aria-label={`Edit subtitle ${index + 1}`}
                    onClick={() => setEditing({ index, text: translations[index] ?? '', error: null })}
                  >
                    Edit
                  </button>
                )}
              </div>
              <p lang="en" className="mt-1 whitespace-pre-line text-stone-600 dark:text-stone-300">
                {cue.text}
              </p>
              {isEditing ? (
                <div className="mt-1.5">
                  <textarea
                    lang="si"
                    aria-label={`Sinhala text for subtitle ${index + 1}`}
                    rows={Math.max(2, editing.text.split('\n').length)}
                    // Opened by the user's click on Edit, so moving focus here is expected.
                    autoFocus
                    aria-invalid={editing.error !== null}
                    className={INPUT}
                    value={editing.text}
                    onChange={(event) => setEditing({ ...editing, text: event.target.value, error: null })}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        setEditing(null);
                      } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault();
                        void save();
                      }
                    }}
                  />
                  {editing.error && (
                    <p role="alert" className="text-[11px] text-red-700 dark:text-red-300">
                      {editing.error}
                    </p>
                  )}
                  <div className="mt-1 flex gap-1.5">
                    <button type="button" className={SECONDARY_BUTTON} disabled={saving} onClick={() => void save()}>
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" className={SECONDARY_BUTTON} onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                    <span className="ml-auto self-center text-[11px] text-stone-500 dark:text-stone-400">Ctrl or ⌘+Enter saves · Esc cancels</span>
                  </div>
                </div>
              ) : (
                <p lang="si" className="mt-0.5 text-sm whitespace-pre-line">
                  {translations[index] ?? <span className="text-stone-500 italic dark:text-stone-400">Not translated yet</span>}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {pages > 1 && (
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400">
          <button type="button" className={SECONDARY_BUTTON} disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page of subtitles">
            Previous
          </button>
          <span>
            Page {page + 1} of {pages}
          </span>
          <button type="button" className={SECONDARY_BUTTON} disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page of subtitles">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
