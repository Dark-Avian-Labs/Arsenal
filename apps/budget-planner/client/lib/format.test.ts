import { describe, expect, it } from 'vitest';

import { centsToInput, formatDueDay, formatIsoDate, formatMoney, parseAmountToCents } from './format';

describe('parseAmountToCents & centsToInput', () => {
  it('parses locale numbers, rejects invalid/negative/overflow values, and round-trips', () => {
    expect(parseAmountToCents('12.34')).toBe(1234);
    expect(parseAmountToCents('0.09')).toBe(9);
    expect(parseAmountToCents('1.234,56', 'de')).toBe(123456);
    expect(parseAmountToCents('12,50', 'de')).toBe(1250);
    expect(parseAmountToCents('1,234.56', 'en')).toBe(123456);
    expect(parseAmountToCents('')).toBeNull();
    expect(parseAmountToCents('-5.00')).toBeNull();
    expect(parseAmountToCents('abc')).toBeNull();
    expect(parseAmountToCents('9007199254740991.99')).toBeNull();

    expect(centsToInput(123456, 'de')).toBe('1234,56');
    expect(centsToInput(1250, 'en')).toBe('12.50');
    expect(parseAmountToCents(centsToInput(123456, 'de'), 'de')).toBe(123456);
  });
});

describe('formatIsoDate, formatMoney, and formatDueDay', () => {
  it('formats calendar days without timezone shift and formats money/due days', () => {
    expect(formatIsoDate('2026-03-31', 'en')).toBe('Mar 31, 2026');
    expect(formatIsoDate('bad', 'de')).toBe('bad');
    expect(formatMoney(12345, 'EUR', 'en')).toContain('123.45');
    expect(formatDueDay(1, 'en')).toBe('1st');
    expect(formatDueDay(2, 'en')).toBe('2nd');
    expect(formatDueDay(3, 'en')).toBe('3rd');
    expect(formatDueDay(11, 'en')).toBe('11th');
    expect(formatDueDay(21, 'en')).toBe('21st');
    expect(formatDueDay(5, 'de')).toBe('5.');
  });
});
