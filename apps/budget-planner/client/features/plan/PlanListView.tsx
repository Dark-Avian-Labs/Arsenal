import { move } from '@dnd-kit/helpers';
import { DragDropProvider, useDroppable, type DragEndEvent } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { amountForMonth, isDueInMonth } from '../../../shared/dueThisMonth';
import { FrequencyBadge } from '../../components/budget/FrequencyBadge';
import { MaterialSymbol } from '../../components/ui/MaterialSymbol';
import { formatDueDay, formatDueMonthDay, formatMoney } from '../../lib/format';
import type { Account, Category, Entry } from '../../lib/types';

const CATEGORY_GROUP = 'categories';

function entryGroup(categoryId: string): string {
  return `entries:${categoryId}`;
}

function catKey(id: string): string {
  return `cat:${id}`;
}

function entryKey(id: string): string {
  return `entry:${id}`;
}

function rawId(key: string): string {
  const split = key.indexOf(':');
  return split === -1 ? key : key.slice(split + 1);
}

function sortableBoard(categories: Category[], entries: Entry[]) {
  const sortedCategories = [...categories].sort((a, b) => a.sort_order - b.sort_order);
  const board: Record<string, string[]> = {
    [CATEGORY_GROUP]: sortedCategories.map((category) => catKey(category.id)),
  };
  for (const category of sortedCategories) {
    board[entryGroup(category.id)] = entries
      .filter((entry) => entry.category_id === category.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((entry) => entryKey(entry.id));
  }
  return { sortedCategories, board };
}

function listsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function reorderFromBoard(
  before: Record<string, string[]>,
  after: Record<string, string[]>,
  categoryIds: string[],
): {
  categories?: Array<{ id: string; sort_order: number }>;
  entries?: Array<{ id: string; sort_order: number; category_id: string }>;
} | null {
  const nextCategories = after[CATEGORY_GROUP] ?? [];
  if (!listsEqual(before[CATEGORY_GROUP] ?? [], nextCategories)) {
    return {
      categories: nextCategories.map((key, index) => ({ id: rawId(key), sort_order: index })),
    };
  }

  const entries: Array<{ id: string; sort_order: number; category_id: string }> = [];
  for (const categoryId of categoryIds) {
    const group = entryGroup(categoryId);
    const left = before[group] ?? [];
    const right = after[group] ?? [];
    if (listsEqual(left, right)) continue;
    right.forEach((key, index) => {
      entries.push({ id: rawId(key), sort_order: index, category_id: categoryId });
    });
  }
  return entries.length > 0 ? { entries } : null;
}

function SortableHandle({
  handleRef,
  label,
}: {
  handleRef: (element: Element | null) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      ref={handleRef}
      className="text-muted hover:text-foreground flex h-10 w-8 shrink-0 cursor-grab items-center justify-center active:cursor-grabbing"
      aria-label={label}
    >
      <MaterialSymbol name="drag_indicator" />
    </button>
  );
}

function SortableCategory({
  category,
  index,
  organizeMode,
  children,
}: {
  category: Category;
  index: number;
  organizeMode: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { ref, handleRef, isDragging } = useSortable({
    id: catKey(category.id),
    index,
    group: CATEGORY_GROUP,
    type: 'category',
    accept: 'category',
    disabled: !organizeMode,
  });

  return (
    <section ref={ref} className={`flex flex-col gap-2${isDragging ? ' opacity-70' : ''}`}>
      <div className="flex items-center gap-1 px-1">
        {organizeMode ? (
          <SortableHandle handleRef={handleRef} label={t('plan.dragCategory')} />
        ) : null}
        <h2 className="text-muted text-xs font-semibold tracking-wide uppercase">
          {category.name}
        </h2>
      </div>
      {children}
    </section>
  );
}

function EmptyCategoryDrop({ groupId, label }: { groupId: string; label: string }) {
  const { ref } = useDroppable({ id: groupId, accept: 'entry' });
  return (
    <li ref={ref} className="text-muted px-4 py-3 text-xs">
      {label}
    </li>
  );
}

function SortableEntryRow({
  entry,
  index,
  organizeMode,
  due,
  accountName,
  accountColor,
  currency,
  locale,
  year,
  month,
  onOpen,
}: {
  entry: Entry;
  index: number;
  organizeMode: boolean;
  due: boolean;
  accountName: string | null;
  accountColor: string | null;
  currency: string;
  locale: string;
  year: number;
  month: number;
  onOpen: (entry: Entry) => void;
}) {
  const { t } = useTranslation();
  const { ref, handleRef, isDragging } = useSortable({
    id: entryKey(entry.id),
    index,
    group: entryGroup(entry.category_id),
    type: 'entry',
    accept: 'entry',
    disabled: !organizeMode,
  });

  const displayAmount = amountForMonth(entry, year, month) ?? entry.amount_cents;
  const signed = entry.kind === 'income' ? displayAmount : -displayAmount;

  return (
    <li
      ref={ref}
      className={`${due ? 'entry-row' : 'entry-row entry-row--inactive'}${isDragging ? ' opacity-70' : ''}`}
      {...(accountColor ? { 'data-account-color': accountColor } : null)}
    >
      <div className="flex items-stretch gap-0">
        {organizeMode ? <SortableHandle handleRef={handleRef} label={t('plan.dragEntry')} /> : null}
        <button
          type="button"
          className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-3 text-left sm:px-4"
          onClick={() => {
            if (!organizeMode) onOpen(entry);
          }}
          disabled={organizeMode}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="entry-row__name truncate font-medium">{entry.name}</span>
            <span
              className={`entry-row__amount shrink-0 tabular-nums ${
                entry.kind === 'income' ? 'text-success' : 'text-foreground'
              }`}
            >
              {formatMoney(signed, currency, locale, entry.kind === 'income')}
            </span>
          </div>
          <div className="text-muted flex min-w-0 items-center gap-x-3 text-xs">
            <FrequencyBadge frequency={entry.frequency} />
            <span className="inline-flex shrink-0 items-center gap-1">
              <MaterialSymbol name="event" className="text-[1rem]" />
              {entry.frequency === 'monthly'
                ? formatDueDay(entry.due_day, locale)
                : formatDueMonthDay(
                    due ? month : (entry.due_month ?? month),
                    entry.due_day,
                    locale,
                  )}
            </span>
            {accountName ? (
              <span className="inline-flex min-w-0 shrink items-center gap-1 truncate">
                <MaterialSymbol name="account_balance_wallet" className="text-[1rem]" />
                <span className="truncate">{accountName}</span>
              </span>
            ) : null}
            {entry.kind === 'credit' ? (
              <span className="inline-flex shrink-0 items-center gap-1">
                <MaterialSymbol name="credit_score" className="text-[1rem]" />
                {t('entry.credit')}
              </span>
            ) : null}
            {!due ? (
              <span className="entry-row__skip-badge shrink-0">{t('plan.notThisMonth')}</span>
            ) : null}
            {entry.comment ? (
              <span className="entry-row__comment ml-auto max-w-[45%] min-w-0 truncate text-right">
                {entry.comment}
              </span>
            ) : null}
          </div>
        </button>
      </div>
    </li>
  );
}

export function PlanListView({
  categories,
  entries,
  accounts,
  organizeMode,
  currency,
  locale,
  year,
  month,
  onOpenEntry,
  onReorder,
}: {
  categories: Category[];
  entries: Entry[];
  accounts: Account[];
  organizeMode: boolean;
  currency: string;
  locale: string;
  year: number;
  month: number;
  onOpenEntry: (entry: Entry) => void;
  onReorder: (next: {
    categories?: Array<{ id: string; sort_order: number }>;
    entries?: Array<{ id: string; sort_order: number; category_id?: string }>;
  }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const { sortedCategories, board } = sortableBoard(categories, entries);

  async function handleDragEnd(event: DragEndEvent) {
    if (event.canceled) return;
    const next = move(board, event);
    const payload = reorderFromBoard(
      board,
      next,
      sortedCategories.map((category) => category.id),
    );
    if (payload) await onReorder(payload);
  }

  if (sortedCategories.length === 0) {
    return <p className="text-muted py-8 text-center text-sm">{t('plan.empty')}</p>;
  }

  const list = (
    <div className="flex flex-col gap-4">
      {sortedCategories.map((category, index) => {
        const catEntries = entries
          .filter((entry) => entry.category_id === category.id)
          .sort((a, b) => a.sort_order - b.sort_order);
        if (catEntries.length === 0 && !organizeMode) return null;
        return (
          <SortableCategory
            key={category.id}
            category={category}
            index={index}
            organizeMode={organizeMode}
          >
            <ul className="glass-surface divide-glass-divider divide-y overflow-hidden">
              {catEntries.map((entry, entryIndex) => (
                <SortableEntryRow
                  key={entry.id}
                  entry={entry}
                  index={entryIndex}
                  organizeMode={organizeMode}
                  due={isDueInMonth(entry, year, month)}
                  accountName={
                    entry.account_id ? (accountMap.get(entry.account_id)?.name ?? null) : null
                  }
                  accountColor={
                    entry.account_id ? (accountMap.get(entry.account_id)?.color ?? null) : null
                  }
                  currency={currency}
                  locale={locale}
                  year={year}
                  month={month}
                  onOpen={onOpenEntry}
                />
              ))}
              {catEntries.length === 0 && organizeMode ? (
                <EmptyCategoryDrop
                  groupId={entryGroup(category.id)}
                  label={t('plan.emptyCategory')}
                />
              ) : null}
            </ul>
          </SortableCategory>
        );
      })}
    </div>
  );

  if (!organizeMode) return list;

  return (
    <DragDropProvider onDragEnd={(event) => void handleDragEnd(event)}>{list}</DragDropProvider>
  );
}
