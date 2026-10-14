import type { MediaKind } from '../providers/types';

/**
 * A best-effort guess at what the page is playing, built only from metadata the page publishes
 * for everyone (structured data, Open Graph tags, the tab title, the main heading). Never sent
 * anywhere by itself: the user reviews it in the search form first.
 */
export interface DetectedMedia {
  kind: MediaKind;
  /** Movie title, or the series title for an episode. */
  title: string;
  year?: number;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  /** Which metadata the guess came from, shown to the user so a guess never passes for a fact. */
  source: 'structured-data' | 'open-graph' | 'player' | 'page-title' | 'heading';
  /**
   * high: a dedicated metadata source names the full identity (movie with year, or series with season and episode).
   * medium: a dedicated source with partial details, or free text with a year or episode code.
   * low: an ambiguous free-text title. Never pre-filled; the user has to confirm it.
   */
  confidence: Confidence;
}

export type Confidence = 'high' | 'medium' | 'low';
type Detection = Omit<DetectedMedia, 'confidence'>;

export interface EpisodeNumbers {
  season: number;
  episode: number;
  /** The matched notation, e.g. "S01E03", so callers can cut it out of a title. */
  match: string;
  at: number;
}

const MAX_TITLE_LENGTH = 200;
// Years are only read from (2014) or [2014], so titles such as "Blade Runner 2049" or "1917" stay intact.
const BRACKETED_YEAR = /[([](\d{4})[)\]]/;
// Space-separated dashes and bars split "Title - Site" suffixes; "Spider-Man" has no spaces around its dash.
const SEPARATOR = /\s+[|–—-]\s+|\s*\|\s*/;

const EPISODE_PATTERNS = [
  // S01E03, S1 E3 and Netflix's "S1:E3".
  /\bS(\d{1,2})\s?:?\s?E(\d{1,3})\b/i,
  /\bSeason\s*(\d{1,2})\W{0,3}\s*Ep(?:isode|\.)?\s*(\d{1,3})\b/i,
  // 1x03: the episode needs two digits so "4x4" or "1920x1080" never match.
  /\b(\d{1,2})x(\d{2,3})\b/,
];

/** Finds S01E03, "Season 1 Episode 3" or 1x03 notation. Returns null for anything else. */
export function parseEpisodeNumbers(text: string): EpisodeNumbers | null {
  for (const pattern of EPISODE_PATTERNS) {
    const found = pattern.exec(text);
    if (found?.[1] && found[2]) {
      const season = Number(found[1]);
      const episode = Number(found[2]);
      if (episode > 0) return { season, episode, match: found[0], at: found.index };
    }
  }
  return null;
}

export function parseYear(value: unknown): number | undefined {
  const year = typeof value === 'number' ? value : Number(/^\d{4}/.exec(String(value ?? ''))?.[0]);
  return Number.isInteger(year) && year >= 1880 && year <= new Date().getFullYear() + 2 ? year : undefined;
}

const clean = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH);
const trimSeparators = (text: string) => clean(text.replace(/^[\s|:·•–—-]+|[\s|:·•–—-]+$/g, ''));

function toPositive(value: unknown): number | undefined {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isInteger(number) && number >= 0 ? number : undefined;
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return clean(value);
  if (typeof value === 'object' && value !== null && 'name' in value) return textOf(value.name);
  return '';
}

function hasType(item: Record<string, unknown>, type: string): boolean {
  const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
  return types.includes(type);
}

/** Flattens JSON-LD documents, arrays and @graph lists into individual items. */
function jsonLdItems(document: Document): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (typeof value === 'object' && value !== null) {
      items.push(value as Record<string, unknown>);
      if ('@graph' in value) visit(value['@graph']);
    }
  };
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      visit(JSON.parse(script.textContent ?? ''));
    } catch {
      // Malformed structured data is common; skip it.
    }
  }
  return items;
}

function fromStructuredData(document: Document): Detection | null {
  let series: Detection | null = null;
  for (const item of jsonLdItems(document)) {
    if (hasType(item, 'TVEpisode')) {
      const series = textOf(item.partOfSeries);
      if (!series) continue;
      const seasonValue = typeof item.partOfSeason === 'object' && item.partOfSeason !== null ? (item.partOfSeason as Record<string, unknown>).seasonNumber : undefined;
      const episodeTitle = textOf(item.name);
      return {
        kind: 'episode',
        title: series,
        season: toPositive(seasonValue),
        episode: toPositive(item.episodeNumber),
        ...(episodeTitle && episodeTitle !== series ? { episodeTitle } : {}),
        year: parseYear(item.datePublished),
        source: 'structured-data',
      };
    }
    if (hasType(item, 'Movie')) {
      const title = textOf(item.name);
      if (title) return { kind: 'movie', title, year: parseYear(item.datePublished ?? item.dateCreated), source: 'structured-data' };
    }
    // A series page (e.g. a Netflix title page) names the show but not the episode, so it only wins when nothing better is listed.
    if (hasType(item, 'TVSeries') && !series) {
      const title = textOf(item.name);
      if (title) series = { kind: 'episode', title, source: 'structured-data' };
    }
  }
  return series;
}

function meta(document: Document, property: string): string {
  return clean(document.querySelector(`meta[property="${property}"], meta[name="${property}"]`)?.getAttribute('content') ?? '');
}

/**
 * Reads a free-text title such as "Stranger Things - S01E03 - Chapter Three | Site" or "Interstellar (2014) - Site".
 * Returns null when nothing usable is left after removing the site name.
 */
export function parseTitleText(text: string, siteName = ''): Omit<Detection, 'source'> | null {
  const full = clean(text);
  const episode = parseEpisodeNumbers(full);
  const site = siteName.toLowerCase();
  const isSite = (part: string) => site !== '' && part.toLowerCase() === site;

  if (episode) {
    const series = trimSeparators(full.slice(0, episode.at).split(SEPARATOR).filter((part) => !isSite(part.trim())).join(' - '));
    if (!series) return null;
    const after = full.slice(episode.at + episode.match.length).split(SEPARATOR).map(trimSeparators).filter(Boolean);
    const episodeTitle = after[0] && !isSite(after[0]) ? after[0] : undefined;
    return {
      kind: 'episode',
      title: series.replace(BRACKETED_YEAR, '').trim(),
      season: episode.season,
      episode: episode.episode,
      ...(episodeTitle ? { episodeTitle } : {}),
    };
  }

  const [first] = full.split(SEPARATOR).map(trimSeparators).filter((part) => part && !isSite(part));
  if (!first) return null;
  const year = parseYear(BRACKETED_YEAR.exec(first)?.[1]);
  const title = trimSeparators(first.replace(BRACKETED_YEAR, ''));
  return title ? { kind: 'movie', title, ...(year ? { year } : {}) } : null;
}

const NETFLIX_WATCH_URL = /^https:\/\/(?:www\.)?netflix\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?watch\/\d+(?:[/?#]|$)/i;
/** True for Netflix player pages. The numeric id is Netflix's own and is never used as an IMDb or TMDB id. */
export const isNetflixWatchPage = (url: string) => NETFLIX_WATCH_URL.test(url);

// Netflix labels limited-series episodes with the episode alone: "E3", "Ep. 3", "Episode 3".
const LONE_EPISODE = /^(?:E|Ep\.?|Episode)\s*(\d{1,3})$/i;
const MAX_EPISODE_TITLE_LENGTH = 100;

/**
 * Netflix's watch page is titled just "Netflix", with no sharing tags, structured data or heading. The only title is
 * the player's own visible label, which Netflix renders while the controls are showing ("video-title") or after a
 * pause ("You're watching" overlay). Both are read as plain page text.
 */
function fromNetflixPlayer(document: Document): Detection | null {
  const texts = (root: Element, selector: string) => [...root.querySelectorAll(selector)].map((element) => clean(element.textContent ?? '')).filter(Boolean);
  const label = document.querySelector('[data-uia="video-title"]');
  if (label) {
    // Episodes show "<h4>Series</h4><span>S1:E3</span><span>Episode title</span>"; a heading alone is not proof of a series.
    const [heading] = texts(label, 'h4');
    const spans = texts(label, 'span');
    if (heading) return playerMedia(heading, spans, spans.length > 0);
    const title = clean(label.textContent ?? '');
    return title ? playerMedia(title, [], false) : null;
  }
  const overlay = document.querySelector('[data-uia="evidence-overlay"]');
  const [title] = overlay ? texts(overlay, 'h1, h2') : [];
  return overlay && title ? playerMedia(title, texts(overlay, 'h3, h4, p, span'), false) : null;
}

function playerMedia(title: string, parts: string[], isSeries: boolean): Detection | null {
  if (title.toLowerCase() === 'netflix') return null;
  const markerAt = parts.findIndex((part) => parseEpisodeNumbers(part) || LONE_EPISODE.test(part));
  if (markerAt === -1) return { kind: isSeries ? 'episode' : 'movie', title, source: 'player' };
  const marker = parts[markerAt] ?? '';
  const numbers = parseEpisodeNumbers(marker);
  const episodeTitle = parts[markerAt + 1];
  return {
    kind: 'episode',
    title,
    season: numbers?.season,
    episode: numbers?.episode ?? Number(LONE_EPISODE.exec(marker)?.[1]),
    ...(episodeTitle && episodeTitle.length <= MAX_EPISODE_TITLE_LENGTH ? { episodeTitle } : {}),
    source: 'player',
  };
}

/** Hostname without "www." and the TLD, e.g. "netflix" for www.netflix.com. Used only to drop the site name from titles. */
function siteFromHost(hostname: string): string {
  const parts = hostname.replace(/^www\./, '').split('.');
  return parts.length > 1 ? parts.slice(0, -1).join('.') : hostname;
}

/**
 * Best-effort movie or episode detection. Structured data wins over Open Graph, which wins over
 * the tab title and the main heading. Returns null rather than guessing when the page only names itself.
 */
export function detectMedia(document: Document, url = document.location?.href ?? ''): DetectedMedia | null {
  const structured = fromStructuredData(document);
  if (structured) return finish(structured);

  if (isNetflixWatchPage(url)) {
    const player = fromNetflixPlayer(document);
    if (player) return finish(player);
  }

  const siteName = meta(document, 'og:site_name') || siteFromHost(URL.canParse(url) ? new URL(url).hostname : '');
  const ogType = meta(document, 'og:type');
  const ogTitle = meta(document, 'og:title');
  if (ogTitle && (ogType === 'video.movie' || ogType === 'video.episode')) {
    const parsed = parseTitleText(ogTitle, siteName);
    if (parsed) {
      const year = parsed.year ?? parseYear(meta(document, 'video:release_date'));
      const kind = ogType === 'video.episode' ? 'episode' : parsed.kind;
      return finish({ ...parsed, kind, year, source: 'open-graph' });
    }
  }

  const fromTitle = parseTitleText(document.title, siteName);
  if (fromTitle) return finish({ ...fromTitle, source: 'page-title' });

  const heading = document.querySelector('h1')?.textContent ?? '';
  const fromHeading = parseTitleText(heading, siteName);
  return fromHeading && finish({ ...fromHeading, source: 'heading' });
}

export function confidenceOf(media: Detection): Confidence {
  const dedicated = media.source !== 'page-title' && media.source !== 'heading';
  const complete = media.kind === 'movie' ? media.year !== undefined : media.season !== undefined && media.episode !== undefined;
  return dedicated && complete ? 'high' : dedicated || complete ? 'medium' : 'low';
}

function finish(media: Detection): DetectedMedia {
  const withConfidence = { ...media, confidence: confidenceOf(media) };
  return Object.fromEntries(Object.entries(withConfidence).filter(([, value]) => value !== undefined)) as unknown as DetectedMedia;
}

/** Shape check for the content script's reply. */
export function isDetectedMedia(value: unknown): value is DetectedMedia {
  if (typeof value !== 'object' || value === null) return false;
  const media = value as Record<string, unknown>;
  return (
    (media.kind === 'movie' || media.kind === 'episode') &&
    typeof media.title === 'string' &&
    media.title !== '' &&
    (media.confidence === 'high' || media.confidence === 'medium' || media.confidence === 'low')
  );
}
