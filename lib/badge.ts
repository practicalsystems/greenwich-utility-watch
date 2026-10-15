/**
 * Embeddable SVG badge: "N poles reported · oldest X days".
 *
 * Pure renderer. Served by /badge.svg and embedded by neighborhood
 * association sites and newsletters as a plain <img>, which works everywhere
 * (this site's CSP forbids iframes, and an image needs no script).
 */

export type BadgeStyle = 'light' | 'dark'

export interface BadgeInput {
  total: number
  oldestDays: number
  style?: BadgeStyle
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export const BADGE_LABEL = 'Greenwich Utility Watch'

export function badgeValueText({ total, oldestDays }: Pick<BadgeInput, 'total' | 'oldestDays'>): string {
  const poles = `${total} pole${total === 1 ? '' : 's'} reported`
  return total > 0 ? `${poles} · oldest ${oldestDays} day${oldestDays === 1 ? '' : 's'}` : 'No poles reported yet'
}

// Average glyph width at 11px in the system UI stack; generous so text never clips.
const CHAR_W = 6.4
const PAD = 8
const HEIGHT = 20

function textWidth(s: string): number {
  return Math.ceil(s.length * CHAR_W) + PAD * 2
}

export function renderBadgeSvg(input: BadgeInput): string {
  const style = input.style ?? 'light'
  const label = BADGE_LABEL
  const value = badgeValueText(input)
  const lw = textWidth(label)
  const vw = textWidth(value)
  const w = lw + vw

  const colors =
    style === 'dark'
      ? { label: '#0f172a', value: '#f59e0b', labelText: '#e2e8f0', valueText: '#0f172a' }
      : { label: '#1e293b', value: '#f59e0b', labelText: '#ffffff', valueText: '#1e293b' }

  const aria = `${label}: ${value}`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${HEIGHT}" role="img" aria-label="${escapeXml(aria)}">
  <title>${escapeXml(aria)}</title>
  <clipPath id="r"><rect width="${w}" height="${HEIGHT}" rx="4" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${lw}" height="${HEIGHT}" fill="${colors.label}"/>
    <rect x="${lw}" width="${vw}" height="${HEIGHT}" fill="${colors.value}"/>
  </g>
  <g fill="${colors.labelText}" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif" font-size="11">
    <text x="${lw / 2}" y="14">${escapeXml(label)}</text>
    <text x="${lw + vw / 2}" y="14" fill="${colors.valueText}" font-weight="600">${escapeXml(value)}</text>
  </g>
</svg>
`
}
