'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

export type MonthlyBucket = { month: string; count: number }
export type TypeCount = { type: string; count: number }

const COLORS = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#6b7280']

export function TimelineChart({ data }: { data: MonthlyBucket[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Reports Over Time</h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#94a3b8" />
          <Tooltip />
          <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function TypeChart({ data }: { data: TypeCount[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Reports by Problem Type</h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} stroke="#94a3b8" />
          <YAxis type="category" dataKey="type" tick={{ fontSize: 11 }} stroke="#94a3b8" width={160} />
          <Tooltip />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
