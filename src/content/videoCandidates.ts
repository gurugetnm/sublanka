import type { VideoInfo } from '../shared/messages';

/** Below this rendered area (CSS px²) a video is treated as a thumbnail, preview or ad, not a player. */
const MIN_PLAYER_AREA = 160 * 90;

export interface VideoCandidate extends VideoInfo {
  video: HTMLVideoElement;
  /** Area inside the viewport, in CSS px². */
  visibleArea: number;
}

const ids = new WeakMap<HTMLVideoElement, number>();
let nextId = 1;

/** Stable per-page id, so the popup can refer to a video across messages. */
export function videoId(video: HTMLVideoElement): number {
  let id = ids.get(video);
  if (id === undefined) {
    id = nextId++;
    ids.set(video, id);
  }
  return id;
}

export function isPlaying(video: HTMLVideoElement): boolean {
  return !video.paused && !video.ended;
}

/** Videos in this document that are large enough to be a player, in document order. */
export function findVideoCandidates(): VideoCandidate[] {
  return [...document.querySelectorAll('video')].flatMap((video) => {
    const rect = video.getBoundingClientRect();
    if (rect.width * rect.height < MIN_PLAYER_AREA) return [];
    const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
    const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    return [
      {
        video,
        id: videoId(video),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        playing: isPlaying(video),
        visibleArea: visibleWidth * visibleHeight,
      },
    ];
  });
}

/** Prefers a playing video, then the one the user last started, then the largest visible one. */
export function pickBestVideo(
  candidates: readonly VideoCandidate[],
  lastPlayed: HTMLVideoElement | null,
): VideoCandidate | undefined {
  return [...candidates].sort(
    (a, b) =>
      Number(b.playing) - Number(a.playing) ||
      Number(b.video === lastPlayed) - Number(a.video === lastPlayed) ||
      b.visibleArea - a.visibleArea,
  )[0];
}
