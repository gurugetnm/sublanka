import type { SubtitleQuery, SubtitleResult } from '../providers/types';
import { parseEpisodeNumbers } from './mediaDetection';

/**
 * How well a result fits what the user searched for, judged only from metadata the provider returned.
 * - strong:   title matches, plus the year (movies) or season and episode (episodes)
 * - title:    title matches, but nothing else could be confirmed
 * - possible: the title could not be confirmed
 * - mismatch: the provider reports a different year, episode or media type
 */
export type MatchLevel = 'strong' | 'title' | 'possible' | 'mismatch';

export interface MatchAssessment {
  level: MatchLevel;
  /** Short facts behind the level, e.g. "Year 2014" or "Different episode (S01E04)". */
  notes: string[];
}

export interface RankedResult {
  result: SubtitleResult;
  match: MatchAssessment;
}

const LEVEL_ORDER: Record<MatchLevel, number> = { strong: 0, title: 1, possible: 2, mismatch: 3 };

/** Lowercase, no accents or punctuation, "&" as "and", so "Spider-Man: No Way Home" equals "spider man no way home". */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const episodeCode = (season: number, episode: number) => `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;

export function assessMatch(query: SubtitleQuery, result: SubtitleResult): MatchAssessment {
  const notes: string[] = [];
  let mismatch = false;
  const { feature } = result;

  const wanted = normalizeTitle(query.title);
  const candidate = query.kind === 'episode' ? feature.seriesTitle : feature.title;
  const titleMatch = wanted !== '' && candidate !== null && normalizeTitle(candidate) === wanted;
  if (titleMatch) notes.push('Title matches');

  if (feature.kind !== 'other' && feature.kind !== query.kind) {
    mismatch = true;
    notes.push(feature.kind === 'movie' ? 'This is a movie' : 'This is a TV episode');
  }

  let detailsConfirmed = false;
  if (query.kind === 'movie') {
    if (query.year && feature.year) {
      detailsConfirmed = query.year === feature.year;
      mismatch ||= !detailsConfirmed;
      notes.push(detailsConfirmed ? `Year ${feature.year}` : `Different year (${feature.year})`);
    }
  } else if (query.season !== undefined && query.episode !== undefined) {
    if (feature.season !== null && feature.episode !== null) {
      detailsConfirmed = feature.season === query.season && feature.episode === query.episode;
      mismatch ||= !detailsConfirmed;
      const code = episodeCode(feature.season, feature.episode);
      notes.push(detailsConfirmed ? code : `Different episode (${code})`);
    }
  }

  // Release names often carry S01E03 or the year; a match there is supporting evidence only.
  const releaseEpisode = parseEpisodeNumbers(result.release);
  if (query.kind === 'episode' && releaseEpisode && query.season !== undefined && query.episode !== undefined) {
    if (releaseEpisode.season === query.season && releaseEpisode.episode === query.episode) notes.push('Release name matches episode');
    else notes.push('Release name names another episode');
  } else if (query.kind === 'movie' && query.year && result.release.includes(String(query.year))) {
    notes.push('Release name matches year');
  }

  const level: MatchLevel = mismatch ? 'mismatch' : titleMatch && detailsConfirmed ? 'strong' : titleMatch ? 'title' : 'possible';
  return { level, notes };
}

function releaseScore(match: MatchAssessment): number {
  if (match.notes.includes('Release name names another episode')) return -1;
  return match.notes.some((note) => note.startsWith('Release name matches')) ? 1 : 0;
}

/**
 * Orders results by match level, then release-name evidence, then provider signals (trusted uploader,
 * download count). Ties keep the provider's order. Nothing is hidden: the user always picks.
 */
export function rankResults(query: SubtitleQuery, results: SubtitleResult[]): RankedResult[] {
  return results
    .map((result, order) => ({ result, match: assessMatch(query, result), order }))
    .sort(
      (a, b) =>
        LEVEL_ORDER[a.match.level] - LEVEL_ORDER[b.match.level] ||
        releaseScore(b.match) - releaseScore(a.match) ||
        Number(b.result.fromTrusted) - Number(a.result.fromTrusted) ||
        (b.result.downloadCount ?? 0) - (a.result.downloadCount ?? 0) ||
        a.order - b.order,
    )
    .map(({ result, match }) => ({ result, match }));
}
