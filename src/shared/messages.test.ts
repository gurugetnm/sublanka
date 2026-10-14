import { describe, expect, it } from 'vitest';
import { isDownloadRequest, isSubLankaMessage, isSubtitleCue } from './messages';

const cue = { index: 0, startTime: 1, endTime: 2, text: 'ආයුබෝවන්' };

describe('isSubLankaMessage', () => {
  it('accepts every valid message', () => {
    for (const message of [
      { type: 'sublanka:get-state' },
      { type: 'sublanka:remove-track' },
      { type: 'sublanka:load-track', fileName: 'a.srt', cues: [cue], source: 'local' },
      { type: 'sublanka:load-track', fileName: 'a.si.srt', cues: [cue], source: 'translated' },
      { type: 'sublanka:set-enabled', enabled: false },
      { type: 'sublanka:set-demo', visible: true },
      { type: 'sublanka:select-video', videoId: 3 },
    ]) {
      expect(isSubLankaMessage(message)).toBe(true);
    }
  });

  it('rejects unknown, malformed or partially valid messages', () => {
    for (const value of [
      null,
      'sublanka:get-state',
      {},
      { type: 'other' },
      { type: 'sublanka:show-subtitle', text: 'old protocol' },
      { type: 'sublanka:load-track', fileName: 'a.srt', cues: [] },
      { type: 'sublanka:load-track', fileName: 'a.srt', cues: [cue, { ...cue, endTime: 0 }] },
      { type: 'sublanka:load-track', cues: [cue] },
      { type: 'sublanka:load-track', fileName: 'a.srt', cues: [cue] },
      { type: 'sublanka:load-track', fileName: 'a.srt', cues: [cue], source: 'somewhere' },
      { type: 'sublanka:set-enabled', enabled: 'yes' },
      { type: 'sublanka:select-video', videoId: 1.5 },
    ]) {
      expect(isSubLankaMessage(value)).toBe(false);
    }
  });
});

describe('isSubtitleCue', () => {
  it('rejects negative, reversed, infinite or empty cues', () => {
    expect(isSubtitleCue(cue)).toBe(true);
    expect(isSubtitleCue({ ...cue, startTime: -1 })).toBe(false);
    expect(isSubtitleCue({ ...cue, endTime: 1 })).toBe(false);
    expect(isSubtitleCue({ ...cue, endTime: Infinity })).toBe(false);
    expect(isSubtitleCue({ ...cue, text: '' })).toBe(false);
  });

  it('accepts a keypad position 1-9 and rejects anything else', () => {
    expect(isSubtitleCue({ ...cue, align: 9 })).toBe(true);
    expect(isSubtitleCue({ ...cue, align: 0 })).toBe(false);
    expect(isSubtitleCue({ ...cue, align: 2.5 })).toBe(false);
    expect(isSubtitleCue({ ...cue, align: '9' })).toBe(false);
    expect(isSubtitleCue({ ...cue, index: '0' })).toBe(false);
  });
});

describe('isDownloadRequest', () => {
  it('accepts only complete download requests', () => {
    const request = { type: 'sublanka:download-subtitle', tabId: 1, provider: 'opensubtitles', downloadId: '9', label: 'Film' };
    expect(isDownloadRequest(request)).toBe(true);
    expect(isDownloadRequest({ ...request, tabId: '1' })).toBe(false);
    expect(isDownloadRequest({ ...request, downloadId: '' })).toBe(false);
    expect(isDownloadRequest({ ...request, type: 'sublanka:load-track' })).toBe(false);
  });
});
