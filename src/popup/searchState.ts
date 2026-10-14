import type { TitleSuggestion } from '../metadata/titleSearch';
import type { MediaKind, SearchPage, SubtitleQuery } from '../providers/types';

/** What the user typed. Kept as strings so half-typed numbers survive a popup reopen. */
export interface SearchForm {
  kind: MediaKind;
  title: string;
  year: string;
  season: string;
  episode: string;
  /** The title picked from suggestions; null for a free-typed title. Cleared whenever the title or type changes. */
  selected: TitleSuggestion | null;
}

export interface SavedSearch {
  form: SearchForm;
  /** Last finished search and every page loaded so far. */
  results: { query: SubtitleQuery; page: SearchPage } | null;
}

export const EMPTY_FORM: SearchForm = { kind: 'movie', title: '', year: '', season: '', episode: '', selected: null };

/**
 * chrome.storage.session: memory only, cleared when the browser closes, readable only by extension pages.
 * Holds the form and the last results so reopening the popup restores them. Never holds credentials.
 */
const SEARCH_STATE_KEY = 'searchState';

function parseForm(value: unknown): SearchForm | null {
  if (typeof value !== 'object' || value === null) return null;
  const form = value as Record<string, unknown>;
  const strings = ['title', 'year', 'season', 'episode'].every((key) => typeof form[key] === 'string');
  if (!strings || (form.kind !== 'movie' && form.kind !== 'episode')) return null;
  return { ...(form as unknown as SearchForm), selected: parseSelected(form.selected, form.kind, form.title as string) };
}

/** A saved selection is kept only if it is well formed and still belongs to the saved title and type. */
function parseSelected(value: unknown, kind: MediaKind, title: string): TitleSuggestion | null {
  if (typeof value !== 'object' || value === null) return null;
  const { source, id, title: selectedTitle, year, posterUrl, imdbId, kind: selectedKind } = value as Record<string, unknown>;
  const valid =
    (source === 'tvmaze' || source === 'wikidata') &&
    typeof id === 'string' &&
    selectedKind === kind &&
    selectedTitle === title &&
    (year === null || Number.isInteger(year)) &&
    (posterUrl === null || typeof posterUrl === 'string') &&
    (imdbId === null || (Number.isSafeInteger(imdbId) && (imdbId as number) > 0));
  return valid ? (value as TitleSuggestion) : null;
}

/** The picked title, only while the form still shows exactly that title and type. */
export function currentSelection(form: SearchForm): TitleSuggestion | null {
  const { selected } = form;
  return selected && selected.kind === form.kind && selected.title === form.title.trim() ? selected : null;
}

export async function loadSearchState(): Promise<SavedSearch | null> {
  const stored: unknown = (await chrome.storage.session.get(SEARCH_STATE_KEY))[SEARCH_STATE_KEY];
  if (typeof stored !== 'object' || stored === null) return null;
  const { form, results } = stored as Record<string, unknown>;
  const parsedForm = parseForm(form);
  if (!parsedForm) return null;
  const validResults =
    typeof results === 'object' && results !== null && 'page' in results && Array.isArray((results.page as SearchPage | undefined)?.results);
  return { form: parsedForm, results: validResults ? (results as SavedSearch['results']) : null };
}

export function saveSearchState(state: SavedSearch): Promise<void> {
  return chrome.storage.session.set({ [SEARCH_STATE_KEY]: state });
}

/** Builds a provider query from the form, or returns a message explaining what to fix. */
export function buildQuery(form: SearchForm, language: string): SubtitleQuery | string {
  const title = form.title.trim();
  if (!title) return 'Enter a movie or series title.';
  const query: SubtitleQuery = { kind: form.kind, title, language, page: 1 };
  const selection = currentSelection(form);
  if (selection?.imdbId) query.imdbId = selection.imdbId;

  // For a picked series the year is its premiere year, not the episode's, so it must not filter episodes.
  if (form.year.trim() && !(form.kind === 'episode' && selection)) {
    const year = Number(form.year);
    if (!Number.isInteger(year) || year < 1880 || year > new Date().getFullYear() + 2) return 'Enter the year as four digits, e.g. 2014.';
    query.year = year;
  }
  if (form.kind === 'episode') {
    const season = form.season.trim() === '' ? undefined : Number(form.season);
    const episode = form.episode.trim() === '' ? undefined : Number(form.episode);
    if (season !== undefined && (!Number.isInteger(season) || season < 0 || season > 200)) return 'Enter a valid season number.';
    if (episode !== undefined && (!Number.isInteger(episode) || episode < 1 || episode > 2000)) return 'Enter a valid episode number.';
    if (episode !== undefined && season === undefined) return 'Enter the season number for this episode.';
    if (season !== undefined) query.season = season;
    if (episode !== undefined) query.episode = episode;
  }
  return query;
}
