import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_SUBTITLE_TEXT, OVERLAY_TAG } from '../shared/constants';
import type { SubLankaMessage } from '../shared/messages';
import { DEFAULT_SETTINGS } from '../shared/settings';
import type { SubtitleCue } from '../subtitles/types';
import { PlaybackController } from './playbackController';

const CUES: SubtitleCue[] = [
  { index: 0, startTime: 1, endTime: 3, text: 'පළමු පේළිය' },
  { index: 1, startTime: 5, endTime: 8, text: 'දෙවන පේළිය' },
  { index: 2, startTime: 6, endTime: 7, text: 'overlap' },
  { index: 3, startTime: 9, endTime: 20, text: 'until the end' },
];

/** A jsdom <video> whose playback state the test controls; jsdom does not play media. */
function fakeVideo({ width = 640, height = 360 } = {}) {
  const video = document.createElement('video');
  const media = { currentTime: 0, paused: true, ended: false };
  for (const key of Object.keys(media) as (keyof typeof media)[]) {
    Object.defineProperty(video, key, { get: () => media[key], configurable: true });
  }
  video.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, width, height, right: width, bottom: height, toJSON: () => ({}) });
  document.body.append(video);
  const emit = (type: string) => video.dispatchEvent(new Event(type));
  return {
    video,
    emit,
    /** Moves the playhead without firing events, like real playback between timeupdates. */
    setTime: (seconds: number) => (media.currentTime = seconds),
    seek(seconds: number) {
      media.currentTime = seconds;
      emit('seeking');
      emit('seeked');
    },
    play() {
      media.paused = false;
      media.ended = false;
      emit('play');
    },
    pause() {
      media.paused = true;
      emit('pause');
    },
    end() {
      media.paused = true;
      media.ended = true;
      emit('ended');
    },
  };
}

const shownText = () => {
  const overlay = document.querySelector(OVERLAY_TAG);
  return overlay ? (overlay.shadowRoot?.querySelector('.sublanka-subtitle')?.textContent ?? '') : null;
};

const load = (cues = CUES, fileName = 'film.si.srt'): SubLankaMessage => ({ type: 'sublanka:load-track', fileName, cues, source: 'local' });

let controller: PlaybackController;
let frames: Map<number, FrameRequestCallback>;

beforeEach(() => {
  frames = new Map();
  let nextFrame = 1;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(nextFrame, callback);
    return nextFrame++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  controller = new PlaybackController();
});

afterEach(() => {
  controller.destroy();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

function runFrame() {
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(performance.now());
}

describe('PlaybackController synchronization', () => {
  it('shows the cue at the video currentTime as soon as a track loads', () => {
    const player = fakeVideo();
    player.setTime(2);
    controller.handle(load());
    expect(shownText()).toBe('පළමු පේළිය');
  });

  it('shows nothing during gaps but keeps the overlay ready', () => {
    const player = fakeVideo();
    controller.handle(load());
    expect(shownText()).toBe('');
    player.seek(4);
    expect(shownText()).toBe('');
  });

  it('shows the right cue after seeking forward and backward', () => {
    const player = fakeVideo();
    controller.handle(load());
    player.seek(5.5);
    expect(shownText()).toBe('දෙවන පේළිය');
    player.seek(1.5);
    expect(shownText()).toBe('පළමු පේළිය');
  });

  it('shows every overlapping cue, in file order', () => {
    const player = fakeVideo();
    controller.handle(load());
    player.seek(6.5);
    expect(shownText()).toBe('දෙවන පේළිය\noverlap');
  });

  it('follows playback frame by frame and stops scheduling frames when paused', () => {
    const player = fakeVideo();
    controller.handle(load());
    player.play();
    expect(frames.size).toBe(1);

    player.setTime(1.1);
    runFrame();
    expect(shownText()).toBe('පළමු පේළිය');
    expect(frames.size).toBe(1);

    player.setTime(3.2);
    runFrame();
    expect(shownText()).toBe('');

    player.pause();
    expect(frames.size).toBe(0);
  });

  it('keeps the current cue visible while paused and resumes correctly', () => {
    const player = fakeVideo();
    controller.handle(load());
    player.play();
    player.setTime(2);
    runFrame();
    player.pause();
    expect(shownText()).toBe('පළමු පේළිය');

    player.play();
    player.setTime(5.2);
    runFrame();
    expect(shownText()).toBe('දෙවන පේළිය');
  });

  it('reads currentTime directly, so playback rate changes need no special timing', () => {
    const player = fakeVideo();
    controller.handle(load());
    player.play();
    player.setTime(2.9);
    player.emit('ratechange');
    expect(shownText()).toBe('පළමු පේළිය');
    player.setTime(5.4); // at 2x the playhead jumps further per frame
    runFrame();
    expect(shownText()).toBe('දෙවන පේළිය');
  });

  it('hides subtitles when the video ends, even inside a cue', () => {
    const player = fakeVideo();
    controller.handle(load());
    player.seek(10);
    expect(shownText()).toBe('until the end');
    player.end();
    expect(shownText()).toBe('');
    expect(frames.size).toBe(0);
  });

  it('applies the offset immediately: positive shows subtitles later', () => {
    const player = fakeVideo();
    controller.handle(load());
    player.seek(4);
    expect(shownText()).toBe('');

    // Cue 1 starts at 1s; with +2s it appears at 3s, so it is on screen at 4s.
    controller.applySettings({ ...DEFAULT_SETTINGS, offset: 2 });
    expect(shownText()).toBe('පළමු පේළිය');

    // With -1s, the cue starting at 5s is already showing at 4s.
    controller.applySettings({ ...DEFAULT_SETTINGS, offset: -1 });
    expect(shownText()).toBe('දෙවන පේළිය');
  });

  it('turns subtitles off and on without losing the track', () => {
    const player = fakeVideo();
    player.setTime(2);
    controller.handle(load());
    const off = controller.handle({ type: 'sublanka:set-enabled', enabled: false });
    expect(shownText()).toBeNull();
    expect(off).toMatchObject({ subtitlesEnabled: false, track: { cueCount: 4 } });
    controller.handle({ type: 'sublanka:set-enabled', enabled: true });
    expect(shownText()).toBe('පළමු පේළිය');
  });

  it('replaces the loaded track', () => {
    const player = fakeVideo();
    player.setTime(2);
    controller.handle(load());
    const state = controller.handle(load([{ index: 0, startTime: 0, endTime: 5, text: 'නව ගොනුව' }], 'new.vtt'));
    expect(shownText()).toBe('නව ගොනුව');
    expect(state.track).toEqual({ fileName: 'new.vtt', cueCount: 1, source: 'local' });
  });

  it('treats a downloaded track exactly like a local file, and either can replace the other', () => {
    const player = fakeVideo();
    player.setTime(2);
    controller.handle(load());
    const downloaded = controller.handle({
      type: 'sublanka:load-track',
      fileName: 'Film.srt',
      source: 'opensubtitles',
      cues: [{ index: 0, startTime: 0, endTime: 5, text: 'බාගත කළ' }],
    });
    expect(downloaded.track).toEqual({ fileName: 'Film.srt', cueCount: 1, source: 'opensubtitles' });
    expect(shownText()).toBe('බාගත කළ');

    controller.applySettings({ ...DEFAULT_SETTINGS, offset: 1.5 });
    player.setTime(6);
    expect(shownText()).toBe('බාගත කළ'); // cue ends at 5 s; +1.5 s offset keeps it until 6.5 s

    const local = controller.handle(load());
    expect(local.track).toMatchObject({ fileName: 'film.si.srt', source: 'local' });
  });

  it('removes the overlay and stops following the video when the track is removed', () => {
    const player = fakeVideo();
    player.setTime(2);
    controller.handle(load());
    const state = controller.handle({ type: 'sublanka:remove-track' });
    expect(state).toMatchObject({ track: null, attachedVideoId: null });
    expect(shownText()).toBeNull();
    player.play();
    player.seek(6);
    expect(shownText()).toBeNull();
    expect(frames.size).toBe(0);
  });

  it('lets the demo line override subtitles, then returns to the cue', () => {
    const player = fakeVideo();
    player.setTime(2);
    controller.handle(load());
    controller.handle({ type: 'sublanka:set-demo', visible: true });
    expect(shownText()).toBe(DEMO_SUBTITLE_TEXT);
    controller.handle({ type: 'sublanka:set-demo', visible: false });
    expect(shownText()).toBe('පළමු පේළිය');
  });

  it('does not touch the DOM when the text has not changed', () => {
    const player = fakeVideo();
    player.setTime(1.5);
    controller.handle(load());
    const textNode = document.querySelector(OVERLAY_TAG)?.shadowRoot?.querySelector('.sublanka-subtitle')?.firstChild;
    player.setTime(2.5);
    player.emit('timeupdate');
    expect(document.querySelector(OVERLAY_TAG)?.shadowRoot?.querySelector('.sublanka-subtitle')?.firstChild).toBe(textNode);
  });

  it('registers media listeners once, however often the popup reconnects', () => {
    const player = fakeVideo();
    const added = vi.spyOn(player.video, 'addEventListener');
    controller.handle(load());
    controller.handle({ type: 'sublanka:get-state' });
    controller.handle(load());
    controller.handle({ type: 'sublanka:get-state' });
    expect(added.mock.calls.filter(([type]) => type === 'timeupdate')).toHaveLength(1);
  });
});

describe('PlaybackController video selection', () => {
  it('ignores tiny preview videos and reports real candidates', () => {
    fakeVideo({ width: 120, height: 68 });
    const main = fakeVideo({ width: 1280, height: 720 });
    const state = controller.handle(load());
    expect(state.videos).toHaveLength(1);
    expect(state.videos[0]).toMatchObject({ width: 1280, height: 720, playing: false });
    expect(state.attachedVideoId).toBe(state.videos[0]?.id);
    main.seek(2);
    expect(shownText()).toBe('පළමු පේළිය');
  });

  it('prefers the playing video over a larger paused one', () => {
    fakeVideo({ width: 1280, height: 720 });
    const small = fakeVideo({ width: 480, height: 270 });
    small.play();
    small.seek(2);
    controller.handle(load());
    expect(shownText()).toBe('පළමු පේළිය');
  });

  it('follows the video the user starts, unless one was picked in the popup', () => {
    const first = fakeVideo();
    const second = fakeVideo();
    first.setTime(2);
    second.setTime(5.5);
    const state = controller.handle(load());
    expect(shownText()).toBe('පළමු පේළිය');

    second.play();
    expect(shownText()).toBe('දෙවන පේළිය');

    const firstId = state.videos[0]?.id ?? -1;
    expect(controller.handle({ type: 'sublanka:select-video', videoId: firstId }).attachedVideoId).toBe(firstId);
    expect(shownText()).toBe('පළමු පේළිය');
    second.seek(6.5);
    first.pause();
    second.play();
    expect(shownText()).toBe('පළමු පේළිය');
  });

  it('places the overlay on the attached video and moves it with the selection', () => {
    fakeVideo({ width: 1280, height: 720 });
    const small = fakeVideo({ width: 480, height: 270 });
    const state = controller.handle(load());
    const hostWidth = () => document.querySelector<HTMLElement>(OVERLAY_TAG)?.style.width;
    expect(hostWidth()).toBe('1280px');

    const smallId = state.videos.find((video) => video.width === 480)?.id ?? -1;
    controller.handle({ type: 'sublanka:select-video', videoId: smallId });
    expect(hostWidth()).toBe('480px');
    small.seek(2);
    expect(document.querySelectorAll(OVERLAY_TAG)).toHaveLength(1);

    controller.handle({ type: 'sublanka:remove-track' });
    expect(document.querySelector(OVERLAY_TAG)).toBeNull();
  });

  it('shows a corner credit apart from the dialogue under it', () => {
    const player = fakeVideo();
    const credit: SubtitleCue = { index: 0, startTime: 0, endTime: 18000, text: '#Credit', align: 9 };
    controller.applySettings({ ...DEFAULT_SETTINGS, hideCredits: false });
    controller.handle(load([credit, { index: 1, startTime: 1, endTime: 3, text: 'දෙවන' }]));
    const corner = () => document.querySelector(OVERLAY_TAG)?.shadowRoot?.querySelector('[data-align="9"]')?.textContent;
    expect(shownText()).toBe('');
    expect(corner()).toBe('#Credit');
    player.seek(2);
    expect(shownText()).toBe('දෙවන');
    expect(corner()).toBe('#Credit');
  });

  it('hides credit cues that last over a minute, and shows them again when the setting is off', () => {
    const player = fakeVideo();
    const credit: SubtitleCue = { index: 0, startTime: 0, endTime: 18000, text: '#Credit', align: 9 };
    controller.handle(load([credit, { index: 1, startTime: 1, endTime: 3, text: 'දෙවන' }]));
    const corner = () => document.querySelector(OVERLAY_TAG)?.shadowRoot?.querySelector('[data-align="9"]')?.textContent ?? '';
    player.seek(2);
    expect(shownText()).toBe('දෙවන');
    expect(corner()).toBe('');

    controller.applySettings({ ...DEFAULT_SETTINGS, hideCredits: false });
    expect(corner()).toBe('#Credit');
  });

  it('ignores selection of an unknown video', () => {
    fakeVideo();
    const state = controller.handle(load());
    expect(controller.handle({ type: 'sublanka:select-video', videoId: 99999 }).attachedVideoId).toBe(state.attachedVideoId);
  });

  it('switches to a replacement video when the current one is removed', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const first = fakeVideo();
    first.setTime(2);
    controller.handle(load());
    expect(shownText()).toBe('පළමු පේළිය');

    first.video.remove();
    const replacement = fakeVideo();
    replacement.setTime(5.5);
    vi.advanceTimersByTime(1000);
    expect(shownText()).toBe('දෙවන පේළිය');
  });

  it('waits for a video when none is available, then attaches to it', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const state = controller.handle(load());
    expect(state).toMatchObject({ videos: [], attachedVideoId: null, track: { cueCount: 4 } });

    const late = fakeVideo();
    late.setTime(2);
    vi.advanceTimersByTime(1000);
    expect(controller.handle({ type: 'sublanka:get-state' }).attachedVideoId).not.toBeNull();
    expect(shownText()).toBe('පළමු පේළිය');
  });

  it('reports embedded frames so the popup can explain unreachable videos', () => {
    document.body.append(document.createElement('iframe'));
    expect(controller.handle({ type: 'sublanka:get-state' })).toMatchObject({ videos: [], hasFrames: true, track: null });
  });
});
