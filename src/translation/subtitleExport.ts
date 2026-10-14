import type { SubtitleCue } from '../subtitles/types';

export type ExportFormat = 'srt' | 'vtt';

/** 3723.5 → "01:02:03,500" (SRT) or "01:02:03.500" (WebVTT). Rounds to whole milliseconds first, so 59.9996 s never prints as "00:00:60". */
export function formatTimestamp(seconds: number, separator: ',' | '.'): string {
  const total = Math.round(seconds * 1000);
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  const ms = total % 1000;
  const s = Math.floor(total / 1000) % 60;
  const m = Math.floor(total / 60_000) % 60;
  const h = Math.floor(total / 3_600_000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(ms, 3)}`;
}

/** No blank lines (they end a cue) and no "-->" (it starts a timing line) inside cue text. */
function cueLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim().replaceAll('-->', '→'))
    .filter(Boolean);
}

// WebVTT treats < and & as markup, so they are escaped; the parser decodes them back.
const escapeVtt = (line: string) => line.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/**
 * Serializes cues in their given order with their exact timings. Only text and timing are written: a pinned
 * position ({\anN}) is SRT-specific markup and is kept in SRT only.
 */
export function serializeCues(cues: SubtitleCue[], format: ExportFormat): string {
  const separator = format === 'srt' ? ',' : '.';
  const blocks = cues.map((cue, i) => {
    const timing = `${formatTimestamp(cue.startTime, separator)} --> ${formatTimestamp(cue.endTime, separator)}`;
    const lines = cueLines(cue.text);
    if (format === 'vtt') return [String(i + 1), timing, ...lines.map(escapeVtt)].join('\n');
    if (cue.align && cue.align !== 2 && lines[0] !== undefined) lines[0] = `{\\an${cue.align}}${lines[0]}`;
    return [String(i + 1), timing, ...lines].join('\n');
  });
  return `${format === 'vtt' ? 'WEBVTT\n\n' : ''}${blocks.join('\n\n')}\n`;
}

/** A plain-text review file: timing, English and Sinhala for every cue. */
export function serializeComparison(cues: SubtitleCue[], translations: (string | null)[]): string {
  return `${cues
    .map((cue, i) =>
      [
        `#${i + 1}  ${formatTimestamp(cue.startTime, '.')} --> ${formatTimestamp(cue.endTime, '.')}`,
        `EN: ${cue.text.replaceAll('\n', ' / ')}`,
        `SI: ${(translations[i] ?? '(not translated)').replaceAll('\n', ' / ')}`,
      ].join('\n'),
    )
    .join('\n\n')}\n`;
}

/** "Interstellar.en.srt" → "Interstellar.si.srt". Drops the extension and an English language tag, and characters no OS allows. */
export function exportFileName(sourceName: string, extension: ExportFormat | 'review.txt'): string {
  const base = sourceName
    .replace(/\.(srt|vtt)$/i, '')
    .replace(/[._-](en|eng|english)$/i, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 120);
  return `${base || 'subtitles'}.si.${extension}`;
}

/** Saves text as a UTF-8 file through a temporary object URL; nothing leaves the device. */
export function downloadText(fileName: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = Object.assign(document.createElement('a'), { href: url, download: fileName });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
