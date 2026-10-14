import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeOffset, parseSettings } from './settings';

describe('parseSettings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('garbage')).toEqual(DEFAULT_SETTINGS);
  });

  it('restores valid stored settings', () => {
    const stored = { fontSize: 'xlarge', position: 'high', background: 'solid', textColor: 'yellow', offset: -1.5 };
    expect(parseSettings(stored)).toEqual(stored);
  });

  it('replaces invalid fields individually', () => {
    expect(parseSettings({ fontSize: 'huge', position: 'raised', offset: Number.NaN, textColor: 3 })).toEqual({
      ...DEFAULT_SETTINGS,
      position: 'raised',
    });
  });
});

describe('normalizeOffset', () => {
  it('avoids floating point drift from repeated steps', () => {
    let offset = 0;
    for (let i = 0; i < 7; i++) offset = normalizeOffset(offset + 0.1);
    expect(offset).toBe(0.7);
  });

  it('clamps to ten minutes and never returns -0', () => {
    expect(normalizeOffset(10_000)).toBe(600);
    expect(normalizeOffset(-10_000)).toBe(-600);
    expect(Object.is(normalizeOffset(-0.0001), 0)).toBe(true);
  });
});
