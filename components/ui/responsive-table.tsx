'use client';

import * as React from 'react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface ResponsiveTableColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

interface ResponsiveTableProps<T> {
  columns: ResponsiveTableColumn<T>[];
  data: T[];
  getRowKey: (row: T) => string;
  /** Renders one row as a card on mobile. Falls back to a generic key/value card if omitted. */
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

  return (
    <div className={className}>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key} className={col.className}>
                  {col.header}
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
      <div className="grid gap-3 md:hidden">
        {data.map((row) => (
          <Card key={getRowKey(row)} className={cn('overflow-hidden')}>
            <CardContent className="p-4">
              {mobileCard ? (
                mobileCard(row)
              ) : (
                <dl className="space-y-1.5">
                  {columns.map((col) => (
                    <div key={col.key} className="flex justify-between gap-3 text-sm">
                      <dt className="text-muted-foreground">{col.header}</dt>
                      <dd className="text-right font-medium">{col.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
