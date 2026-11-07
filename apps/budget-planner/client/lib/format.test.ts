import { describe, expect, it } from 'vitest';

import { centsToInput, formatIsoDate, parseAmountToCents } from './format';

describe('parseAmountToCents', () => {
  it('converts euro strings to integer cents', () => {
    expect(parseAmountToCents('12.34')).toBe(1234);
    expect(parseAmountToCents('0.09')).toBe(9);
  });

  it('rejects cent totals outside the safe-integer range', () => {
    expect(parseAmountToCents('9007199254740991.99')).toBeNull();
  });

  it('strips the locale thousands separator and reads its decimal separator', () => {
    expect(parseAmountToCents('1.234,56', 'de')).toBe(123456);
    expect(parseAmountToCents('12,50', 'de')).toBe(1250);
    expect(parseAmountToCents('12.50', 'de')).toBe(1250);
    expect(parseAmountToCents('1,234.56', 'en')).toBe(123456);
    expect(parseAmountToCents('12,50', 'en')).toBe(1250);
  });
});

describe('centsToInput', () => {
  it('writes the locale decimal separator and round-trips', () => {
    expect(centsToInput(123456, 'de')).toBe('1234,56');
    expect(centsToInput(1250, 'en')).toBe('12.50');
    expect(parseAmountToCents(centsToInput(123456, 'de'), 'de')).toBe(123456);
  });
});

describe('formatIsoDate', () => {
  it('formats the calendar day without a timezone shift', () => {
    expect(formatIsoDate('2026-03-31', 'en')).toBe('Mar 31, 2026');
    expect(formatIsoDate('bad', 'de')).toBe('bad');
  });
});
