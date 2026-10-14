import type { SubtitleCue, SubtitleLayout } from './types';

export interface CueIndex {
  cues: readonly SubtitleCue[];
  /** maxEndUpTo[i] = latest endTime among cues[0..i]; lets the search stop early with overlapping cues. */
  maxEndUpTo: Float64Array;
}

export function createCueIndex(cues: readonly SubtitleCue[]): CueIndex {
  const sorted = [...cues].sort((a, b) => a.startTime - b.startTime || a.index - b.index);
  const maxEndUpTo = new Float64Array(sorted.length);
  let maxEnd = -Infinity;
  sorted.forEach((cue, i) => {
    maxEnd = Math.max(maxEnd, cue.endTime);
    maxEndUpTo[i] = maxEnd;
  });
  return { cues: sorted, maxEndUpTo };
}

/**
 * Cues with startTime <= time < endTime, in file order. Binary search finds the last cue that has
 * started, then walks back only while an earlier cue could still be on screen.
 */
export function findActiveCues({ cues, maxEndUpTo }: CueIndex, time: number): SubtitleCue[] {
  let lo = 0;
  let hi = cues.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((cues[mid]?.startTime ?? Infinity) <= time) lo = mid + 1;
    else hi = mid;
  }

  const active: SubtitleCue[] = [];
  for (let i = lo - 1; i >= 0 && (maxEndUpTo[i] ?? -Infinity) > time; i--) {
    const cue = cues[i];
    if (cue && cue.endTime > time) active.push(cue);
  }
  return active.sort((a, b) => a.index - b.index);
}

/**
 * Text to display at `time`. Bottom-row cues are joined by line breaks into `main` ("" during a gap);
 * cues the file places in the top or middle row ({\an4}-{\an9}) are grouped by position, so credits
 * and watermarks pinned to a corner never stack onto the dialogue. Cues longer than `maxDuration` seconds are skipped.
 */
export function activeLayout(index: CueIndex, time: number, maxDuration = Infinity): SubtitleLayout {
  const main: string[] = [];
  const placed: SubtitleLayout['placed'] = {};
  for (const cue of findActiveCues(index, time)) {
    if (cue.endTime - cue.startTime > maxDuration) continue;
    if (cue.align === undefined || cue.align <= 3) main.push(cue.text);
    else placed[cue.align] = placed[cue.align] === undefined ? cue.text : `${placed[cue.align]}\n${cue.text}`;
  }
  return { main: main.join('\n'), placed };
}
