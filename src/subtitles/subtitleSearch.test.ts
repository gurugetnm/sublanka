import { describe, expect, it } from 'vitest';
import { activeText, createCueIndex, findActiveCues } from './subtitleSearch';
import type { SubtitleCue } from './types';

const cue = (index: number, startTime: number, endTime: number, text = `cue ${index}`): SubtitleCue => ({
  index,
  startTime,
  endTime,
  text,
});

describe('findActiveCues', () => {
  const index = createCueIndex([cue(0, 1, 3), cue(1, 5, 6)]);

  it('includes the start time and excludes the end time', () => {
    expect(activeText(index, 1)).toBe('cue 0');
    expect(activeText(index, 2.999)).toBe('cue 0');
    expect(activeText(index, 3)).toBe('');
  });

  it('finds nothing before the first cue, in gaps, or after the last cue', () => {
    expect(findActiveCues(index, 0)).toEqual([]);
    expect(findActiveCues(index, 4)).toEqual([]);
    expect(findActiveCues(index, 100)).toEqual([]);
    expect(findActiveCues(createCueIndex([]), 1)).toEqual([]);
  });

  it('returns every overlapping cue in file order', () => {
    // File order: a long cue, a later short one, then one that starts earliest but is last in the file.
    const overlapping = createCueIndex([cue(0, 2, 20, 'long'), cue(1, 4, 6, 'short'), cue(2, 1, 10, 'early')]);
    expect(activeText(overlapping, 5)).toBe('long\nshort\nearly');
    expect(activeText(overlapping, 12)).toBe('long');
  });

  it('finds a long cue that started far before many short ones', () => {
    const cues = [cue(0, 0, 1000, 'whole film')];
    for (let i = 1; i <= 500; i++) cues.push(cue(i, i, i + 0.5));
    expect(activeText(createCueIndex(cues), 250.75)).toBe('whole film');
    expect(activeText(createCueIndex(cues), 250.25)).toBe('whole film\ncue 250');
  });

  it('matches a naive scan on a large file with overlaps', () => {
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const cues = Array.from({ length: 10000 }, (_, i) => {
      const start = random() * 20000;
      return cue(i, start, start + 0.5 + random() * 8);
    });
    const index = createCueIndex(cues);
    for (let n = 0; n < 2000; n++) {
      const time = random() * 20000;
      const expected = cues.filter((c) => c.startTime <= time && time < c.endTime).map((c) => c.index);
      expect(findActiveCues(index, time).map((c) => c.index)).toEqual(expected);
    }
  });
});
