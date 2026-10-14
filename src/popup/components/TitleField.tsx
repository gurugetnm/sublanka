import { CircleCheck, Film, LoaderCircle, Tv, X } from 'lucide-react';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { searchTitles, type TitleSuggestion } from '../../metadata/titleSearch';
import type { MediaKind } from '../../providers/types';
import { ProviderError } from '../../providers/types';

export const MIN_QUERY_CHARS = 2;
export const DEBOUNCE_MS = 300;

const INPUT =
  'w-full rounded-md border border-stone-300 bg-white py-1.5 pr-8 pl-2 text-sm placeholder:text-stone-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rose-700 dark:border-stone-700 dark:bg-stone-950';
const LABEL = 'mb-1 block text-xs font-medium text-stone-600 dark:text-stone-300';
const NOTE = 'px-3 py-2.5 text-xs text-stone-500 dark:text-stone-400';

const kindLabel = (kind: MediaKind) => (kind === 'movie' ? 'Movie' : 'TV series');
/** Each source's attribution; TVmaze's CC BY-SA licence requires it. */
const SOURCES = {
  movie: { name: 'Wikidata', url: 'https://www.wikidata.org/', licence: 'CC0' },
  episode: { name: 'TVmaze', url: 'https://www.tvmaze.com/', licence: 'CC BY-SA' },
} as const;

/** The answer for one kind + text; a render only uses the answer for what is typed now, so a late, stale answer is ignored. */
type Lookup = { key: string; suggestions: TitleSuggestion[] } | { key: string; error: string };

/**
 * Title input with suggestions from free public sources (ARIA 1.2 combobox with a listbox popup). Suggestions only fill the form;
 * the user still clicks Search. Typing never depends on the suggestion source, so a manual search always works.
 * Remount it (key) when the media type changes, so suggestions for the other type are never shown.
 */
export function TitleField({
  kind,
  value,
  selected,
  onType,
  onSelect,
  onClear,
}: {
  kind: MediaKind;
  value: string;
  selected: TitleSuggestion | null;
  onType: (title: string) => void;
  onSelect: (suggestion: TitleSuggestion) => void;
  onClear: () => void;
}) {
  /** What the user last typed; null until they type, so restored or detected titles do not open suggestions. */
  const [typed, setTyped] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [lookup, setLookup] = useState<Lookup | null>(null);

  const text = typed?.trim() ?? '';
  const key = `${kind}:${text}`;
  const searchable = selected === null && text.length >= MIN_QUERY_CHARS;

  // Debounced lookup; a newer keystroke clears the timer and aborts the request in flight.
  useEffect(() => {
    if (!searchable) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchTitles(kind, text, controller.signal).then(
        (suggestions) => {
          if (!controller.signal.aborted) setLookup({ key, suggestions });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setLookup({ key, error: error instanceof ProviderError ? error.message : 'Title suggestions are unavailable.' });
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchable, kind, text, key]);

  const current = lookup?.key === key ? lookup : null;
  const suggestions = current && 'suggestions' in current ? current.suggestions : [];
  const expanded = open && searchable;
  const listId = 'search-title-suggestions';
  const optionId = (index: number) => `${listId}-${index}`;

  function choose(suggestion: TitleSuggestion) {
    onSelect(suggestion);
    setTyped(null);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!searchable) return;
      event.preventDefault();
      setOpen(true);
      if (suggestions.length === 0) return;
      const count = suggestions.length;
      setActive((index) => (event.key === 'ArrowDown' ? (index + 1) % count : index <= 0 ? count - 1 : index - 1));
    } else if (event.key === 'Enter' && expanded && suggestions[active]) {
      event.preventDefault(); // pick the suggestion instead of submitting the search
      choose(suggestions[active]);
    } else if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div>
      <label htmlFor="search-title" className={LABEL}>
        {kind === 'movie' ? 'Movie title' : 'Series title'}
      </label>
      <div className="relative">
        <input
          id="search-title"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
          // The browser's own autofill list would cover ours.
          autoComplete="off"
          spellCheck={false}
          className={INPUT}
          value={value}
          maxLength={200}
          placeholder={kind === 'movie' ? 'e.g. Interstellar' : 'e.g. Stranger Things'}
          onChange={(event) => {
            setTyped(event.target.value);
            setOpen(true);
            setActive(-1);
            onType(event.target.value);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
        />
        {value !== '' && (
          <button
            type="button"
            aria-label="Clear title"
            className="absolute inset-y-0 right-0 flex w-8 items-center justify-center rounded-md text-stone-400 hover:text-stone-700 focus-visible:outline-2 focus-visible:outline-rose-700 dark:hover:text-stone-200"
            onClick={() => {
              setTyped(null);
              setOpen(false);
              onClear();
              document.getElementById('search-title')?.focus();
            }}
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        )}

        <div
          hidden={!expanded}
          className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-lg dark:border-stone-700 dark:bg-stone-900"
          // Keeps focus in the input, so a click on an option is not lost to blur.
          onMouseDown={(event) => event.preventDefault()}
        >
          <ul id={listId} role="listbox" aria-label="Title suggestions" className="max-h-64 overflow-y-auto">
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                className={`flex cursor-pointer items-center gap-2.5 border-b border-stone-100 px-2 py-1.5 last:border-b-0 dark:border-stone-800 ${index === active ? 'bg-rose-50 dark:bg-rose-950' : 'hover:bg-stone-50 dark:hover:bg-stone-800'}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(suggestion)}
              >
                <Poster suggestion={suggestion} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{suggestion.title}</span>
                  <span className="block text-xs text-stone-500 dark:text-stone-400">
                    {suggestion.year ?? 'Year unknown'} · {kindLabel(suggestion.kind)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div role="status" aria-live="polite">
            {!current && (
              <p className={`flex items-center gap-2 ${NOTE}`}>
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                Searching {SOURCES[kind].name}…
              </p>
            )}
            {current && 'error' in current && <p className={NOTE}>{current.error} You can still search with the title as typed.</p>}
            {current && 'suggestions' in current && suggestions.length === 0 && (
              <p className={NOTE}>No matching titles on {SOURCES[kind].name}. You can still search with the title as typed.</p>
            )}
            {suggestions.length > 0 && (
              <p className="sr-only">
                {suggestions.length} {suggestions.length === 1 ? 'suggestion' : 'suggestions'}. Use the arrow keys to choose.
              </p>
            )}
          </div>
          <p className="border-t border-stone-100 px-3 py-1 text-[10px] text-stone-400 dark:border-stone-800">
            Suggestions from{' '}
            <a href={SOURCES[kind].url} target="_blank" rel="noreferrer" className="underline">
              {SOURCES[kind].name}
            </a>{' '}
            ({SOURCES[kind].licence})
          </p>
        </div>
      </div>

      {selected && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-800 dark:text-emerald-300">
          <CircleCheck className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">
            Selected {kindLabel(selected.kind).toLowerCase()} from {SOURCES[selected.kind].name}
            {selected.year ? ` · ${selected.year}` : ''}
          </span>
        </p>
      )}
    </div>
  );
}

function Poster({ suggestion }: { suggestion: TitleSuggestion }) {
  const [failed, setFailed] = useState(false);
  const Icon = suggestion.kind === 'movie' ? Film : Tv;
  return suggestion.posterUrl && !failed ? (
    <img
      src={suggestion.posterUrl}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      className="h-12 w-8 shrink-0 rounded bg-stone-100 object-cover dark:bg-stone-800"
      onError={() => setFailed(true)}
    />
  ) : (
    <span
      data-testid="poster-fallback"
      className="flex h-12 w-8 shrink-0 items-center justify-center rounded bg-stone-100 text-stone-400 dark:bg-stone-800"
    >
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}
