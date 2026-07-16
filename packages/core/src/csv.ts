/**
 * CSV serialization with spreadsheet formula-injection protection.
 *
 * Cells beginning with =, +, -, @ (or those characters after leading
 * whitespace/control chars) are prefixed with a single quote so Excel,
 * Sheets, and LibreOffice treat them as text. Applied to CSV output and to
 * string cells in XLSX exports.
 */

const FORMULA_TRIGGER = /^[\s\t\r\n]*[=+\-@]/;

/** Escape a value against spreadsheet formula injection. */
export function escapeFormulaInjection(value: string): string {
  if (FORMULA_TRIGGER.test(value)) return `'${value}`;
  return value;
}

function csvQuote(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export type CsvCell = string | number | boolean | null | undefined;

export function csvCellToString(cell: CsvCell): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'number') return Number.isFinite(cell) ? String(cell) : '';
  if (typeof cell === 'boolean') return cell ? 'true' : 'false';
  return escapeFormulaInjection(cell);
}

export interface CsvColumn<Row> {
  header: string;
  value: (row: Row) => CsvCell;
}

/** Serialize rows to RFC-4180 CSV with a UTF-8 BOM for Excel compatibility. */
export function toCsv<Row>(rows: readonly Row[], columns: readonly CsvColumn<Row>[]): string {
  const header = columns.map((col) => csvQuote(escapeFormulaInjection(col.header))).join(',');
  const lines = rows.map((row) =>
    columns.map((col) => csvQuote(csvCellToString(col.value(row)))).join(','),
  );
  return `﻿${[header, ...lines].join('\r\n')}\r\n`;
}
