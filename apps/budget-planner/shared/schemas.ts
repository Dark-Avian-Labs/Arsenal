import { z } from 'zod';

import { CURRENCIES, type AllowedCurrency } from './currencies.ts';
import { parseIsoDate } from './dueThisMonth.ts';
import { MAX_COMMENT_LENGTH, MAX_NAME_LENGTH } from './entryLimits.ts';
import { MAX_PLAN_YEAR, MIN_PLAN_YEAR } from './planMonth.ts';

export type { AllowedCurrency };
export { MAX_COMMENT_LENGTH, MAX_NAME_LENGTH };
export const MIN_YEAR = MIN_PLAN_YEAR;
export const MAX_YEAR = MAX_PLAN_YEAR;

const ALLOWED_CURRENCY_SET = new Set<string>(CURRENCIES);

export const entryKindSchema = z.enum(['expense', 'income', 'credit']);
export const entryFrequencySchema = z.enum([
  'monthly',
  'quarterly',
  'halfyearly',
  'yearly',
  'once',
]);

export type EntryKind = z.infer<typeof entryKindSchema>;
export type EntryFrequency = z.infer<typeof entryFrequencySchema>;

const nameSchema = z.string().trim().min(1).max(MAX_NAME_LENGTH);
const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((code) => isAllowedCurrency(code));
const nonNegativeInt = z.number().int().nonnegative();

export const entrySchema = z.object({
  name: nameSchema,
  amount_cents: nonNegativeInt,
  kind: entryKindSchema,
  frequency: entryFrequencySchema,
  due_day: z.number().int().min(1).max(31),
  category_id: z.string().min(1),
  due_month: z.number().int().min(1).max(12).nullable().optional(),
  due_year: z.number().int().min(MIN_YEAR).max(MAX_YEAR).nullable().optional(),
  final_amount_cents: nonNegativeInt.nullable().optional(),
  comment: z.string().trim().min(1).max(MAX_COMMENT_LENGTH).nullable().optional(),
  end_date: z
    .union([z.literal(''), z.null(), z.string().refine((value) => parseIsoDate(value) != null)])
    .optional(),
});

export const entryPatchSchema = entrySchema.partial();

export const planSchema = z.object({
  name: nameSchema,
  currency: currencySchema,
});

export function isAllowedCurrency(value: string): value is AllowedCurrency {
  return ALLOWED_CURRENCY_SET.has(value);
}

export function normalizeCurrency(value: unknown, fallback: string): string | null {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = currencySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function normalizeName(value: unknown, fallback?: string): string | null {
  if (value === undefined && fallback !== undefined) return fallback;
  const parsed = nameSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function normalizeComment(value: unknown, fallback: string | null): string | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  const parsed = z.string().trim().max(MAX_COMMENT_LENGTH).safeParse(value);
  if (!parsed.success) return null;
  return parsed.data || null;
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function fieldErrors(error: z.ZodError): string[] {
  return [
    ...new Set(error.issues.map((issue) => String(issue.path[0] ?? '')).filter((field) => field)),
  ];
}

export function validateEntryBody(body: Record<string, unknown>, partial = false): string[] {
  const parsed = (partial ? entryPatchSchema : entrySchema).safeParse(body);
  return parsed.success ? [] : fieldErrors(parsed.error);
}

export function invalidFieldsBody(fields: string[]): { error: 'Invalid fields'; fields: string[] } {
  return { error: 'Invalid fields', fields };
}
