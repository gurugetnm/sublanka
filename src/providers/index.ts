import { openSubtitlesProvider } from './opensubtitles';
import type { ProviderId, SubtitleProvider } from './types';

/** Every provider SubLanka can search. A new provider is one entry here plus its adapter. */
export const PROVIDERS: Readonly<Record<ProviderId, SubtitleProvider>> = { [openSubtitlesProvider.id]: openSubtitlesProvider };

/** Sinhala, as listed by GET https://api.opensubtitles.com/api/v1/infos/languages ("si", "Sinhalese"). */
export const SINHALA_LANGUAGE = 'si';
