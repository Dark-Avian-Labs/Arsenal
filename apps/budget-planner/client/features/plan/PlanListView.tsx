import { MaterialSymbol } from '@dark-avian-labs/ui';
import { move } from '@dnd-kit/helpers';
import { DragDropProvider, useDroppable, type DragEndEvent } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { amountForMonth, isDueInMonth } from '../../../shared/dueThisMonth';
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

function categoryDueNet(entries: Entry[], year: number, month: number): number | null {
  let net = 0;
  let due = false;
  for (const entry of entries) {
    const amount = amountForMonth(entry, year, month);
    if (amount == null) continue;
    due = true;
    net += entry.kind === 'income' ? amount : -amount;
  }
  return due ? net : null;
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
      className="text-muted hover:text-foreground flex h-11 w-11 shrink-0 cursor-grab items-center justify-center active:cursor-grabbing"
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
  dueNet,
  currency,
  locale,
  children,
}: {
  category: Category;
  index: number;
  organizeMode: boolean;
  dueNet: number | null;
  currency: string;
  locale: string;
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
        <h2 className="text-foreground min-w-0 flex-1 text-sm font-semibold">{category.name}</h2>
        {dueNet != null ? (
          <span
            className={`shrink-0 text-sm tabular-nums ${dueNet >= 0 ? 'text-success' : 'text-danger'}`}
          >
            {formatMoney(dueNet, currency, locale, true)}
          </span>
        ) : null}
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
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 sm:grid-cols-[minmax(8rem,1fr)_auto_7rem_6rem]">
            <span className="entry-row__name col-start-1 row-start-1 min-w-0 truncate font-medium">
              {entry.name}
            </span>
            <span
              className={`entry-row__amount col-start-2 row-start-1 text-right tabular-nums sm:col-start-4 ${
                displayAmount === 0 ? 'text-muted' : entry.kind === 'income' ? 'text-success' : ''
              }`}
            >
              {formatMoney(signed, currency, locale, true)}
            </span>
            <span className="text-muted col-span-2 col-start-1 row-start-2 flex min-w-0 gap-3 text-xs sm:contents">
              <span className="shrink-0 tabular-nums sm:col-start-2 sm:row-start-1">
                {entry.frequency === 'monthly'
                  ? formatDueDay(entry.due_day, locale)
                  : formatDueMonthDay(
                      due ? month : (entry.due_month ?? month),
                      entry.due_day,
                      locale,
                    )}
                {entry.frequency === 'quarterly' ? ` ${t('entry.quarterly')}` : null}
                {entry.frequency === 'halfyearly' ? ` ${t('entry.halfyearly')}` : null}
                {entry.frequency === 'yearly' ? ` ${t('entry.yearly')}` : null}
                {entry.frequency === 'once' ? ` ${t('entry.once')}` : null}
              </span>
              <span className="flex min-w-0 items-center gap-1 truncate sm:col-start-3 sm:row-start-1">
                {accountColor ? (
                  <span
                    className={`account-swatch account-swatch--${accountColor}`}
                    aria-hidden="true"
                  />
                ) : null}
                <span className="truncate">{accountName}</span>
              </span>
            </span>
          </div>
          {entry.comment || !due || entry.kind === 'credit' ? (
            <p className="entry-row__comment text-xs">
              {!due ? <span>{t('plan.notThisMonth')}</span> : null}
              {entry.kind === 'credit' ? <span>{t('entry.credit')}</span> : null}
              {entry.comment ? <span>{entry.comment}</span> : null}
            </p>
          ) : null}
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
            dueNet={categoryDueNet(catEntries, year, month)}
            currency={currency}
            locale={locale}
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
