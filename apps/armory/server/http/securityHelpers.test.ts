import { sanitizeRequestId } from '@dark-avian-labs/server-kit';
import { describe, expect, it } from 'vitest';

import { assertAllowedImageMime, isAllowedEquipmentImage } from './allowedFetchHosts.ts';

describe('sanitizeRequestId', () => {
  it('accepts valid ids and rejects invalid ones', () => {
    expect(sanitizeRequestId('abcdef12')).toBe('abcdef12');
    expect(sanitizeRequestId('a'.repeat(64))).toBe('a'.repeat(64));
    const generated = sanitizeRequestId('../evil');
    expect(generated).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(sanitizeRequestId('short')).not.toBe('short');
  });
});

describe('isAllowedEquipmentImage', () => {
  it('allows relative paths and allowlisted https hosts', () => {
    expect(isAllowedEquipmentImage('/Lotus/Types/Weapons/Foo.png')).toBe(true);
    expect(isAllowedEquipmentImage('https://content.warframe.com/PublicExport/x.png')).toBe(true);
    expect(isAllowedEquipmentImage('javascript:alert(1)')).toBe(false);
    expect(isAllowedEquipmentImage('data:image/png;base64,aaa')).toBe(false);
    expect(isAllowedEquipmentImage('https://evil.example/x.png')).toBe(false);
  });
});

describe('assertAllowedImageMime', () => {
  it('allows image mime types and rejects others', () => {
    expect(() => assertAllowedImageMime('image/png')).not.toThrow();
    expect(() => assertAllowedImageMime('text/html')).toThrow();
  });
});
