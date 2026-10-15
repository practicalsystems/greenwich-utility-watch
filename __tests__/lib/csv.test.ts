import { describe, it, expect } from 'vitest'
import { csvEscape, neutraliseFormula, toCsv } from '@/lib/csv'

describe('csvEscape', () => {
  it('passes plain values through', () => {
    expect(csvEscape('abc')).toBe('abc')
    expect(csvEscape(12)).toBe('12')
    expect(csvEscape(true)).toBe('true')
  })
  it('renders null and undefined as empty', () => {
    expect(csvEscape(null)).toBe('')
    expect(csvEscape(undefined)).toBe('')
  })
  it('quotes commas, quotes and newlines, doubling inner quotes', () => {
    expect(csvEscape('a,b')).toBe('"a,b"')
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""')
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"')
    expect(csvEscape(' padded ')).toBe('" padded "')
  })
})

describe('formula injection', () => {
  it('prefixes cells that a spreadsheet would evaluate as a formula', () => {
    expect(neutraliseFormula('=HYPERLINK("http://evil")')).toBe(`'=HYPERLINK("http://evil")`)
    expect(neutraliseFormula('+1+1')).toBe(`'+1+1`)
    expect(neutraliseFormula('-2+3')).toBe(`'-2+3`)
    expect(neutraliseFormula('@SUM(A1)')).toBe(`'@SUM(A1)`)
    expect(neutraliseFormula('\t=cmd')).toBe(`'\t=cmd`)
  })
  it('leaves ordinary text and numbers alone', () => {
    expect(neutraliseFormula('Pole leaning 10 degrees')).toBe('Pole leaning 10 degrees')
    expect(csvEscape(-73.6)).toBe('-73.6')
    expect(csvEscape(41.03)).toBe('41.03')
  })
  it('applies through csvEscape, with quoting when needed', () => {
    expect(csvEscape('=1+1')).toBe(`'=1+1`)
    expect(csvEscape('=SUM(A1,B1)')).toBe(`"'=SUM(A1,B1)"`)
  })
})

describe('toCsv', () => {
  it('writes a header and CRLF-terminated rows', () => {
    const out = toCsv(['id', 'note'], [['1', 'plain'], ['2', 'has, comma']])
    expect(out).toBe('id,note\r\n1,plain\r\n2,"has, comma"\r\n')
  })
})
