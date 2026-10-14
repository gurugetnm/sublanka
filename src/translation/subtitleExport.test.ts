import { describe, expect, it } from 'vitest';
import { parseSrt } from '../subtitles/srtParser';
import type { SubtitleCue } from '../subtitles/types';
import { parseVtt } from '../subtitles/vttParser';
import { exportFileName, formatTimestamp, serializeComparison, serializeCues } from './subtitleExport';

const CUES: SubtitleCue[] = [
  { index: 0, startTime: 72.5, endTime: 75.2, text: 'මම කවදාවත් හිතුවේ නෑ ඔයාව ආයෙත් දකින්න ලැබෙයි කියලා.' },
  // Overlaps the next cue and spans two lines.
  { index: 1, startTime: 80, endTime: 84, text: 'පළමු පේළිය\nදෙවන පේළිය' },
  { index: 2, startTime: 82, endTime: 83.999, text: '<script>alert(1)</script> & --> ඊළඟ' },
  { index: 3, startTime: 3723.0005, endTime: 3725, text: 'පැය ගණනකට පසු', align: 8 },
];

describe('formatTimestamp', () => {
  it('formats SRT and WebVTT timestamps with hours and milliseconds', () => {
    expect(formatTimestamp(72.5, ',')).toBe('00:01:12,500');
    expect(formatTimestamp(3723.25, '.')).toBe('01:02:03.250');
    expect(formatTimestamp(59.9996, ',')).toBe('00:01:00,000');
  });
});

describe('serializeCues', () => {
  it.each(['srt', 'vtt'] as const)('round-trips through the existing %s parser with identical timing, order and Sinhala text', (format) => {
    const text = serializeCues(CUES, format);
    const parsed = (format === 'srt' ? parseSrt : parseVtt)(text);

    expect(parsed.warnings).toEqual([]);
    expect(parsed.cues.map((cue) => [cue.startTime, cue.endTime])).toEqual(CUES.map((cue) => [cue.startTime, cue.endTime].map((t) => Math.round(t * 1000) / 1000)));
    expect(parsed.cues[0]?.text).toBe(CUES[0]?.text);
    expect(parsed.cues[1]?.text).toBe('පළමු පේළිය\nදෙවන පේළිය');
  });

  it('never lets cue text break the file structure', () => {
    const vtt = serializeCues(CUES, 'vtt');
    expect(vtt.startsWith('WEBVTT\n\n1\n00:01:12.500 --> 00:01:15.200\n')).toBe(true);
    expect(vtt).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; → ඊළඟ');
    // The parser decodes the escapes back to plain text (shown with textContent, never as HTML).
    expect(parseVtt(vtt).cues[2]?.text).toBe('<script>alert(1)</script> & → ඊළඟ');
    expect(serializeCues([{ index: 0, startTime: 1, endTime: 2, text: 'a\n\n\nb' }], 'srt')).toBe('1\n00:00:01,000 --> 00:00:02,000\na\nb\n');
  });

  it('keeps a pinned position in SRT only', () => {
    expect(serializeCues(CUES, 'srt')).toContain('{\\an8}පැය ගණනකට පසු');
    expect(parseSrt(serializeCues(CUES, 'srt')).cues[3]?.align).toBe(8);
    expect(serializeCues(CUES, 'vtt')).not.toContain('\\an8');
  });
});

describe('serializeComparison', () => {
  it('lists timing, English and Sinhala per cue', () => {
    expect(serializeComparison([{ index: 0, startTime: 1, endTime: 2, text: 'Hi.\nThere.' }], ['ආයුබෝවන්.'])).toBe(
      '#1  00:00:01.000 --> 00:00:02.000\nEN: Hi. / There.\nSI: ආයුබෝවන්.\n',
    );
    expect(serializeComparison([{ index: 0, startTime: 1, endTime: 2, text: 'Hi.' }], [null])).toContain('SI: (not translated)');
  });
});

describe('exportFileName', () => {
  it.each([
    ['interstellar.srt', 'srt', 'interstellar.si.srt'],
    ['Interstellar.2014.en.srt', 'vtt', 'Interstellar.2014.si.vtt'],
    ['show_english.vtt', 'srt', 'show.si.srt'],
    ['a/b:c*?.srt', 'srt', 'a_b_c_.si.srt'],
    ['..srt', 'review.txt', 'subtitles.si.review.txt'],
  ] as const)('%s → %s', (input, format, expected) => {
    expect(exportFileName(input, format)).toBe(expected);
  });
});
