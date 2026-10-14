import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, normalizeOffset, parseSettings, saveSettings } from './settings';

describe('parseSettings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('garbage')).toEqual(DEFAULT_SETTINGS);
  });

  it('restores valid stored settings', () => {
    const stored = { fontSize: 'xlarge', position: 'very-high', background: 'solid', textColor: 'yellow', offset: -1.5, hideCredits: false };
    expect(parseSettings(stored)).toEqual(stored);
  });

  it('replaces invalid fields individually', () => {
    expect(parseSettings({ fontSize: 'huge', position: 'low', offset: Number.NaN, textColor: 3 })).toEqual({
      ...DEFAULT_SETTINGS,
      position: 'low',
    });
  });

  it('moves positions from older versions to the new default, except the one that still exists', () => {
    expect(parseSettings({ position: 'bottom' }).position).toBe('medium');
    expect(parseSettings({ position: 'raised' }).position).toBe('medium');
    expect(parseSettings({ position: 'high' }).position).toBe('high');
  });
});

describe('settings storage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('restores a saved position instead of the default', async () => {
    const area: Record<string, unknown> = {};
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: async (key: string) => (key in area ? { [key]: area[key] } : {}),
          set: async (items: Record<string, unknown>) => void Object.assign(area, items),
        },
      },
    });
    expect((await loadSettings()).position).toBe(DEFAULT_SETTINGS.position);
    await saveSettings({ ...DEFAULT_SETTINGS, position: 'very-high' });
    expect((await loadSettings()).position).toBe('very-high');
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
