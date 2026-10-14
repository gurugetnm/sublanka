import { finishParsing, parseCueBlock, toBlocks } from './cueBlocks';
import type { ParsedSubtitles, SubtitleCue } from './types';

const HEADER = /^WEBVTT(?:[ \t].*)?$/;
const METADATA_BLOCK = /^(?:NOTE|STYLE|REGION)(?:[ \t]|$)/;

/** Parses WebVTT (.vtt). NOTE, STYLE and REGION blocks are skipped; cue settings are ignored. */
export function parseVtt(raw: string): ParsedSubtitles {
  const cues: SubtitleCue[] = [];
  const warnings: string[] = [];
  const blocks = toBlocks(raw);

  const hasHeader = HEADER.test(blocks[0]?.[0] ?? '');
  if (!hasHeader) warnings.push('Missing "WEBVTT" header; parsed the cues anyway.');

  blocks.forEach((lines, i) => {
    if ((hasHeader && i === 0) || METADATA_BLOCK.test(lines[0] ?? '')) return;
    parseCueBlock(lines, i + 1, cues, warnings);
  });
  return finishParsing(cues, warnings);
}
