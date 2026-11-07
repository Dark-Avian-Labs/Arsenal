import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { amountForMonth, isDueInMonth } from '../../../shared/dueThisMonth';
import { formatMonthLabel } from '../../../shared/planMonth';
import { formatMoney } from '../../lib/format';
import type { Account, Entry } from '../../lib/types';

interface AccountBreakdown {
  accountId: string | null;
  name: string;
  color: string | null;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
}

export function AccountBreakdownView({
  entries,
  accounts,
  currency,
  locale,
  year,
  month,
}: {
  entries: Entry[];
  accounts: Account[];
  currency: string;
  locale: string;
  year: number;
  month: number;
}) {
  const { t } = useTranslation();

  const rows = useMemo(() => {
    const map = new Map<string, AccountBreakdown>();
    const ensure = (accountId: string | null, name: string, color: string | null = null) => {
      const key = accountId ?? '__none__';
      let row = map.get(key);
      if (!row) {
        row = { accountId, name, color, incomeCents: 0, expenseCents: 0, netCents: 0 };
        map.set(key, row);
      }
      return row;
    };

    for (const account of accounts) {
      ensure(account.id, account.name, account.color);
    }
    ensure(null, t('plan.noAccount'), null);

    for (const entry of entries) {
      if (!isDueInMonth(entry, year, month)) continue;
      const amount = amountForMonth(entry, year, month);
      if (amount == null) continue;
      const account = entry.account_id ? accounts.find((a) => a.id === entry.account_id) : null;
      const row = ensure(
        entry.account_id,
        account?.name ?? t('plan.noAccount'),
        account?.color ?? null,
      );
      if (entry.kind === 'income') row.incomeCents += amount;
      else row.expenseCents += amount;
    }

    for (const row of map.values()) {
      row.netCents = row.incomeCents - row.expenseCents;
    }

    return [...map.values()]
      .filter((r) => r.incomeCents > 0 || r.expenseCents > 0 || r.accountId != null)
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [accounts, entries, locale, month, t, year]);

  if (rows.every((r) => r.incomeCents === 0 && r.expenseCents === 0)) {
    return (
      <p className="text-muted py-8 text-center text-sm">
        {t('plan.breakdownEmpty', { month: formatMonthLabel(year, month, locale) })}
      </p>
    );
  }

  return (
    <section className="glass-surface overflow-hidden">
      <div className="border-glass-divider text-muted grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b px-4 py-2 text-xs font-semibold tracking-wide uppercase sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <span>{t('entry.account')}</span>
        <span className="hidden text-right sm:block">{t('plan.income')}</span>
        <span className="hidden text-right sm:block">{t('plan.expenses')}</span>
        <span className="text-right">{t('plan.net')}</span>
      </div>
      <ul className="divide-glass-divider divide-y">
        {rows.map((row) => (
          <li
            key={row.accountId ?? '__none__'}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 px-4 py-3 text-sm sm:grid-cols-[1.4fr_1fr_1fr_1fr]"
          >
            <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-2 truncate font-medium">
              {row.color ? (
                <span className={`account-swatch account-swatch--${row.color}`} aria-hidden />
              ) : null}
              <span className="truncate">{row.name}</span>
            </span>
            <span className="col-span-2 row-start-2 flex gap-3 text-xs sm:contents sm:text-sm">
              <span className="text-success tabular-nums sm:col-start-2 sm:row-start-1 sm:text-right">
                {formatMoney(row.incomeCents, currency, locale)}
                <span className="text-muted sm:hidden"> {t('plan.income')}</span>
              </span>
              <span className="tabular-nums sm:col-start-3 sm:row-start-1 sm:text-right">
                {formatMoney(row.expenseCents, currency, locale)}
                <span className="text-muted sm:hidden"> {t('plan.expenses')}</span>
              </span>
            </span>
            <span
              className={`col-start-2 row-start-1 text-right font-medium tabular-nums sm:col-start-4 ${
                row.netCents < 0 ? 'text-danger' : row.netCents > 0 ? 'text-success' : ''
              }`}
            >
              {formatMoney(row.netCents, currency, locale, true)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
