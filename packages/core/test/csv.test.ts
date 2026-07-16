import { describe, expect, it } from 'vitest';
import { escapeFormulaInjection, toCsv } from '../src/csv';

describe('escapeFormulaInjection', () => {
  it('neutralizes formula triggers', () => {
    expect(escapeFormulaInjection('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(escapeFormulaInjection('+1234')).toBe("'+1234");
    expect(escapeFormulaInjection('-cmd|calc')).toBe("'-cmd|calc");
    expect(escapeFormulaInjection('@import')).toBe("'@import");
  });
  it('neutralizes triggers hidden behind whitespace', () => {
    expect(escapeFormulaInjection('  =HYPERLINK("http://evil")')).toBe(
      '\'  =HYPERLINK("http://evil")',
    );
    expect(escapeFormulaInjection('\t=1+1')).toBe("'\t=1+1");
  });
  it('leaves ordinary text alone', () => {
    expect(escapeFormulaInjection('Acme Inc')).toBe('Acme Inc');
    expect(escapeFormulaInjection('jane@acme.com')).toBe('jane@acme.com');
  });
});

describe('toCsv', () => {
  interface Row {
    name: string;
    email: string | null;
    rating: number;
  }
  const columns = [
    { header: 'Company', value: (r: Row) => r.name },
    { header: 'Email', value: (r: Row) => r.email },
    { header: 'Rating', value: (r: Row) => r.rating },
  ];

  it('quotes fields containing commas and quotes', () => {
    const csv = toCsv([{ name: 'Acme, "The" Shop', email: null, rating: 4.5 }], columns);
    expect(csv).toContain('"Acme, ""The"" Shop"');
  });

  it('renders null as empty and numbers plainly', () => {
    const csv = toCsv([{ name: 'A', email: null, rating: 5 }], columns);
    const dataLine = csv.split('\r\n')[1];
    expect(dataLine).toBe('A,,5');
  });

  it('escapes formula injection in data and headers', () => {
    const csv = toCsv([{ name: '=EVIL()', email: 'a@b.co', rating: 1 }], columns);
    expect(csv).toContain("'=EVIL()");
  });

  it('starts with a UTF-8 BOM and uses CRLF line endings', () => {
    const csv = toCsv([], columns);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});
