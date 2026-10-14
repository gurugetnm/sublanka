import type { SubtitleCue } from '../subtitles/types';

/**
 * Messages the popup sends to the content script. Every message is answered with a PlayerState.
 * Appearance and offset are not messages: they live in chrome.storage and the content script
 * follows storage changes, so every tab with a loaded track sees the same preferences.
 */
export type SubLankaMessage =
  | { type: 'sublanka:get-state' }
  | { type: 'sublanka:load-track'; fileName: string; cues: SubtitleCue[] }
  | { type: 'sublanka:remove-track' }
  | { type: 'sublanka:set-enabled'; enabled: boolean }
  | { type: 'sublanka:set-demo'; visible: boolean }
  | { type: 'sublanka:select-video'; videoId: number };

/** A video the subtitles can follow. Only facts the page exposes; no invented titles. */
export interface VideoInfo {
  id: number;
  /** Rendered size on the page, in CSS pixels. */
  width: number;
  height: number;
  playing: boolean;
}

export interface PlayerState {
  track: { fileName: string; cueCount: number } | null;
  subtitlesEnabled: boolean;
  demoVisible: boolean;
  videos: VideoInfo[];
  /** Video the subtitles currently follow, or null while none is available. */
  attachedVideoId: number | null;
  /** The page embeds frames, whose videos this version cannot reach. */
  hasFrames: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

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
        typeof value.fileName === 'string' && Array.isArray(value.cues) && value.cues.length > 0 && value.cues.every(isSubtitleCue)
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
