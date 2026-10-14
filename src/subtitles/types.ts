export interface SubtitleCue {
  /** Position among the file's valid cues; orders cues that are on screen at the same time. */
  index: number;
  /** Seconds. */
  startTime: number;
  /** Seconds, always greater than startTime. */
  endTime: number;
  /** Plain text with markup removed; lines separated by "\n". */
  text: string;
  /**
   * Screen position from an ASS {\anN} tag, laid out like a numeric keypad: 7-9 top row, 4-6 middle,
   * 1-3 bottom; left, centre, right in each row. Absent means bottom centre.
   */
  align?: number;
}

/** What to draw at one moment: bottom-row text, plus top and middle-row cues keyed by their {\anN} position. */
export interface SubtitleLayout {
  main: string;
  placed: Partial<Record<number, string>>;
}

export interface ParsedSubtitles {
  /** Sorted by startTime; cues with equal start keep file order. */
  cues: SubtitleCue[];
  /** One entry per skipped block. Empty when every block parsed. */
  warnings: string[];
}

/** A file that cannot be used at all. The message is shown to the user as-is. */
export class SubtitleParseError extends Error {
  override name = 'SubtitleParseError';
}
