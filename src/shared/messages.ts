import type { SubtitleCue } from '../subtitles/types';

/**
 * Messages the popup sends to the content script. Every message is answered with a PlayerState.
 * Appearance and offset are not messages: they live in chrome.storage and the content script
 * follows storage changes, so every tab with a loaded track sees the same preferences.
 */
export type SubLankaMessage =
  | { type: 'sublanka:get-state' }
  | { type: 'sublanka:load-track'; fileName: string; cues: SubtitleCue[]; source: SubtitleSource }
  | { type: 'sublanka:remove-track' }
  | { type: 'sublanka:set-enabled'; enabled: boolean }
  | { type: 'sublanka:set-demo'; visible: boolean }
  | { type: 'sublanka:select-video'; videoId: number };

/** Where a loaded track came from. The playback engine treats every source the same. */
export const SUBTITLE_SOURCES = ['local', 'opensubtitles', 'translated'] as const;
export type SubtitleSource = (typeof SUBTITLE_SOURCES)[number];

/** Asks the content script for movie/episode details from the page's own metadata. Answered with DetectedMedia | null. */
export const DETECT_MEDIA_MESSAGE = { type: 'sublanka:detect-media' } as const;

/** Popup → background service worker: download a search result and load it into a tab. */
export interface DownloadRequest {
  type: 'sublanka:download-subtitle';
  tabId: number;
  provider: string;
  downloadId: string;
  /** Shown in progress and result notices. */
  label: string;
}

/** Progress of the latest download, kept in chrome.storage.session so a reopened popup can show it. */
export interface DownloadStatus {
  tabId: number;
  downloadId: string;
  label: string;
  phase: 'loading' | 'loaded' | 'failed';
  message: string;
  /** Downloads left today as reported by the provider, when it says. */
  remaining: number | null;
  startedAt: number;
}

export const DOWNLOAD_STATUS_KEY = 'downloadStatus';

/** A video the subtitles can follow. Only facts the page exposes; no invented titles. */
export interface VideoInfo {
  id: number;
  /** Rendered size on the page, in CSS pixels. */
  width: number;
  height: number;
  playing: boolean;
}

export interface PlayerState {
  track: { fileName: string; cueCount: number; source: SubtitleSource } | null;
  subtitlesEnabled: boolean;
  demoVisible: boolean;
  videos: VideoInfo[];
  /** Video the subtitles currently follow, or null while none is available. */
  attachedVideoId: number | null;
  /** The page embeds frames, whose videos this version cannot reach. */
  hasFrames: boolean;
}

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export function isSubtitleCue(value: unknown): value is SubtitleCue {
  return (
    isRecord(value) &&
    Number.isInteger(value.index) &&
    typeof value.startTime === 'number' &&
    typeof value.endTime === 'number' &&
    Number.isFinite(value.endTime) &&
    value.startTime >= 0 &&
    value.endTime > value.startTime &&
    typeof value.text === 'string' &&
    value.text !== '' &&
    (value.align === undefined || (Number.isInteger(value.align) && Number(value.align) >= 1 && Number(value.align) <= 9))
  );
}

export function isSubLankaMessage(value: unknown): value is SubLankaMessage {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case 'sublanka:get-state':
    case 'sublanka:remove-track':
      return true;
    case 'sublanka:load-track':
      return (
        typeof value.fileName === 'string' &&
        SUBTITLE_SOURCES.some((source) => source === value.source) &&
        Array.isArray(value.cues) &&
        value.cues.length > 0 &&
        value.cues.every(isSubtitleCue)
      );
    case 'sublanka:set-enabled':
      return typeof value.enabled === 'boolean';
    case 'sublanka:set-demo':
      return typeof value.visible === 'boolean';
    case 'sublanka:select-video':
      return Number.isInteger(value.videoId);
    default:
      return false;
  }
}

/** Light shape check on content-script replies, mainly to catch a stale script from a reloaded extension. */
export function isPlayerState(value: unknown): value is PlayerState {
  return isRecord(value) && Array.isArray(value.videos) && typeof value.subtitlesEnabled === 'boolean';
}

export function isDownloadRequest(value: unknown): value is DownloadRequest {
  return (
    isRecord(value) &&
    value.type === 'sublanka:download-subtitle' &&
    Number.isInteger(value.tabId) &&
    typeof value.provider === 'string' &&
    typeof value.downloadId === 'string' &&
    value.downloadId !== '' &&
    typeof value.label === 'string'
  );
}

export function isDownloadStatus(value: unknown): value is DownloadStatus {
  return (
    isRecord(value) &&
    Number.isInteger(value.tabId) &&
    typeof value.downloadId === 'string' &&
    typeof value.label === 'string' &&
    (value.phase === 'loading' || value.phase === 'loaded' || value.phase === 'failed') &&
    typeof value.message === 'string' &&
    (value.remaining === null || typeof value.remaining === 'number') &&
    typeof value.startedAt === 'number'
  );
}
