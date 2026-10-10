import { describe, expect, it } from 'vitest';

import { decodeGearScreenshot } from './recognize';

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('decodeGearScreenshot', () => {
  it('accepts a small PNG data URL', () => {
    expect(decodeGearScreenshot(png)).toBe(png);
  });

  it('rejects missing or huge payloads', () => {
    expect(decodeGearScreenshot(null)).toBe('Paste a gear screenshot.');
    expect(decodeGearScreenshot('not-an-image')).toBe('Paste a PNG or JPEG screenshot.');
  });
});
