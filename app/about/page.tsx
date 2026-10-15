import type { Metadata } from 'next'
import { CONTACT_EMAIL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'About — Greenwich Utility Watch',
  description:
    'Greenwich Utility Watch is a community documentation project tracking unsafe and unsightly utility poles in Greenwich, CT.',
}

export default function AboutPage() {
  return (
    <div>
      <div className="bg-slate-900 text-white py-10 px-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold mb-2">About This Project</h1>
          <p className="text-slate-300">A community documentation effort. Not affiliated with any utility company or the Town of Greenwich.</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-10">
        <article className="prose-custom space-y-6 text-slate-700 leading-relaxed">

          <p className="text-lg text-slate-800">
            Greenwich Utility Watch was started in early 2026 by a Greenwich resident who kept
            noticing something that didn&apos;t seem right: utility poles around town that looked
            temporary, unstable, or just plain shoddy — and had apparently been that way for years.
          </p>

          <p>
            The specific incidents that prompted this project: poles that had been
            &ldquo;sistered&rdquo; — a second pole installed directly next to a cracked original,
            often planted right in the middle of a sidewalk. And in at least one case, a pole base
            that appeared to consist of scrap 2×4 lumber laid on bare dirt, left in place for over
            two years.
          </p>

          <p>
            After noticing that NBC Connecticut had been{' '}
            <a
              href="https://www.nbcconnecticut.com/investigations/nbc-connecticut-investigates-why-double-utility-poles-keep-lingering-for-years-across-the-state/3707785/"
              target="_blank"
              rel="noreferrer"
              className="text-amber-700 font-medium underline underline-offset-2 hover:text-amber-900"
            >
              investigating the same issue statewide
            </a>
            {' '}— reporting that Connecticut&apos;s utilities count more than 21,000 double poles —
            it seemed like the right moment to start documenting what&apos;s happening specifically
            in Greenwich.
          </p>

          <p>
            State legislators tried to fix this. A 2026 bill,{' '}
            <a
              href="https://www.cga.ct.gov/asp/cgabillstatus/cgabillstatus.asp?selBillType=Bill&bill_num=SB00421&which_year=2026"
              target="_blank"
              rel="noreferrer"
              className="text-amber-700 font-medium underline underline-offset-2 hover:text-amber-900"
            >
              SB 421
            </a>
            , would have created an official statewide system for reporting double poles, with fines
            for poles left standing too long. It won bipartisan committee approval in March 2026 but
            died without a Senate vote when the session ended in May. So today there is still no
            official place for residents to report a problem pole and see what happens next. This
            site is an attempt to fill that gap for our town.
          </p>

          <p>
            This site is that documentation effort. Anyone can submit a photo and location. The goal
            is to build a public record that can be shared with town officials, state legislators,
            and utility regulators — not to attack anyone, but to invite a real conversation about
            maintaining our town&apos;s infrastructure thoughtfully and sustainably.
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3 text-sm">
            <p className="font-semibold text-slate-800">Want to help beyond submitting a report?</p>
            <p className="text-slate-700">
              Call Eversource at{' '}
              <a href="tel:18002862000" className="font-semibold text-amber-700 hover:underline">
                1-800-286-2000
              </a>{' '}
              for the pole itself or the top (electric) wires, and Frontier at{' '}
              <a href="tel:18009218101" className="font-semibold text-amber-700 hover:underline">
                1-800-921-8101
              </a>{' '}
              for the lower (phone/communications) wires — that split is who actually owns what.
              Note the date and the name of the person you spoke with.
            </p>
            <p className="text-slate-700 border-t border-amber-200 pt-3">
              If nothing happens, escalate to the state regulator: PURA takes complaints at{' '}
              <a
                href="https://portal.ct.gov/pura/consumer-services/file-a-complaint"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-amber-700 hover:underline"
              >
                portal.ct.gov/pura
              </a>{' '}
              or 1-800-382-4586.
            </p>
            <p className="text-slate-700 border-t border-amber-200 pt-3">
              NBC Connecticut is also collecting reports at{' '}
              <a
                href="mailto:shareit@nbcconnecticut.com"
                className="font-medium text-amber-700 hover:underline"
              >
                shareit@nbcconnecticut.com
              </a>
            </p>
          </div>

          <p className="text-sm text-slate-500 border-t border-slate-100 pt-6">
            This project was built entirely using Claude and Claude Code by someone with no web
            development experience. If you notice any issues with the site, please get in touch at{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-medium text-amber-700 hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>

        </article>
      </div>
    </div>
  )
}
