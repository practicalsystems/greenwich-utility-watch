'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Nav() {
  const pathname = usePathname()

  const linkClass = (path: string) =>
    `transition-colors hover:text-amber-400 ${
      pathname === path ? 'text-amber-400' : 'text-slate-300'
    }`

  return (
    <nav className="bg-slate-900 text-white border-b border-slate-800">
      <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-8 h-8 bg-amber-500 rounded flex items-center justify-center shrink-0">
            <svg
              className="w-4 h-4 text-slate-900"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <div>
            <div className="font-bold text-base leading-tight group-hover:text-amber-400 transition-colors">
              Greenwich Utility Watch
            </div>
            <div className="text-xs text-slate-500">Greenwich Community Reporting</div>
          </div>
        </Link>

        <div className="flex items-center gap-6 text-sm font-medium">
          <Link href="/" className={linkClass('/')}>
            Report
          </Link>
          <Link href="/gallery" className={linkClass('/gallery')}>
            Gallery
          </Link>
          <Link href="/dashboard" className={linkClass('/dashboard')}>
            Impact
          </Link>
          <Link href="/about" className={linkClass('/about')}>
            About
          </Link>
        </div>
      </div>
    </nav>
  )
}
