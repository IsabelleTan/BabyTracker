import { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { getDailyStats, getEarliestEventDate, type DailyStat } from '@/lib/stats'

type Range = '7d' | '30d' | 'all'

const RANGES: { label: string; value: Range }[] = [
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: 'All time', value: 'all' },
]

function getFixedRangeDates(range: '7d' | '30d'): { from: Date; to: Date } {
  const to = new Date()
  const from = new Date()
  if (range === '7d') from.setDate(to.getDate() - 6)
  else from.setDate(to.getDate() - 29)
  from.setHours(0, 0, 0, 0)
  to.setHours(23, 59, 59, 999)
  return { from, to }
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function fmtMins(mins: number | null | undefined): string {
  if (mins == null) return '—'
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export default function Stats() {
  const [range, setRange] = useState<Range>('7d')
  const [data, setData] = useState<DailyStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    const to = new Date()
    to.setHours(23, 59, 59, 999)

    const run = async () => {
      let from: Date
      if (range === 'all') {
        const earliest = await getEarliestEventDate()
        from = earliest ?? new Date()
        from.setHours(0, 0, 0, 0)
      } else {
        from = getFixedRangeDates(range).from
      }
      return getDailyStats(from, to)
    }

    run().then(setData).catch(() => setError(true)).finally(() => setLoading(false))
  }, [range])

  const chartData = data.map((d) => ({ ...d, date: fmtDate(d.date) }))

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* Range selector */}
      <div className="flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              range === r.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-surface text-foreground border border-primary/20'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>}
      {error && <p className="text-sm text-destructive text-center py-8">Failed to load stats</p>}

      {!loading && !error && data.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No data for this period</p>
      )}

      {!loading && !error && data.length > 0 && (
        <>
          <Section title="Sleep">
            <ChartCard
              title="Total sleep"
              data={chartData}
              dataKey="total_sleep_min"
              unit="min"
              color="oklch(0.55 0.15 250)"
              formatTick={fmtMins}
            />
            <ChartCard
              title="Sleep sessions"
              data={chartData}
              dataKey="sleep_session_count"
              unit=""
              color="oklch(0.55 0.15 250)"
            />
            <ChartCard
              title="Avg session length"
              data={chartData}
              dataKey="avg_sleep_session_min"
              unit="min"
              color="oklch(0.55 0.15 250)"
              formatTick={fmtMins}
            />
            <ChartCard
              title="Avg wake time between naps"
              data={chartData}
              dataKey="avg_wake_min"
              unit="min"
              color="oklch(0.55 0.15 250)"
              formatTick={fmtMins}
            />
          </Section>

          <Section title="Feeding">
            <ChartCard
              title="Feeds per day"
              data={chartData}
              dataKey="feed_count"
              unit=""
              color="var(--color-primary)"
            />
            <ChartCard
              title="Avg feed interval"
              data={chartData}
              dataKey="avg_feed_interval_min"
              unit="min"
              color="var(--color-primary)"
              formatTick={fmtMins}
            />
          </Section>

          <Section title="Diapers">
            <ChartCard
              title="Diapers per day"
              data={chartData}
              dataKey="diaper_count"
              unit=""
              color="oklch(0.65 0.15 85)"
            />
          </Section>
        </>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
        {title}
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  )
}

function ChartCard({
  title,
  data,
  dataKey,
  color,
  formatTick,
}: {
  title: string
  data: Record<string, unknown>[]
  dataKey: string
  unit: string
  color: string
  formatTick?: (v: number | null) => string
}) {
  return (
    <div className="rounded-xl border border-primary/35 bg-surface p-4 flex flex-col gap-3">
      <span className="text-sm font-medium">{title}</span>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.7 0.02 27 / 40%)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatTick ?? String}
            width={48}
          />
          <Tooltip
            formatter={(value) =>
              formatTick ? formatTick(value as number | null) : String(value)
            }
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: '1px solid oklch(0.7 0.04 27)',
              background: 'var(--color-card)',
            }}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
