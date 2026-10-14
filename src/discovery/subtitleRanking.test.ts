import { describe, expect, it } from 'vitest';
import type { FeatureInfo, SubtitleQuery, SubtitleResult } from '../providers/types';
import { assessMatch, normalizeTitle, rankResults } from './subtitleRanking';

const MOVIE: SubtitleQuery = { kind: 'movie', title: 'Interstellar', year: 2014, language: 'si', page: 1 };
const EPISODE: SubtitleQuery = { kind: 'episode', title: 'Stranger Things', season: 1, episode: 3, language: 'si', page: 1 };

let nextId = 0;
function result(feature: Partial<FeatureInfo>, extra: Partial<SubtitleResult> = {}): SubtitleResult {
  nextId += 1;
  return {
    provider: 'opensubtitles',
    id: String(nextId),
    downloadId: String(nextId),
    release: 'release',
    fileName: null,
    fileCount: 1,
    language: 'si',
    feature: { kind: 'movie', title: null, seriesTitle: null, year: null, season: null, episode: null, ...feature },
    uploadDate: null,
    downloadCount: null,
    hearingImpaired: false,
    aiTranslated: false,
    machineTranslated: false,
    fromTrusted: false,
    pageUrl: null,
    ...extra,
  };
}

const episode = (season: number | null, number: number | null, extra: Partial<SubtitleResult> = {}) =>
  result({ kind: 'episode', title: 'Chapter', seriesTitle: 'Stranger Things', season, episode: number }, extra);

describe('normalizeTitle', () => {
  it('ignores case, accents and punctuation', () => {
    expect(normalizeTitle('Spider-Man: No Way Home')).toBe('spider man no way home');
    expect(normalizeTitle('Amélie')).toBe(normalizeTitle('amelie'));
    expect(normalizeTitle('Fast & Furious')).toBe('fast and furious');
  });
});

describe('assessMatch', () => {
  it('rates an exact movie title and year as a strong match', () => {
    expect(assessMatch(MOVIE, result({ title: 'Interstellar', year: 2014 }))).toEqual({ level: 'strong', notes: ['Title matches', 'Year 2014'] });
  });

  it('flags a different year as a mismatch', () => {
    expect(assessMatch(MOVIE, result({ title: 'Interstellar', year: 2015 }))).toMatchObject({
      level: 'mismatch',
      notes: ['Title matches', 'Different year (2015)'],
    });
  });

  it('does not claim a strong match without a year to confirm it', () => {
    expect(assessMatch({ ...MOVIE, year: undefined }, result({ title: 'Interstellar', year: 2014 })).level).toBe('title');
    expect(assessMatch(MOVIE, result({ title: 'Interstellar' })).level).toBe('title');
  });

  it('treats missing identifiers as unconfirmed, not as a match', () => {
    expect(assessMatch(MOVIE, result({ kind: 'other' }))).toEqual({ level: 'possible', notes: [] });
  });

  it('rates the correct episode as strong and a wrong episode as a mismatch', () => {
    expect(assessMatch(EPISODE, episode(1, 3))).toEqual({ level: 'strong', notes: ['Title matches', 'S01E03'] });
    expect(assessMatch(EPISODE, episode(1, 4))).toMatchObject({ level: 'mismatch', notes: ['Title matches', 'Different episode (S01E04)'] });
    expect(assessMatch(EPISODE, episode(2, 3)).level).toBe('mismatch');
  });

  it('flags a movie result for an episode search', () => {
    expect(assessMatch(EPISODE, result({ title: 'Stranger Things', year: 2016 }))).toMatchObject({ level: 'mismatch', notes: ['This is a movie'] });
  });

  it('uses the release name as supporting evidence only', () => {
    const named = episode(null, null, { release: 'Stranger.Things.S01E03.720p' });
    expect(assessMatch(EPISODE, named)).toEqual({ level: 'title', notes: ['Title matches', 'Release name matches episode'] });
    expect(assessMatch(MOVIE, result({ title: 'Interstellar' }, { release: 'Interstellar.2014.BluRay' })).notes).toContain('Release name matches year');
  });
});

describe('rankResults', () => {
  it('orders by match level, then release evidence, trusted uploader and downloads, and hides nothing', () => {
    const wrongYear = result({ title: 'Interstellar', year: 2015 }, { downloadCount: 9999 });
    const unknown = result({ kind: 'other' });
    const popular = result({ title: 'Interstellar', year: 2014 }, { downloadCount: 500 });
    const trusted = result({ title: 'Interstellar', year: 2014 }, { downloadCount: 10, fromTrusted: true });
    const releaseMatch = result({ title: 'Interstellar', year: 2014 }, { release: 'Interstellar.2014.WEB' });

    const ranked = rankResults(MOVIE, [wrongYear, unknown, popular, trusted, releaseMatch]);
    expect(ranked.map(({ result: r }) => r)).toEqual([releaseMatch, trusted, popular, unknown, wrongYear]);
  });

  it('keeps several equally good releases as separate options in provider order', () => {
    const first = episode(1, 3, { release: 'A' });
    const second = episode(1, 3, { release: 'B' });
    const ranked = rankResults(EPISODE, [first, second]);
    expect(ranked.map(({ result: r }) => r.release)).toEqual(['A', 'B']);
    expect(ranked.every(({ match }) => match.level === 'strong')).toBe(true);
  });

  it('ranks ambiguous similarly named titles below exact ones', () => {
    const sequel = result({ title: 'Interstellar 2', year: 2014 });
    const exact = result({ title: 'Interstellar', year: 2014 });
    expect(rankResults(MOVIE, [sequel, exact]).map(({ match }) => match.level)).toEqual(['strong', 'possible']);
  });
});
