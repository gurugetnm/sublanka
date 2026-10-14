import { finishParsing, parseCueBlock, toBlocks } from './cueBlocks';
import type { ParsedSubtitles, SubtitleCue } from './types';

/** Parses SubRip (.srt). Sequence numbers are optional and not trusted; file order is kept instead. */
export function parseSrt(raw: string): ParsedSubtitles {
  const cues: SubtitleCue[] = [];
  const warnings: string[] = [];
  toBlocks(raw).forEach((lines, i) => parseCueBlock(lines, i + 1, cues, warnings));
  return finishParsing(cues, warnings);
}
