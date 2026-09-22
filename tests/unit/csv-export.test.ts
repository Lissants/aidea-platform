import { describe, expect, it } from 'vitest';
import { toCsv, csvResponse } from '@/lib/exports/csv';

describe('toCsv', () => {
  it('produces a header row and one row per record, in column order', () => {
    const csv = toCsv(
      [
        { id: '1', name: 'Alpha', score: 10 },
        { id: '2', name: 'Beta', score: 20 },
      ],
      [
        { key: 'id', header: 'ID' },
        { key: 'name', header: 'Name' },
        { key: 'score', header: 'Score' },
      ]
    );
    const lines = csv.split('\n');
    expect(lines[0]).toBe('ID,Name,Score');
    expect(lines[1]).toBe('1,Alpha,10');
    expect(lines[2]).toBe('2,Beta,20');
  });

  it('quotes and escapes values containing commas, quotes, or newlines', () => {
    const csv = toCsv(
      [{ note: 'Contains, a comma' }, { note: 'Has "quotes" inside' }, { note: 'Multi\nline' }],
      [{ key: 'note', header: 'Note' }]
    );
    const lines = csv.split('\n');
    expect(lines[1]).toBe('"Contains, a comma"');
    expect(lines[2]).toBe('"Has ""quotes"" inside"');
    // The embedded newline keeps the quoted field on one CSV "line" logically,
    // but as a raw string split it still shows up as its own physical line.
    expect(csv).toContain('"Multi\nline"');
  });

  it('renders null/undefined as an empty field, not the string "null"', () => {
    const csv = toCsv([{ a: null, b: undefined, c: 'x' }], [
      { key: 'a', header: 'A' },
      { key: 'b', header: 'B' },
      { key: 'c', header: 'C' },
    ]);
    expect(csv.split('\n')[1]).toBe(',,x');
  });

  it('handles an empty row set (header only)', () => {
    const csv = toCsv([], [{ key: 'a', header: 'A' }]);
    expect(csv).toBe('A\n');
  });
});

describe('csvResponse', () => {
  it('sets CSV content type and an attachment disposition with the given filename', async () => {
    const response = csvResponse('a,b\n1,2', 'export.csv');
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="export.csv"');
    expect(await response.text()).toBe('a,b\n1,2');
  });
});
