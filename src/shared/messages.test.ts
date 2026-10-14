import { describe, expect, it } from 'vitest';
import { isSubLankaMessage } from './messages';

describe('isSubLankaMessage', () => {
  it('accepts valid messages', () => {
    expect(isSubLankaMessage({ type: 'sublanka:show-subtitle', text: 'x' })).toBe(true);
    expect(isSubLankaMessage({ type: 'sublanka:hide-subtitle' })).toBe(true);
  });

  it('rejects anything else', () => {
    for (const value of [null, 'x', {}, { type: 'other' }, { type: 'sublanka:show-subtitle' }, { type: 'sublanka:show-subtitle', text: 1 }]) {
      expect(isSubLankaMessage(value)).toBe(false);
    }
  });
});
