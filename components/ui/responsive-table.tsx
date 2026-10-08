import * as React from 'react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface ResponsiveTableColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
  /**
   * How the column is shown in the mobile card:
   *  - 'title'  → the card's heading (use for the record's name)
   *  - 'action' → a full-width, 44px-tall row at the bottom of the card
   *  - 'hidden' → omitted on mobile (secondary detail)
   *  - default  → a left-aligned label/value pair
   */
  mobile?: 'title' | 'action' | 'hidden';
}

interface ResponsiveTableProps<T> {
  columns: ResponsiveTableColumn<T>[];
  data: T[];
  getRowKey: (row: T) => string;
  /** Renders one row as a card on mobile. Falls back to a card built from the column roles if omitted. */
  mobileCard?: (row: T) => React.ReactNode;
  emptyState?: React.ReactNode;
  className?: string;
}

/**
 * Desktop: a real <table>. Mobile (< md breakpoint): a stacked card list
 * driven by the same columns/data, so callers never maintain two views.
 */
export function ResponsiveTable<T>({
  columns,
  data,
  getRowKey,
  mobileCard,
  emptyState,
  className,
}: ResponsiveTableProps<T>) {
  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const titleCol = columns.find((c) => c.mobile === 'title');
  const actionCols = columns.filter((c) => c.mobile === 'action');
  const detailCols = columns.filter((c) => !c.mobile);

  return (
    <div className={className}>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key} className={col.className}>
                  {col.header || <span className="sr-only">Actions</span>}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={getRowKey(row)}>
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.className}>
                    {col.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="grid gap-3 md:hidden">
        {data.map((row) => (
          <li key={getRowKey(row)}>
            <Card className="overflow-hidden">
              {mobileCard ? (
                <div className="p-4">{mobileCard(row)}</div>
              ) : (
                <>
                  <div className="space-y-3 p-4">
                    {titleCol && <p className="break-words text-base font-bold leading-snug">{titleCol.cell(row)}</p>}
                    <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
                      {detailCols.map((col) => (
                        <React.Fragment key={col.key}>
                          <dt className="text-muted-foreground">{col.header}</dt>
                          <dd className="min-w-0 break-words">{col.cell(row)}</dd>
                        </React.Fragment>
                      ))}
                    </dl>
                  </div>
                  {actionCols.map((col) => (
                    <div
                      key={col.key}
                      className="flex min-h-11 items-stretch border-t text-sm font-semibold [&>a]:flex [&>a]:flex-1 [&>a]:items-center [&>a]:px-4"
                    >
                      {col.cell(row)}
                    </div>
                  ))}
                </>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
