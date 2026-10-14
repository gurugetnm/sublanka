/**
 * Provider-neutral subtitle search types. The popup and the background worker only see these,
 * never a provider's raw API responses, so another provider can be added beside OpenSubtitles.
 */

import type { SubtitleSource } from '../shared/messages';

/** Every provider is also a track source the popup can show. */
export type ProviderId = Exclude<SubtitleSource, 'local' | 'translated'>;

export type MediaKind = 'movie' | 'episode';

/** Only what the user typed or confirmed. Never page contents, URLs or browsing data. */
export interface SubtitleQuery {
  kind: MediaKind;
  title: string;
  year?: number;
  season?: number;
  episode?: number;
  /** Numeric IMDb id of the movie or TV series the user picked from suggestions, when the source listed one. */
  imdbId?: number;
  /** ISO 639-1 code as the provider lists it; Sinhala is "si". */
  language: string;
  /** 1-based. */
  page: number;
}

/** The movie or episode a subtitle belongs to, as the provider reports it. Missing fields are unknown, not empty. */
export interface FeatureInfo {
  kind: MediaKind | 'other';
  /** Movie title or episode title. */
  title: string | null;
  /** Series title, for episodes. */
  seriesTitle: string | null;
  year: number | null;
  season: number | null;
  episode: number | null;
}

export interface SubtitleResult {
  provider: ProviderId;
  /** Provider's subtitle id; unique within one result list. */
  id: string;
  /** What to pass to SubtitleProvider.download. */
  downloadId: string;
  release: string;
  fileName: string | null;
  /** Number of files (CDs) the subtitle is split into; only the first is loaded. */
  fileCount: number;
  language: string;
  feature: FeatureInfo;
  uploadDate: string | null;
  downloadCount: number | null;
  hearingImpaired: boolean;
  aiTranslated: boolean;
  machineTranslated: boolean;
  /** Uploaded by an account the provider marks as trusted. */
  fromTrusted: boolean;
  /** Provider page for this subtitle (attribution), already checked to be on the provider's site. */
  pageUrl: string | null;
}

export interface SearchPage {
  results: SubtitleResult[];
  page: number;
  totalPages: number;
  totalCount: number;
}

export interface DownloadedFile {
  fileName: string;
  bytes: ArrayBuffer;
  /** Downloads left in the current quota period, when the provider reports it. */
  remaining: number | null;
}

export type ProviderErrorCode =
  | 'setup-required'
  | 'invalid-key'
  | 'auth'
  | 'rate-limit'
  | 'quota'
  | 'network'
  | 'unavailable'
  | 'invalid-response'
  | 'bad-file'
  | 'aborted';

/** A failure with a message written for the user. */
export class ProviderError extends Error {
  override name = 'ProviderError';
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface SubtitleProvider {
  id: ProviderId;
  name: string;
  search(query: SubtitleQuery, signal: AbortSignal): Promise<SearchPage>;
  download(downloadId: string, signal: AbortSignal): Promise<DownloadedFile>;
}
