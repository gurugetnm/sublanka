import { DEMO_SUBTITLE_TEXT } from '../shared/constants';
import type { PlayerState, SubLankaMessage } from '../shared/messages';
import { DEFAULT_SETTINGS, type SubtitleSettings } from '../shared/settings';
import { activeLayout, createCueIndex, type CueIndex } from '../subtitles/subtitleSearch';
import type { SubtitleLayout } from '../subtitles/types';
import { hideSubtitle, setOverlayAppearance, setOverlayVideo, showSubtitle } from './subtitleOverlay';
import { findVideoCandidates, pickBestVideo, videoId } from './videoCandidates';

const MEDIA_EVENTS = [
  'play',
  'playing',
  'pause',
  'seeking',
  'seeked',
  'timeupdate',
  'ratechange',
  'ended',
  'emptied',
  'loadedmetadata',
] as const;

/** With hideCredits, cues on screen longer than this (seconds) are skipped; no line of dialogue lasts a minute. */
const MAX_DIALOGUE_SECONDS = 60;

/** How often to notice a removed or replaced video element while a track is loaded. */
const VIDEO_CHECK_MS = 1000;

/**
 * Owns the loaded track for this page and keeps the overlay in step with one video's
 * currentTime. One instance per page; the track lives only in memory.
 */
export class PlaybackController {
  private track: { fileName: string; cues: CueIndex } | null = null;
  private subtitlesEnabled = true;
  private demoVisible = false;
  private settings: SubtitleSettings = DEFAULT_SETTINGS;
  private video: HTMLVideoElement | null = null;
  /** The user picked this video in the popup; do not switch away automatically. */
  private videoPinned = false;
  private lastPlayed: HTMLVideoElement | null = null;
  private frame: number | null = null;
  private videoCheck: ReturnType<typeof setInterval> | null = null;
  /** JSON of what the overlay shows now: null = no overlay. */
  private rendered: string | null = null;

  constructor() {
    // 'play' does not bubble, so listen in the capture phase to see every video the user starts.
    document.addEventListener('play', this.onPagePlay, true);
  }

  handle(message: SubLankaMessage): PlayerState {
    switch (message.type) {
      case 'sublanka:load-track':
        this.track = { fileName: message.fileName, cues: createCueIndex(message.cues) };
        this.subtitlesEnabled = true;
        this.ensureVideo();
        this.videoCheck ??= setInterval(this.checkVideo, VIDEO_CHECK_MS);
        break;
      case 'sublanka:remove-track':
        this.track = null;
        this.stopVideoCheck();
        this.attach(null);
        this.videoPinned = false;
        break;
      case 'sublanka:set-enabled':
        this.subtitlesEnabled = message.enabled;
        break;
      case 'sublanka:set-demo':
        this.demoVisible = message.visible;
        break;
      case 'sublanka:select-video': {
        const picked = findVideoCandidates().find((candidate) => candidate.id === message.videoId);
        if (picked) {
          this.videoPinned = true;
          this.attach(picked.video);
        }
        break;
      }
      case 'sublanka:get-state':
        if (this.track) this.ensureVideo();
        break;
    }
    this.update();
    return this.state();
  }

  applySettings(settings: SubtitleSettings): void {
    this.settings = settings;
    setOverlayAppearance(settings);
    this.update();
  }

  /** Removes every listener, timer and the overlay. */
  destroy(): void {
    document.removeEventListener('play', this.onPagePlay, true);
    this.stopVideoCheck();
    this.attach(null);
    this.track = null;
    this.demoVisible = false;
    this.update();
  }

  private state(): PlayerState {
    return {
      track: this.track && { fileName: this.track.fileName, cueCount: this.track.cues.cues.length },
      subtitlesEnabled: this.subtitlesEnabled,
      demoVisible: this.demoVisible,
      videos: findVideoCandidates().map(({ id, width, height, playing }) => ({ id, width, height, playing })),
      attachedVideoId: this.video ? videoId(this.video) : null,
      hasFrames: document.querySelector('iframe, frame') !== null,
    };
  }

  /** Keeps the current video while it is in the page; otherwise picks the best candidate. */
  private ensureVideo(): void {
    if (this.video?.isConnected) return;
    this.videoPinned = false;
    this.attach(pickBestVideo(findVideoCandidates(), this.lastPlayed)?.video ?? null);
  }

  private attach(video: HTMLVideoElement | null): void {
    if (video === this.video) return;
    for (const type of MEDIA_EVENTS) this.video?.removeEventListener(type, this.update);
    this.stopFrames();
    this.video = video;
    setOverlayVideo(video);
    for (const type of MEDIA_EVENTS) video?.addEventListener(type, this.update);
  }

  /** Subtitles follow the video the user starts, unless they picked one in the popup. */
  private onPagePlay = (event: Event): void => {
    if (!(event.target instanceof HTMLVideoElement)) return;
    this.lastPlayed = event.target;
    if (!this.track || this.videoPinned || event.target === this.video) return;
    if (findVideoCandidates().some((candidate) => candidate.video === event.target)) {
      this.attach(event.target);
      this.update();
    }
  };

  private checkVideo = (): void => {
    const before = this.video;
    this.ensureVideo();
    if (this.video !== before) this.update();
  };

  private stopVideoCheck(): void {
    if (this.videoCheck !== null) clearInterval(this.videoCheck);
    this.videoCheck = null;
  }

  private currentLayout(): SubtitleLayout | null {
    if (this.demoVisible) return { main: DEMO_SUBTITLE_TEXT, placed: {} };
    if (!this.track || !this.subtitlesEnabled) return null;
    if (!this.video || this.video.ended) return { main: '', placed: {} };
    const maxDuration = this.settings.hideCredits ? MAX_DIALOGUE_SECONDS : Infinity;
    return activeLayout(this.track.cues, this.video.currentTime - this.settings.offset, maxDuration);
  }

  /** Renders the text for the video's current time; runs on media events and every frame during playback. */
  private update = (): void => {
    const layout = this.currentLayout();
    const key = layout && JSON.stringify(layout);
    if (key !== this.rendered) {
      this.rendered = key;
      if (layout === null) hideSubtitle();
      else showSubtitle(layout.main, layout.placed);
    }

    // timeupdate fires only about 4 times a second, so follow the video frame by frame while it plays.
    const playing = this.video !== null && !this.video.paused && !this.video.ended;
    if (playing && this.track && this.subtitlesEnabled && !this.demoVisible) this.frame ??= requestAnimationFrame(this.onFrame);
    else this.stopFrames();
  };

  private onFrame = (): void => {
    this.frame = null;
    this.update();
  };

  private stopFrames(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }
}
