import { parseSrt } from './srtParser';
import { SubtitleParseError, type ParsedSubtitles } from './types';
import { parseVtt } from './vttParser';

/** Far above any real subtitle file (a feature film is ~100 KB) but small enough to parse instantly. */
export const MAX_SUBTITLE_FILE_BYTES = 5 * 1024 * 1024;

/** Reads and parses a user-selected file entirely in the browser. Throws SubtitleParseError with a user-facing message. */
export async function readSubtitleFile(file: File): Promise<ParsedSubtitles> {
  const extension = /\.(srt|vtt)$/i.exec(file.name)?.[1]?.toLowerCase();
  if (!extension) throw new SubtitleParseError('Unsupported file type. Choose an .srt or .vtt file.');
  if (file.size > MAX_SUBTITLE_FILE_BYTES) {
    throw new SubtitleParseError(`This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.`);
  }

  const bytes = await file.arrayBuffer();
  let text: string;
  try {
    // fatal: reject non-UTF-8 files instead of showing replacement characters. A UTF-8 BOM is stripped.
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new SubtitleParseError('This file is not UTF-8 text. Re-save it with UTF-8 encoding and try again.');
  }
  return extension === 'srt' ? parseSrt(text) : parseVtt(text);
}
