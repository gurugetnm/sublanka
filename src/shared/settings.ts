export const FONT_SIZES = ['small', 'medium', 'large', 'xlarge'] as const;
export const POSITIONS = ['bottom', 'raised', 'high'] as const;
export const BACKGROUNDS = ['none', 'translucent', 'solid'] as const;
export const TEXT_COLORS = ['white', 'yellow'] as const;

export interface SubtitleSettings {
  fontSize: (typeof FONT_SIZES)[number];
  position: (typeof POSITIONS)[number];
  background: (typeof BACKGROUNDS)[number];
  textColor: (typeof TEXT_COLORS)[number];
  /** Seconds. Positive shows subtitles later, negative earlier: cue time = video.currentTime - offset. */
  offset: number;
}

export const DEFAULT_SETTINGS: SubtitleSettings = {
  fontSize: 'medium',
  position: 'bottom',
  background: 'translucent',
  textColor: 'white',
  offset: 0,
};

export const SETTINGS_STORAGE_KEY = 'subtitleSettings';
const MAX_OFFSET_SECONDS = 600;

/** Clamps to ±10 minutes and rounds to milliseconds so repeated ±0.5 steps never drift. */
export function normalizeOffset(seconds: number): number {
  const clamped = Math.min(MAX_OFFSET_SECONDS, Math.max(-MAX_OFFSET_SECONDS, seconds));
  return Math.round(clamped * 1000) / 1000 || 0;
}

function pick<T extends string>(options: readonly T[], value: unknown, fallback: T): T {
  return options.find((option) => option === value) ?? fallback;
}

/** Builds valid settings from anything found in storage; unknown or invalid fields fall back to defaults. */
export function parseSettings(value: unknown): SubtitleSettings {
  const stored: Partial<Record<keyof SubtitleSettings, unknown>> = typeof value === 'object' && value !== null ? value : {};
  return {
    fontSize: pick(FONT_SIZES, stored.fontSize, DEFAULT_SETTINGS.fontSize),
    position: pick(POSITIONS, stored.position, DEFAULT_SETTINGS.position),
    background: pick(BACKGROUNDS, stored.background, DEFAULT_SETTINGS.background),
    textColor: pick(TEXT_COLORS, stored.textColor, DEFAULT_SETTINGS.textColor),
    offset: typeof stored.offset === 'number' && Number.isFinite(stored.offset) ? normalizeOffset(stored.offset) : 0,
  };
}

export async function loadSettings(): Promise<SubtitleSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  return parseSettings(stored[SETTINGS_STORAGE_KEY]);
}

export function saveSettings(settings: SubtitleSettings): Promise<void> {
  return chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings });
}
