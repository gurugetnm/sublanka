import { describe, expect, it } from 'vitest';
import overlappingVtt from '../../test-page/fixtures/overlapping-si.vtt?raw';
import sampleVtt from '../../test-page/fixtures/sample-si.vtt?raw';
import { parseSrt } from './srtParser';
import sampleSrt from '../../test-page/fixtures/sample-si.srt?raw';
import { parseVtt } from './vttParser';

describe('parseVtt', () => {
  it('parses the sample with the same cues as the SRT version', () => {
    const { cues, warnings } = parseVtt(sampleVtt);
    expect(warnings).toEqual([]);
    expect(cues).toEqual(parseSrt(sampleSrt).cues);
  });

  it('never turns header, NOTE, STYLE or REGION content into cues', () => {
    const text = parseVtt(sampleVtt)
      .cues.map((cue) => cue.text)
      .join('\n');
    for (const leaked of ['Kind:', 'NOTE', 'copyright-free', '::cue', 'lime', 'width:40%', 'cue-1']) {
      expect(text).not.toContain(leaked);
    }
  });

  it('supports MM:SS.mmm and HH:MM:SS.mmm timestamps, cue settings and identifiers', () => {
    const { cues } = parseVtt('WEBVTT\n\nintro\n00:01.200 --> 00:04.500 line:0 position:10%\nඑක\n\n01:00:00.000 --> 01:00:01.000\nදෙක');
    expect(cues).toEqual([
      { index: 0, startTime: 1.2, endTime: 4.5, text: 'එක' },
      { index: 1, startTime: 3600, endTime: 3601, text: 'දෙක' },
    ]);
  });

  it('skips a NOTE that directly follows the header and keeps multiline cues', () => {
    const { cues } = parseVtt('﻿WEBVTT\r\n\r\nNOTE a note\r\n\r\n00:00.000 --> 00:01.000\r\nපළමු පේළිය\r\nදෙවන පේළිය');
    expect(cues).toEqual([{ index: 0, startTime: 0, endTime: 1, text: 'පළමු පේළිය\nදෙවන පේළිය' }]);
  });

  it('strips voice, class and inline timestamp tags', () => {
    const { cues } = parseVtt('WEBVTT\n\n00:00.000 --> 00:02.000\n<v Kamal>ආයුබෝවන්</v> <c.loud>යාළුවනේ</c> <00:01.000>හෙට');
    expect(cues[0]?.text).toBe('ආයුබෝවන් යාළුවනේ හෙට');
  });

  it('parses cues without a WEBVTT header but warns about it', () => {
    const { cues, warnings } = parseVtt('00:00.000 --> 00:01.000\ntext');
    expect(cues).toHaveLength(1);
    expect(warnings).toEqual(['Missing "WEBVTT" header; parsed the cues anyway.']);
  });

  it('keeps overlapping cues from the fixture, equal start times in file order', () => {
    const { cues } = parseVtt(overlappingVtt);
    expect(cues.map((cue) => cue.text.slice(1, 2))).toEqual(['A', 'B', 'C', 'D']);
  });

  it('rejects a header-only file', () => {
    expect(() => parseVtt('WEBVTT\n\nNOTE nothing here')).toThrow('No valid subtitle cues found.');
  });
});
