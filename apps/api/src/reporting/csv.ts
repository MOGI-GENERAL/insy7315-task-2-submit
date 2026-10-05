/** an empty string is a blank cell */
export type CsvCell = string | number;
export type CsvRow = CsvCell[];

/** Excel on South African settings has a decimal comma and splits CSV on semicolons */
const SEPARATOR = ';';

/** without it Excel reads the file as ANSI and mangles diacritics */
const BOM = '﻿';

/** Excel runs a cell starting with one of these as a formula. an apostrophe in front stops it */
const FORMULA_START = /^[=+\-@]/;

const NEEDS_QUOTES = /[;,"\r\n]/;

function textCell(value: string) {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** never guarded. a negative number has to stay a number */
function numberCell(value: number) {
  return String(value).replace('.', ',');
}

export function toCsv(rows: CsvRow[]) {
  const lines = rows.map((row) =>
    row
      .map((cell) => (typeof cell === 'number' ? numberCell(cell) : textCell(cell)))
      .join(SEPARATOR),
  );
  return BOM + lines.map((line) => `${line}\r\n`).join('');
}
