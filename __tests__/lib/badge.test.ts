import { describe, it, expect } from 'vitest'
import { badgeValueText, renderBadgeSvg } from '@/lib/badge'

describe('badgeValueText', () => {
  it('pluralises correctly', () => {
    expect(badgeValueText({ total: 15, oldestDays: 213 })).toBe('15 poles reported · oldest 213 days')
    expect(badgeValueText({ total: 1, oldestDays: 1 })).toBe('1 pole reported · oldest 1 day')
  })
  it('has an honest empty state', () => {
    expect(badgeValueText({ total: 0, oldestDays: 0 })).toBe('No poles reported yet')
  })
})

describe('renderBadgeSvg', () => {
  it('is an SVG with the numbers, a title and an aria-label', () => {
    const svg = renderBadgeSvg({ total: 15, oldestDays: 213 })
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain('role="img"')
    expect(svg).toContain('aria-label="Greenwich Utility Watch: 15 poles reported · oldest 213 days"')
    expect(svg).toContain('<title>Greenwich Utility Watch: 15 poles reported · oldest 213 days</title>')
    expect(svg.trim().endsWith('</svg>')).toBe(true)
  })
  it('grows with the text and supports a dark style', () => {
    const w = (s: string) => Number(/width="(\d+)"/.exec(s)![1])
    expect(w(renderBadgeSvg({ total: 1500, oldestDays: 1000 }))).toBeGreaterThan(w(renderBadgeSvg({ total: 1, oldestDays: 1 })))
    expect(renderBadgeSvg({ total: 1, oldestDays: 1, style: 'dark' })).toContain('fill="#0f172a"')
  })
})
