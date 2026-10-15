/**
 * Minimal RFC 4180 CSV writer. No dependency; quoting rules are the whole job.
 */

export type CsvValue = string | number | boolean | null | undefined

/**
 * Neutralise spreadsheet formula injection. Excel, Sheets and Numbers treat a
 * cell starting with = + - @ (or a tab/CR that a formula can hide behind) as a
 * formula, and report text is user-supplied. Prefixing an apostrophe makes
 * the cell literal text; spreadsheets hide the apostrophe on display.
 * Negative numbers are passed as numbers, not strings, so they are unaffected.
 */
export function neutraliseFormula(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

export function csvEscape(v: CsvValue): string {
  if (v == null) return ''
  const s = typeof v === 'string' ? neutraliseFormula(v) : String(v)
  // Quote when the value contains a comma, quote, CR or LF, or has leading/trailing space.
  if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function toCsv(columns: string[], rows: CsvValue[][]): string {
  const lines = [columns.map(csvEscape).join(',')]
  for (const row of rows) lines.push(row.map(csvEscape).join(','))
  return lines.join('\r\n') + '\r\n'
}
