'use client'

import dynamic from 'next/dynamic'
import type { MapReport } from './DashboardMap'

const DashboardMap = dynamic(() => import('./DashboardMap'), { ssr: false })

export default function DashboardMapLoader({ reports }: { reports: MapReport[] }) {
  return <DashboardMap reports={reports} />
}
