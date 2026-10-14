import { describe, expect, it } from 'vitest';
import malformedSrt from '../../test-page/fixtures/malformed-si.srt?raw';
import sampleSrt from '../../test-page/fixtures/sample-si.srt?raw';
import { parseSrt } from './srtParser';
import { SubtitleParseError } from './types';

describe('parseSrt', () => {
  it('parses the Sinhala sample fixture, which has a BOM and CRLF line endings', () => {
    expect(sampleSrt.startsWith('﻿')).toBe(true);
    expect(sampleSrt).toContain('\r\n');

    const { cues, warnings } = parseSrt(sampleSrt);
    expect(warnings).toEqual([]);
    expect(cues).toHaveLength(11);
    expect(cues[0]).toEqual({ index: 0, startTime: 2, endTime: 5, text: '(0:02) සුබ උදෑසනක්! අද කාලගුණය හරිම ලස්සනයි.' });
    expect(cues[1]?.text).toBe('(0:06) මම කවදාවත් හිතුවේ නෑ ඔයාව ආයෙත් දකින්න ලැබෙයි කියලා.');
    expect(cues[1]?.endTime).toBe(9.5);
    expect(cues.at(-1)).toMatchObject({ startTime: 115, endTime: 119.5 });
  });

  it('keeps multiline text and strips formatting tags', () => {
    const { cues } = parseSrt(sampleSrt);
    expect(cues[2]?.text).toBe('(0:10) අපි ගඟ අයිනේ ඇවිදින්න යමුද?\nහොඳයි, හැබැයි මුලින්ම තේ එකක් බොමු.');
    expect(cues[3]?.text).toBe('(0:15) මෙය SubLanka පරීක්ෂණ උපසිරැසියකි.');
  });

  it('handles mixed CRLF, LF and CR line endings and whitespace-only separator lines', () => {
    const { cues } = parseSrt('1\r\n00:00:01,000 --> 00:00:02,000\r\nඑක\r\n \t\n2\n00:00:03,000 --> 00:00:04,000\nදෙක\r\r3\r00:00:05,000 --> 00:00:06,000\rතුන');
    expect(cues.map((cue) => cue.text)).toEqual(['එක', 'දෙක', 'තුන']);
  });

  it('accepts missing or non-numeric sequence numbers and unusual spacing', () => {
    const { cues, warnings } = parseSrt('00:00:01,000-->00:00:02,500\nno number\n\nabc\n  00:00:03,000   -->   00:00:04,000  X1:10 X2:20\n  odd id  ');
    expect(warnings).toEqual([]);
    expect(cues).toEqual([
      { index: 0, startTime: 1, endTime: 2.5, text: 'no number' },
      { index: 1, startTime: 3, endTime: 4, text: 'odd id' },
    ]);
  });

  it('sorts by start time while index keeps file order', () => {
    const { cues } = parseSrt('1\n00:00:05,000 --> 00:00:06,000\nlater\n\n2\n00:00:01,000 --> 00:00:02,000\nearlier');
    expect(cues.map((cue) => [cue.text, cue.index])).toEqual([
      ['earlier', 1],
      ['later', 0],
    ]);
  });

  it('keeps overlapping cues', () => {
    const { cues } = parseSrt('1\n00:00:01,000 --> 00:00:05,000\nA\n\n2\n00:00:02,000 --> 00:00:03,000\nB');
    expect(cues).toHaveLength(2);
  });

  it('decodes common entities and never interprets markup', () => {
    const { cues } = parseSrt('1\n00:00:01,000 --> 00:00:02,000\n<b>Tom &amp; Jerry</b> {\\an8}&lt;3 <script>alert(1)</script>');
    expect(cues[0]?.text).toBe('Tom & Jerry <3 alert(1)');
  });

  it('recovers from the malformed fixture with one warning per skipped block', () => {
    const { cues, warnings } = parseSrt(malformedSrt);
    expect(cues.map((cue) => cue.startTime)).toEqual([2, 25, 30]);
    expect(warnings).toHaveLength(5);
    expect(warnings.join('\n')).toMatch(/Block 2: invalid timestamp/);
    expect(warnings.join('\n')).toMatch(/Block 3: end time is not after start time/);
    expect(warnings.join('\n')).toMatch(/Block 4: no timing line/);
    expect(warnings.join('\n')).toMatch(/Block 5: no subtitle text/);
    expect(warnings.join('\n')).toMatch(/Block 7: invalid timestamp/);
  });

  it('rejects invalid timestamps', () => {
    expect(() => parseSrt('1\n00:00:61,000 --> 00:00:62,000\nbad seconds')).toThrow(SubtitleParseError);
    expect(() => parseSrt('1\n00:00:02,000 --> 00:00:02,000\nzero length')).toThrow(/No valid subtitle cues/);
  });

  it('rejects empty and entirely invalid files instead of reporting success', () => {
    expect(() => parseSrt('')).toThrow('The file is empty.');
    expect(() => parseSrt('﻿ \r\n\n')).toThrow('The file is empty.');
    expect(() => parseSrt('just some text\nwith no timings')).toThrow(/No valid subtitle cues found\. Block 1/);
  });

  it('parses a long file quickly', () => {
    const blocks = Array.from({ length: 5000 }, (_, i) => {
      const start = i * 2;
      const time = (s: number) => `00:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')},000`;
      return `${i + 1}\n${String(Math.floor(start / 3600)).padStart(2, '0')}${time(start).slice(2)} --> ${String(Math.floor((start + 1) / 3600)).padStart(2, '0')}${time(start + 1).slice(2)}\nපේළිය ${i + 1}`;
    });
    const started = performance.now();
    const { cues, warnings } = parseSrt(blocks.join('\n\n'));
    expect(performance.now() - started).toBeLessThan(500);
    expect(warnings).toEqual([]);
    expect(cues).toHaveLength(5000);
    expect(cues[4999]).toMatchObject({ startTime: 9998, endTime: 9999, text: 'පේළිය 5000' });
  });
});
