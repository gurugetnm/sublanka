import { SubtitleParseError, type ParsedSubtitles, type SubtitleCue } from './types';

// Accepts both "," (SRT) and "." (WebVTT) before milliseconds, and optional hours, in either format.
const TIMESTAMP = String.raw`(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})`;
// Anything after the end time is WebVTT cue settings or SRT coordinates; neither is used yet.
const TIMING_LINE = new RegExp(String.raw`^${TIMESTAMP}\s*-->\s*${TIMESTAMP}(?:\s.*)?$`);

// WebVTT/SRT markup such as <i>, <c.x>, <v Name>, <00:01.000>, <font ...> and ASS overrides like {\an8}.
// A tag never spans its own opener, so a scan stops at the next "<" or "{": linear time on hostile lines like "<<<<…".
const MARKUP = /<[^<>\n]*>|\{\\[^{}\n]*\}/g;
// {\an9}, also inside combined overrides such as {\b1\an9}.
const ASS_ALIGN = /\{[^{}\n]*\\an([1-9])/;
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  lrm: '\u200e',
  rlm: '\u200f',
};

/** Strips a BOM, normalizes CRLF/CR, and splits on blank lines into trimmed, non-empty blocks of lines. */
export function toBlocks(raw: string): string[][] {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!text) throw new SubtitleParseError('The file is empty.');
  return text.split(/\n\s*\n/).map((block) => block.split('\n').map((line) => line.trim()));
}

function toSeconds(hours: string | undefined, minutes: string, seconds: string, fraction: string): number | null {
  const m = Number(minutes);
  const s = Number(seconds);
  if (m > 59 || s > 59) return null;
  return Number(hours ?? 0) * 3600 + m * 60 + s + Number(`0.${fraction}`);
}

export function parseTimingLine(line: string): { start: number; end: number } | null {
  const match = TIMING_LINE.exec(line);
  if (!match) return null;
  const [, h1, m1 = '', s1 = '', f1 = '', h2, m2 = '', s2 = '', f2 = ''] = match;
  const start = toSeconds(h1, m1, s1, f1);
  const end = toSeconds(h2, m2, s2, f2);
  // A hundreds-of-digits hour field overflows to Infinity, which the content script rightly rejects.
  return start === null || end === null || !Number.isFinite(end) ? null : { start, end };
}

export function cleanCueText(lines: string[]): string {
  return lines
    .map((line) =>
      line
        .replace(MARKUP, '')
        .replace(/&(\w+);/g, (entity, name: string) => ENTITIES[name] ?? entity)
        .trim(),
    )
    .filter(Boolean)
    .join('\n');
}

/**
 * Parses one cue block: an optional identifier line (SRT sequence number or WebVTT cue id),
 * a timing line, then text. Invalid blocks are skipped with a warning instead of guessing.
 */
export function parseCueBlock(lines: string[], blockNumber: number, cues: SubtitleCue[], warnings: string[]): void {
  const timingAt = lines.findIndex((line) => line.includes('-->'));
  if (timingAt === -1 || timingAt > 1) {
    warnings.push(`Block ${blockNumber}: no timing line found, skipped.`);
    return;
  }
  const timingLine = lines[timingAt] ?? '';
  const timing = parseTimingLine(timingLine);
  if (!timing) {
    warnings.push(`Block ${blockNumber}: invalid timestamp "${timingLine}", skipped.`);
    return;
  }
  if (timing.end <= timing.start) {
    warnings.push(`Block ${blockNumber}: end time is not after start time, skipped.`);
    return;
  }
  const textLines = lines.slice(timingAt + 1);
  const text = cleanCueText(textLines);
  if (!text) {
    warnings.push(`Block ${blockNumber}: no subtitle text, skipped.`);
    return;
  }
  const align = ASS_ALIGN.exec(textLines.join('\n'))?.[1];
  cues.push({ index: cues.length, startTime: timing.start, endTime: timing.end, text, ...(align && { align: Number(align) }) });
}

export function finishParsing(cues: SubtitleCue[], warnings: string[]): ParsedSubtitles {
  if (cues.length === 0) {
    throw new SubtitleParseError(
      warnings.length ? `No valid subtitle cues found. ${warnings[0]}` : 'No valid subtitle cues found.',
    );
  }
  // Array.prototype.sort is stable, so cues with equal start times keep file order.
  cues.sort((a, b) => a.startTime - b.startTime);
  return { cues, warnings };
}
