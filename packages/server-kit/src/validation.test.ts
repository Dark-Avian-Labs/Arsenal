import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { mockResponse } from './testing/mockResponse.ts';
import { optionalPositiveInt, positiveInt, validateBody, zodEnum } from './validation.ts';

describe('validateBody', () => {
  const schema = z.object({
    name: z.string().trim().min(1),
    count: z.coerce.number().int().positive(),
  });

  it('returns parsed data for valid input', () => {
    const res = mockResponse();
    const data = validateBody(schema, { name: ' Excalibur ', count: '3' }, res);
    expect(data).toEqual({ name: 'Excalibur', count: 3 });
    expect(res.statusCode).toBe(200);
  });

  it('returns null and 400 JSON for invalid input', () => {
    const res = mockResponse();
    const data = validateBody(schema, { name: '', count: 0 }, res);
    expect(data).toBeNull();
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual(
      expect.objectContaining({
        error: 'Validation failed',
        details: expect.any(Object),
      }),
    );
  });
});

describe('positiveInt and optionalPositiveInt', () => {
  it('coerces positive integers and rejects zero or non-numeric values', () => {
    expect(positiveInt.parse('5')).toBe(5);
    expect(positiveInt.safeParse(0).success).toBe(false);
    expect(positiveInt.safeParse('nope').success).toBe(false);

    expect(optionalPositiveInt.parse(null)).toBeNull();
    expect(optionalPositiveInt.parse('')).toBeNull();
    expect(optionalPositiveInt.parse('4')).toBe(4);
    expect(optionalPositiveInt.safeParse(0).success).toBe(false);
    expect(optionalPositiveInt.safeParse(-1).success).toBe(false);
    expect(optionalPositiveInt.safeParse('abc').success).toBe(false);
  });

  it('zodEnum rejects empty value lists', () => {
    expect(() => zodEnum([])).toThrow();
    expect(zodEnum(['a', 'b']).parse('a')).toBe('a');
  });
});
