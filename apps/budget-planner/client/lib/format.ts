export function formatMoney(
  amountCents: number,
  currency: string,
  locale: string,
  signed = false,
): string {
  const value = amountCents / 100;
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(Math.abs(value));
  } catch {
    formatted = `${Math.abs(value).toFixed(2)} ${currency}`;
  }

  if (!signed) return formatted;
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

export function formatDueDay(day: number, locale: string): string {
  if (locale.startsWith('de')) return `${day}.`;
  const mod100 = day % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th');
  return `${day}${suffix}`;
}

export function formatDueMonthDay(month: number, day: number, locale: string): string {
  const d = String(day).padStart(2, '0');
  const m = String(month).padStart(2, '0');
  if (locale.startsWith('de')) return `${d}.${m}.`;
  return `${d}/${m}`;
}

function separators(locale: string): { group: string; decimal: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234.5);
  return {
    group: parts.find((p) => p.type === 'group')?.value ?? ',',
    decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
  };
}

export function formatIsoDate(iso: string, locale: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

export function parseAmountToCents(raw: string, locale = 'en'): number | null {
  const { group, decimal } = separators(locale);
  // A group separator only counts before exactly three digits, so "12.50" stays 12.50 in German.
  const normalized = raw
    .trim()
    .replace(/\s/g, '')
    .replace(new RegExp(`\\${group}(?=\\d{3}(?!\\d))`, 'g'), '')
    .replace(decimal, '.')
    .replace(',', '.');
  if (!normalized) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const euros = Number(whole);
  if (!Number.isSafeInteger(euros) || euros < 0) return null;
  const cents = Number((fraction + '00').slice(0, 2));
  const total = euros * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}

export function centsToInput(amountCents: number, locale = 'en'): string {
  return (amountCents / 100).toFixed(2).replace('.', separators(locale).decimal);
}
