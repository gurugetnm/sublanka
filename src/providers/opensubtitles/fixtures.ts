/** Test fixtures shaped like documented OpenSubtitles.com API v1 responses. Not real data. */

export const movieSubtitle = {
  id: '9000001',
  type: 'subtitle',
  attributes: {
    subtitle_id: '9000001',
    language: 'si',
    download_count: 1520,
    hearing_impaired: false,
    from_trusted: true,
    ai_translated: false,
    machine_translated: false,
    upload_date: '2021-03-14T10:00:00Z',
    release: 'Interstellar.2014.1080p.BluRay.x264',
    url: 'https://www.opensubtitles.com/en/subtitles/legacy/9000001',
    feature_details: { feature_id: 1, feature_type: 'Movie', year: 2014, title: 'Interstellar', movie_name: '2014 - Interstellar', imdb_id: 816692 },
    files: [{ file_id: 7000001, cd_number: 1, file_name: 'Interstellar.2014.1080p.BluRay.x264.srt' }],
  },
};

export const episodeSubtitle = {
  id: '9000002',
  type: 'subtitle',
  attributes: {
    subtitle_id: '9000002',
    language: 'si',
    download_count: 310,
    hearing_impaired: true,
    from_trusted: false,
    ai_translated: false,
    machine_translated: false,
    upload_date: '2022-07-01T08:30:00Z',
    release: 'Stranger.Things.S01E03.720p.WEB',
    url: 'https://www.opensubtitles.com/en/subtitles/legacy/9000002',
    feature_details: {
      feature_id: 2,
      feature_type: 'Episode',
      year: 2016,
      title: 'Chapter Three: Holly, Jolly',
      movie_name: 'Stranger Things - S01E03 Chapter Three: Holly, Jolly',
      season_number: 1,
      episode_number: 3,
      parent_title: 'Stranger Things',
    },
    files: [{ file_id: 7000002, cd_number: 1, file_name: 'Stranger.Things.S01E03.srt' }],
  },
};

export const searchResponse = (data: unknown[], page = 1, totalPages = 1) => ({
  total_pages: totalPages,
  total_count: data.length * totalPages,
  per_page: 60,
  page,
  data,
});

export const downloadResponse = {
  link: 'https://www.opensubtitles.com/download/ABC123/subfile/Interstellar.srt',
  file_name: 'Interstellar.2014.1080p.BluRay.x264.srt',
  requests: 3,
  remaining: 2,
  message: 'Your quota will be renewed in 20 hours and 12 minutes',
  reset_time: '20 hours and 12 minutes',
  reset_time_utc: '2026-10-15T00:00:00.000Z',
};
