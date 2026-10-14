/** Messages the popup sends to the content script. */
export type SubLankaMessage =
  | { type: 'sublanka:show-subtitle'; text: string }
  | { type: 'sublanka:hide-subtitle' };

/** Content script reply to every SubLankaMessage. */
export interface OverlayState {
  visible: boolean;
}

export function isSubLankaMessage(value: unknown): value is SubLankaMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false;
  if (value.type === 'sublanka:hide-subtitle') return true;
  return value.type === 'sublanka:show-subtitle' && 'text' in value && typeof value.text === 'string';
}
