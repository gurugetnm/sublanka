import { ProviderError, type FeatureInfo, type SearchPage, type SubtitleResult } from '../types';

/**
 * Turns OpenSubtitles.com JSON (GET /subtitles, POST /download) into provider-neutral types.
 * Everything is treated as untrusted: unknown fields are ignored, wrong types become null,
 * and items without a downloadable file are dropped.
 */

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, max = 300): string | null => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);
const count = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null);

/** True for https links on opensubtitles.com or its subdomains; anything else is never fetched, linked or sent credentials. */
export function isProviderUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'opensubtitles.com' || url.hostname.endsWith('.opensubtitles.com'));
  } catch {
    return false;
  }
}

function mapFeature(raw: unknown): FeatureInfo {
  const details = isObject(raw) ? raw : {};
  const type = text(details.feature_type)?.toLowerCase();
  const kind = type === 'movie' ? 'movie' : type === 'episode' ? 'episode' : 'other';
  return {
    kind,
    title: text(details.title),
    seriesTitle: kind === 'episode' ? text(details.parent_title) : null,
    year: count(details.year) || null,
    season: count(details.season_number),
    episode: count(details.episode_number),
  };
}

export function mapSubtitle(raw: unknown): SubtitleResult | null {
  if (!isObject(raw) || !isObject(raw.attributes)) return null;
  const attributes = raw.attributes;
  const files = Array.isArray(attributes.files) ? attributes.files.filter(isObject) : [];
  const fileId = count(files[0]?.file_id);
  const id = text(raw.id) ?? (count(attributes.subtitle_id) ?? '').toString();
  if (fileId === null || !id) return null;

  const pageUrl = text(attributes.url, 2000);
  const fileName = text(files[0]?.file_name);
  return {
    provider: 'opensubtitles',
    id,
    downloadId: String(fileId),
    release: text(attributes.release) ?? fileName ?? 'Untitled release',
    fileName,
    fileCount: files.length,
    language: text(attributes.language, 10) ?? 'unknown',
    feature: mapFeature(attributes.feature_details),
    uploadDate: text(attributes.upload_date, 40),
    downloadCount: count(attributes.download_count),
    hearingImpaired: attributes.hearing_impaired === true,
    aiTranslated: attributes.ai_translated === true,
    machineTranslated: attributes.machine_translated === true,
    fromTrusted: attributes.from_trusted === true,
    pageUrl: pageUrl && isProviderUrl(pageUrl) ? pageUrl : null,
  };
}

export function mapSearchResponse(raw: unknown, requestedPage: number): SearchPage {
  if (!isObject(raw) || !Array.isArray(raw.data)) {
    throw new ProviderError('invalid-response', 'OpenSubtitles sent an unexpected response. Try again later.');
  }
  const seen = new Set<string>();
  const results = raw.data.map(mapSubtitle).filter((result): result is SubtitleResult => {
    if (!result || seen.has(result.id)) return false;
    seen.add(result.id);
    return true;
  });
  return {
    results,
    page: count(raw.page) || requestedPage,
    totalPages: count(raw.total_pages) ?? 1,
    totalCount: count(raw.total_count) ?? results.length,
  };
}

export interface DownloadLink {
  link: string;
  fileName: string;
  remaining: number | null;
}

export function mapDownloadResponse(raw: unknown): DownloadLink {
  const link = isObject(raw) ? text(raw.link, 4000) : null;
  if (!isObject(raw) || !link) {
    throw new ProviderError('invalid-response', 'OpenSubtitles did not return a download link. Try again later.');
  }
  if (!isProviderUrl(link)) {
    throw new ProviderError('invalid-response', 'OpenSubtitles returned a download link outside opensubtitles.com, so it was not opened.');
  }
  // remaining can be negative once the quota is used up; keep it as reported.
  const remaining = typeof raw.remaining === 'number' && Number.isInteger(raw.remaining) ? raw.remaining : null;
  return { link, fileName: text(raw.file_name) ?? 'subtitles.srt', remaining };
}
