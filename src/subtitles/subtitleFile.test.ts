import { describe, expect, it } from 'vitest';
import { MAX_SUBTITLE_FILE_BYTES, readSubtitleFile } from './subtitleFile';

const SRT = '1\n00:00:01,000 --> 00:00:02,000\nආයුබෝවන්';

describe('readSubtitleFile', () => {
  it('reads and parses an .srt file', async () => {
    const { cues } = await readSubtitleFile(new File([SRT], 'movie.si.srt'));
    expect(cues).toEqual([{ index: 0, startTime: 1, endTime: 2, text: 'ආයුබෝවන්' }]);
  });

  it('chooses the parser from the extension, case-insensitively', async () => {
    const { cues } = await readSubtitleFile(new File(['WEBVTT\n\n00:01.000 --> 00:02.000\nහායි'], 'MOVIE.VTT'));
    expect(cues[0]?.text).toBe('හායි');
  });

  it('strips a UTF-8 BOM', async () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const { cues } = await readSubtitleFile(new File([bom, 'WEBVTT\n\n00:01.000 --> 00:02.000\nx'], 'a.vtt'));
    expect(cues).toHaveLength(1);
  });

  it('rejects unsupported file types', async () => {
    await expect(readSubtitleFile(new File([SRT], 'movie.ass'))).rejects.toThrow('Unsupported file type');
    await expect(readSubtitleFile(new File([SRT], 'srt'))).rejects.toThrow('Unsupported file type');
  });

  it('rejects oversized files before reading them', async () => {
    const big = new File([new Uint8Array(MAX_SUBTITLE_FILE_BYTES + 1)], 'big.srt');
    await expect(readSubtitleFile(big)).rejects.toThrow('The limit is 5 MB.');
  });

  it('rejects text that is not UTF-8', async () => {
    const latin1 = new Uint8Array([...new TextEncoder().encode('1\n00:00:01,000 --> 00:00:02,000\n'), 0xe9, 0xff]);
    await expect(readSubtitleFile(new File([latin1], 'old.srt'))).rejects.toThrow('not UTF-8');
  });

  it('reports files without valid cues as errors', async () => {
    await expect(readSubtitleFile(new File([''], 'empty.srt'))).rejects.toThrow('The file is empty.');
  });
});
