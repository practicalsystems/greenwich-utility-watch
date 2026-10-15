import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import Link from 'next/link'
import Nav from '@/components/Nav'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

import { getSiteUrl } from '@/lib/site'

const SITE_URL = getSiteUrl()

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: {
    types: { 'application/rss+xml': `${SITE_URL}/feed.xml` },
  },
  title: {
    default: 'Greenwich Utility Watch',
    template: '%s — Greenwich Utility Watch',
  },
  description:
    'Help us document utility poles in Greenwich, CT that look unsafe, unstable, or unsightly.',
  openGraph: {
    title: 'Greenwich Utility Watch',
    description:
      'A community record of problem utility poles in Greenwich, CT. Snap a photo, report it, and help build the public record.',
    url: SITE_URL,
    siteName: 'Greenwich Utility Watch',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Greenwich Utility Watch',
    description:
      'A community record of problem utility poles in Greenwich, CT. Snap a photo, report it, and help build the public record.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans bg-slate-50 min-h-screen`}>
        <Nav />
        <main>{children}</main>
        <Analytics />
        <footer className="bg-slate-900 text-slate-400 text-sm py-8 mt-16">
          <div className="max-w-5xl mx-auto px-4 text-center space-y-1">
            <p className="font-medium text-slate-300">Greenwich Utility Watch</p>
            <p>A community reporting project · Greenwich, CT</p>
            <p className="pt-1">
              <Link href="/reports" className="hover:text-amber-400">Monthly reports</Link>
              {' · '}
              <Link href="/press" className="hover:text-amber-400">Press &amp; data</Link>
              {' · '}
              <a href="/feed.xml" className="hover:text-amber-400">RSS</a>
              {' · '}
              <a href="/data/reports.csv" className="hover:text-amber-400">CSV</a>
              {' · '}
              <a href="/data/reports.json" className="hover:text-amber-400">JSON</a>
            </p>
            <p className="text-xs text-slate-500">
              Not affiliated with any utility company or the Town of Greenwich
            </p>
          </div>
        </footer>
      </body>
    </html>
  )
}
