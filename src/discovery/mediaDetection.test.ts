import { describe, expect, it } from 'vitest';
import { detectMedia, isDetectedMedia, isNetflixWatchPage, parseEpisodeNumbers, parseTitleText } from './mediaDetection';

const page = (head: string, body = '') => new DOMParser().parseFromString(`<html><head>${head}</head><body>${body}</body></html>`, 'text/html');
const jsonLd = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;

describe('parseEpisodeNumbers', () => {
  it.each([
    ['Stranger Things S01E03', 1, 3],
    ['stranger.things.s1e3.720p', 1, 3],
    ['Stranger Things Season 1 Episode 3', 1, 3],
    ['Stranger Things – Season 2, Episode 10', 2, 10],
    ['Stranger Things 1x03', 1, 3],
    ['S1:E3', 1, 3],
    ['Season 1: Ep. 3', 1, 3],
  ])('reads %s', (text, season, episode) => {
    expect(parseEpisodeNumbers(text)).toMatchObject({ season, episode });
  });

  it.each(['Blade Runner 2049', '1917', 'Video 1920x1080', '4x4 Off-road', 'Apollo 13', 'Ocean’s 11 (2001)', 'Top 10 scenes'])(
    'does not treat unrelated numbers in "%s" as an episode',
    (text) => {
      expect(parseEpisodeNumbers(text)).toBeNull();
    },
  );
});

describe('parseTitleText', () => {
  it('reads a movie title and a bracketed release year, dropping the site name', () => {
    expect(parseTitleText('Interstellar (2014) - MovieSite', 'MovieSite')).toEqual({ kind: 'movie', title: 'Interstellar', year: 2014 });
  });

  it('keeps numbers that are part of the title and only reads bracketed years', () => {
    expect(parseTitleText('Blade Runner 2049 | Watch online')).toEqual({ kind: 'movie', title: 'Blade Runner 2049' });
    expect(parseTitleText('1917 (2019)')).toEqual({ kind: 'movie', title: '1917', year: 2019 });
  });

  it('keeps hyphens inside titles', () => {
    expect(parseTitleText('Spider-Man: No Way Home - Netflix', 'netflix')).toEqual({ kind: 'movie', title: 'Spider-Man: No Way Home' });
  });

  it('reads series, season, episode and episode title', () => {
    expect(parseTitleText('Stranger Things - S01E03 - Chapter Three: Holly, Jolly | StreamSite', 'StreamSite')).toEqual({
      kind: 'episode',
      title: 'Stranger Things',
      season: 1,
      episode: 3,
      episodeTitle: 'Chapter Three: Holly, Jolly',
    });
  });

  it('returns null when the title only names the site', () => {
    expect(parseTitleText('Netflix', 'netflix')).toBeNull();
    expect(parseTitleText('   ')).toBeNull();
    expect(parseTitleText('S01E03')).toBeNull();
  });
});

describe('detectMedia', () => {
  it('reads a movie and its year from JSON-LD', () => {
    const doc = page(jsonLd({ '@context': 'https://schema.org', '@type': 'Movie', name: 'Interstellar', datePublished: '2014-11-07' }));
    expect(detectMedia(doc)).toEqual({ kind: 'movie', title: 'Interstellar', year: 2014, source: 'structured-data', confidence: 'high' });
  });

  it('reads a TV episode from JSON-LD, including inside @graph', () => {
    const doc = page(
      jsonLd({
        '@graph': [
          { '@type': 'WebPage', name: 'Watch' },
          {
            '@type': 'TVEpisode',
            name: 'Chapter Three: Holly, Jolly',
            episodeNumber: 3,
            partOfSeason: { '@type': 'TVSeason', seasonNumber: '1' },
            partOfSeries: { '@type': 'TVSeries', name: 'Stranger Things' },
          },
        ],
      }),
    );
    expect(detectMedia(doc)).toEqual({
      kind: 'episode',
      title: 'Stranger Things',
      season: 1,
      episode: 3,
      episodeTitle: 'Chapter Three: Holly, Jolly',
      source: 'structured-data',
      confidence: 'high',
    });
  });

  it('prefers structured data when the tab title disagrees', () => {
    const doc = page(`<title>Trailer: Dune Part Two S01E01 - Site</title>${jsonLd({ '@type': 'Movie', name: 'Dune: Part Two', dateCreated: '2024' })}`);
    expect(detectMedia(doc)).toMatchObject({ kind: 'movie', title: 'Dune: Part Two', year: 2024, source: 'structured-data' });
  });

  it('uses Open Graph video tags and their release date', () => {
    const doc = page(
      '<meta property="og:type" content="video.movie"><meta property="og:title" content="Interstellar | Films"><meta property="og:site_name" content="Films"><meta property="video:release_date" content="2014-11-05">',
    );
    expect(detectMedia(doc)).toEqual({ kind: 'movie', title: 'Interstellar', year: 2014, source: 'open-graph', confidence: 'high' });
  });

  it('falls back to the tab title, then the main heading', () => {
    expect(detectMedia(page('<title>The Office 2x05 - Halloween</title>'))).toMatchObject({
      kind: 'episode',
      title: 'The Office',
      season: 2,
      episode: 5,
      source: 'page-title',
    });
    const doc = page('<title>Films</title><meta property="og:site_name" content="Films">', '<h1>Interstellar (2014)</h1>');
    expect(detectMedia(doc)).toEqual({ kind: 'movie', title: 'Interstellar', year: 2014, source: 'heading', confidence: 'medium' });
  });

  it('returns null when the page has no usable metadata, as on a Netflix player page', () => {
    expect(detectMedia(page('<title>Netflix</title><meta property="og:site_name" content="Netflix">'))).toBeNull();
    expect(detectMedia(page(''))).toBeNull();
  });

  it('ignores malformed JSON-LD and unrelated structured data', () => {
    const doc = page(`<script type="application/ld+json">{not json</script>${jsonLd({ '@type': 'Organization', name: 'Studio' })}<title>Arrival (2016)</title>`);
    expect(detectMedia(doc)).toMatchObject({ title: 'Arrival', year: 2016, source: 'page-title' });
  });

  it('skips JSON-LD episodes without a series name', () => {
    const doc = page(`${jsonLd({ '@type': 'TVEpisode', name: 'Pilot', episodeNumber: 1 })}<title>Lost S01E01</title>`);
    expect(detectMedia(doc)).toMatchObject({ title: 'Lost', season: 1, episode: 1, source: 'page-title' });
  });

  it('caps very long titles', () => {
    expect(detectMedia(page(`<title>${'A'.repeat(500)}</title>`))?.title).toHaveLength(200);
  });
});

describe('confidence', () => {
  it('marks an ambiguous free-text title as low, and partial or coded text as medium', () => {
    expect(detectMedia(page('<title>Arrival</title>'))).toMatchObject({ title: 'Arrival', confidence: 'low' });
    expect(detectMedia(page('<title>Arrival (2016)</title>'))).toMatchObject({ confidence: 'medium' });
    expect(detectMedia(page(jsonLd({ '@type': 'Movie', name: 'Arrival' })))).toMatchObject({ confidence: 'medium' });
  });

  it('reads a series page as a series without inventing an episode, preferring a listed episode', () => {
    expect(detectMedia(page(jsonLd({ '@type': 'TVSeries', name: 'Stranger Things' })))).toEqual({
      kind: 'episode',
      title: 'Stranger Things',
      source: 'structured-data',
      confidence: 'medium',
    });
    const both = page(jsonLd({ '@graph': [{ '@type': 'TVSeries', name: 'Lost' }, { '@type': 'TVEpisode', name: 'Pilot', episodeNumber: 1, partOfSeason: { seasonNumber: 1 }, partOfSeries: { name: 'Lost' } }] }));
    expect(detectMedia(both)).toMatchObject({ title: 'Lost', season: 1, episode: 1, confidence: 'high' });
  });

  it('rejects replies without a valid confidence', () => {
    expect(isDetectedMedia({ kind: 'movie', title: 'Arrival', source: 'page-title' })).toBe(false);
    expect(isDetectedMedia({ kind: 'movie', title: 'Arrival', source: 'page-title', confidence: 'certain' })).toBe(false);
    expect(isDetectedMedia({ kind: 'movie', title: 'Arrival', source: 'page-title', confidence: 'low' })).toBe(true);
  });
});

describe('Netflix', () => {
  const WATCH = 'https://www.netflix.com/watch/80021959?trackId=14170286';
  const player = (body: string) => page('<title>Netflix</title>', body);

  it.each([
    ['https://www.netflix.com/watch/80021959', true],
    [WATCH, true],
    ['https://netflix.com/watch/80021959#t', true],
    ['https://www.netflix.com/browse', false],
    ['https://www.netflix.com/title/80021959', false],
    ['https://www.netflix.com.evil.example/watch/1', false],
    ['http://www.netflix.com/watch/1', false],
  ])('recognises watch URL %s: %s', (url, expected) => {
    expect(isNetflixWatchPage(url)).toBe(expected);
  });

  it('finds nothing on a watch page whose player label is not rendered, and never uses the numeric id', () => {
    expect(detectMedia(player('<div class="watch-video"><video></video></div>'), WATCH)).toBeNull();
  });

  it('reads an episode from the player label', () => {
    const doc = player('<div data-uia="video-title"><h4>Stranger Things</h4><span>S1:E3</span><span>Chapter Three: Holly, Jolly</span></div>');
    expect(detectMedia(doc, WATCH)).toEqual({
      kind: 'episode',
      title: 'Stranger Things',
      season: 1,
      episode: 3,
      episodeTitle: 'Chapter Three: Holly, Jolly',
      source: 'player',
      confidence: 'high',
    });
  });

  it('reads a limited-series episode without a season as medium confidence', () => {
    const doc = player('<div data-uia="video-title"><h4>Baby Reindeer</h4><span>E3</span><span>Episode 3</span></div>');
    expect(detectMedia(doc, WATCH)).toMatchObject({ kind: 'episode', title: 'Baby Reindeer', episode: 3, confidence: 'medium' });
    expect(detectMedia(doc, WATCH)).not.toHaveProperty('season');
  });

  it('reads a movie title as medium confidence, because the player gives no year', () => {
    expect(detectMedia(player('<div data-uia="video-title">Extraction 2</div>'), WATCH)).toEqual({
      kind: 'movie',
      title: 'Extraction 2',
      source: 'player',
      confidence: 'medium',
    });
    expect(detectMedia(player('<div data-uia="video-title"><h4>Extraction 2</h4></div>'), WATCH)).toMatchObject({ kind: 'movie', title: 'Extraction 2' });
  });

  it('reads the pause overlay', () => {
    const doc = player(
      '<div data-uia="evidence-overlay"><p>You’re watching</p><h2>Stranger Things</h2><p>Season 1: Ep. 3</p><h3>Chapter Three: Holly, Jolly</h3><p>A long synopsis that is not a title.</p></div>',
    );
    expect(detectMedia(doc, WATCH)).toMatchObject({ kind: 'episode', title: 'Stranger Things', season: 1, episode: 3, episodeTitle: 'Chapter Three: Holly, Jolly' });
  });

  it('ignores a label that only names Netflix, and player markup on other sites', () => {
    expect(detectMedia(player('<div data-uia="video-title"><h4>Netflix</h4></div>'), WATCH)).toBeNull();
    expect(detectMedia(page('', '<div data-uia="video-title">Extraction 2</div>'), 'https://example.com/watch/1')).toBeNull();
  });
});
