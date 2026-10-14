import type { SubtitleCue } from './types';

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

/** Text to display at `time`: active cues joined by line breaks, or "" during a gap. */
export function activeText(index: CueIndex, time: number): string {
  return findActiveCues(index, time)
    .map((cue) => cue.text)
    .join('\n');
}
