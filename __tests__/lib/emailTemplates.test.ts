import { describe, it, expect } from 'vitest'
import { renderConfirmationEmail, renderMonthlyReportEmail, renderPoleUpdateEmail } from '@/lib/emailTemplates'
import { buildMonthlyReport } from '@/lib/monthlyReport'
import { toPublicReport, type PublicRow } from '@/lib/publicReport'

const SITE = 'https://example.org'
const UNSUB = 'https://example.org/subscribe/unsubscribe?token=abc'
const row: PublicRow = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  created_at: '2026-03-16T12:00:00Z',
  address: '12 <Loughlin> Ave',
  cross_streets: null,
  pole_id: null,
  latitude: 41.036,
  longitude: -73.599,
  description: 'desc',
  status: 'approved',
  photos: [],
  problem_type: 'Double Poles / Sistered Pole',
  duration: null,
  reported_to: 'Eversource',
  reported_at: '2026-09-22',
  official_response: 'Ticket <opened>',
  resolved_at: null,
}
const report = toPublicReport(row, SITE, Date.UTC(2026, 9, 1))

describe('renderConfirmationEmail', () => {
  it('contains the confirm link and says nothing is sent until confirmed', () => {
    const e = renderConfirmationEmail({ confirmUrl: 'https://example.org/subscribe/confirm?token=t' })
    expect(e.html).toContain('href="https://example.org/subscribe/confirm?token=t"')
    expect(e.text).toContain('https://example.org/subscribe/confirm?token=t')
    expect(e.html).toContain('nothing is sent until you do')
  })
  it('mentions the pole when it is a watch', () => {
    const e = renderConfirmationEmail({ confirmUrl: 'x', poleLocation: '12 <Loughlin> Ave' })
    expect(e.html).toContain('12 &lt;Loughlin&gt; Ave')
    expect(e.text).toContain('12 <Loughlin> Ave')
  })
})

describe('renderMonthlyReportEmail', () => {
  const d = buildMonthlyReport([report], '2026-09', new Date('2026-10-01T13:00:00Z'))
  const e = renderMonthlyReportEmail(d, SITE, UNSUB)
  it('has the headline numbers in the subject and the report link + unsubscribe in both parts', () => {
    expect(e.subject).toBe('State of the Poles — September 2026: 1 on record, oldest 198 days')
    expect(e.html).toContain(`${SITE}/reports/2026-09`)
    expect(e.html).toContain(`href="${UNSUB}"`)
    expect(e.text).toContain(`Unsubscribe: ${UNSUB}`)
  })
  it('escapes report content', () => {
    expect(e.html).toContain('12 &lt;Loughlin&gt; Ave')
    expect(e.html).not.toContain('<Loughlin>')
  })
})

describe('renderPoleUpdateEmail', () => {
  it('describes the change, includes follow-up details escaped, and the unsubscribe link', () => {
    const e = renderPoleUpdateEmail(report, { kind: 'follow_up' }, UNSUB)
    expect(e.subject).toContain('has an official follow-up recorded')
    expect(e.html).toContain('Reported to <strong>Eversource</strong> on 2026-09-22')
    expect(e.html).toContain('Ticket &lt;opened&gt;')
    expect(e.html).toContain(`href="${report.url}"`)
    expect(e.html).toContain(`href="${UNSUB}"`)
  })
  it('handles approval and resolution wording', () => {
    expect(renderPoleUpdateEmail(report, { kind: 'approved' }, UNSUB).subject).toContain('is now on the public record')
    expect(renderPoleUpdateEmail({ ...report, resolved_at: '2026-10-01' }, { kind: 'resolved' }, UNSUB).html).toContain('Resolved 2026-10-01')
  })
})
