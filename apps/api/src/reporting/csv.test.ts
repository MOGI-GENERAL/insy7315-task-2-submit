import { describe, expect, test } from 'vitest';
import { toCsv } from './csv.js';

/** the file without its byte order mark */
const body = (csv: string) => csv.slice(1);

describe('toCsv', () => {
  test('starts with a UTF-8 byte order mark and ends every line with CRLF', () => {
    const csv = toCsv([['a', 'b'], ['c']]);

    expect(Buffer.from(csv, 'utf8').subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(body(csv)).toBe('a;b\r\nc\r\n');
  });

  test('writes an empty row as a blank line and an empty string as a blank cell', () => {
    expect(body(toCsv([['a', '', 'b'], [], ['c', '']]))).toBe('a;;b\r\n\r\nc;\r\n');
  });

  test('quotes a field with a comma, a semicolon, a quote or a line break', () => {
    const csv = toCsv([
      ['Harbour Hotel, Sea Point'],
      ['Ouma; Bakkery'],
      ['Ouma\'s "Kaapse" Bakery'],
      ['Siyakhula Shelter\nKhayelitsha'],
      ['line\r\nbreak'],
    ]);

    expect(body(csv)).toBe(
      [
        '"Harbour Hotel, Sea Point"',
        '"Ouma; Bakkery"',
        '"Ouma\'s ""Kaapse"" Bakery"',
        '"Siyakhula Shelter\nKhayelitsha"',
        '"line\r\nbreak"',
        '',
      ].join('\r\n'),
    );
  });

  test('leaves plain text, diacritics and ISO dates as they are', () => {
    expect(body(toCsv([["Ouma's Bakery", 'Koöperasie', '2026-10-01']]))).toBe(
      "Ouma's Bakery;Koöperasie;2026-10-01\r\n",
    );
  });

  test('puts an apostrophe before text that Excel would run as a formula', () => {
    const csv = toCsv([['=1+1', '+27821234567', '-Harbour', '@SUM(A1)', 'a=b']]);

    expect(body(csv)).toBe("'=1+1;'+27821234567;'-Harbour;'@SUM(A1);a=b\r\n");
  });

  test('guards a formula first and then quotes it', () => {
    const csv = toCsv([['=HYPERLINK("https://evil.example","Open")']]);

    expect(body(csv)).toBe('"\'=HYPERLINK(""https://evil.example"",""Open"")"\r\n');
  });

  test('writes numbers with a decimal comma and never guards them', () => {
    const csv = toCsv([[20, 7.9, 1.234, 0, -5, 12_500]]);

    expect(body(csv)).toBe('20;7,9;1,234;0;-5;12500\r\n');
  });
});
