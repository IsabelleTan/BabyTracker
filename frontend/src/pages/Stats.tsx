import { useState, useEffect, useMemo, useRef } from 'react'
import NightToggle from '@/components/NightToggle'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { getDailyStats, getEarliestEventDate, type DailyStat } from '@/lib/stats'
import { currentDayStart } from '@/lib/events'
import { timeAxisFormatter, formatDateAxis } from '@/lib/time'
import { computeYTicksMulti, computeYTicks, computeXTicks, pickTicks } from '@/lib/chartUtils'

type Range = '7d' | '30d' | 'all'

const COLORS = {
  sleep:   'oklch(0.55 0.15 250)',
  feeds:   'var(--color-primary)',
  pumped:  'oklch(0.52 0.16 165)',
  formula: 'oklch(0.60 0.15 50)',
  pee:     'oklch(0.52 0.17 225)',
  poo:     'oklch(0.52 0.11 55)',
}

type WeeklyPotty = { date: string; potty_wet: number; potty_dirty: number }
type WeeklyAccident = { date: string; accident_wet: number; accident_dirty: number }

function groupByWeek<T extends object>(
  data: DailyStat[],
  init: () => T,
  accumulate: (entry: T, d: DailyStat) => void,
): T[] {
  const weekMap = new Map<string, T & { date: string }>()
  for (const d of data) {
    const date = new Date(d.date + 'T00:00:00')
    const day = date.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const monday = new Date(date)
    monday.setDate(date.getDate() + diff)
    const key = monday.toISOString().slice(0, 10)
    if (!weekMap.has(key)) {
      weekMap.set(key, { ...init(), date: `${monday.getMonth() + 1}/${monday.getDate()}` })
    }
    accumulate(weekMap.get(key)!, d)
  }
  return [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v)
}

function groupPottyByWeek(data: DailyStat[]): WeeklyPotty[] {
  return groupByWeek<WeeklyPotty>(
    data,
    () => ({ date: '', potty_wet: 0, potty_dirty: 0 }),
    (entry, d) => {
      entry.potty_wet += d.potty_wet_count
      entry.potty_dirty += d.potty_dirty_count
    },
  )
}

function groupAccidentsByWeek(data: DailyStat[]): WeeklyAccident[] {
  return groupByWeek<WeeklyAccident>(
    data,
    () => ({ date: '', accident_wet: 0, accident_dirty: 0 }),
    (entry, d) => {
      entry.accident_wet += d.accident_wet_count
      entry.accident_dirty += d.accident_dirty_count
    },
  )
}

const RANGES: { label: string; value: Range }[] = [
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: 'All time', value: 'all' },
]

function getFixedRangeDates(range: '7d' | '30d'): { from: Date; to: Date } {
  const to = new Date()
  const from = currentDayStart()
  if (range === '7d') from.setDate(from.getDate() - 6)
  else from.setDate(from.getDate() - 29)
  to.setHours(23, 59, 59, 999)
  return { from, to }
}


export default function Stats() {
  const [range, setRange] = useState<Range>('7d')
  const [data, setData] = useState<DailyStat[]>([])
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
    setStatus('loading') // eslint-disable-line react-hooks/set-state-in-effect

    const run = async () => {
      let from: Date
      let to: Date
      if (range === 'all') {
        const earliest = await getEarliestEventDate()
        from = currentDayStart(earliest ?? new Date())
        to = new Date()
        to.setHours(23, 59, 59, 999)
      } else {
        ({ from, to } = getFixedRangeDates(range))
      }
      return getDailyStats(from, to)
    }

    run().then((d) => { setData(d); setStatus('success') }).catch(() => setStatus('error'))
  }, [range])

  const chartData = data.map((d) => ({ ...d, date: formatDateAxis(d.date) }))

  const weeklyPottyData = useMemo(() => groupPottyByWeek(data), [data])
  const weeklyAccidentData = useMemo(() => groupAccidentsByWeek(data), [data])

  return (
    <div className="w-full flex flex-col gap-6 p-4">
      {/* Range selector + night toggle */}
      <div className="flex items-center gap-2">
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
        <div className="ml-auto">
          <NightToggle />
        </div>
      </div>

      {status === 'loading' && <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>}
      {status === 'error' && <p className="text-sm text-destructive text-center py-8">Failed to load stats</p>}

      {status === 'success' && data.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No data for this period</p>
      )}

      {status === 'success' && data.length > 0 && (
        <>
          <Section title="Sleep">
            <SleepTimelineChart data={chartData} />
            <ChartCard
              title="Total sleep"
              data={chartData}
              dataKey="total_sleep_min"
              color={COLORS.sleep}
              timeAxis
              tickStep={300}
            />
            <ChartCard
              title="Sleep sessions"
              data={chartData}
              dataKey="sleep_session_count"
              color={COLORS.sleep}
              tickStep={2}
            />
            <ChartCard
              title="Median session length"
              data={chartData}
              dataKey="median_sleep_session_min"
              rawKey="sleep_session_durations_min"
              color={COLORS.sleep}
              timeAxis
              tickStep={60}
            />
            <ChartCard
              title="Median wake time between naps"
              data={chartData}
              dataKey="median_wake_min"
              rawKey="wake_durations_min"
              color={COLORS.sleep}
              timeAxis
              tickStep={60}
            />
          </Section>

          <Section title="Feeding">
            <ChartCard
              title="Feeds per day"
              data={chartData}
              dataKey="feed_count"
              color={COLORS.feeds}
            />
            <ChartCard
              title="Median feed interval"
              data={chartData}
              dataKey="median_feed_interval_min"
              rawKey="feed_intervals_min"
              color={COLORS.feeds}
              timeAxis
              tickStep={60}
            />
            <MultiLineChartCard
              title="Feed volume"
              data={chartData}
              lines={[
                {
                  dataKey: 'breast_min',
                  name: 'Breast',
                  color: COLORS.feeds,
                  yAxisId: 'left',
                  formatValue: (v) => `${Math.round(v)} min`,
                },
                {
                  dataKey: 'pumped_ml',
                  name: 'Pumped',
                  color: COLORS.pumped,
                  strokeStyle: 'dashed',
                  yAxisId: 'right',
                  formatValue: (v) => `${Math.round(v)} ml`,
                },
                {
                  dataKey: 'formula_ml',
                  name: 'Formula',
                  color: COLORS.formula,
                  strokeStyle: 'dotted',
                  yAxisId: 'right',
                  formatValue: (v) => `${Math.round(v)} ml`,
                },
              ]}
              formatLeftTick={(v) => v == null ? '' : `${v}m`}
              formatRightTick={(v) => v == null ? '' : `${v}ml`}
            />
          </Section>

          <Section title="Output">
            <MultiLineChartCard
              title="Output per day"
              data={chartData}
              lines={[
                {
                  dataKey: 'wet_count',
                  name: 'Pee',
                  color: COLORS.pee,
                  strokeStyle: 'dashed',
                  yAxisId: 'left',
                },
                {
                  dataKey: 'dirty_count',
                  name: 'Poo',
                  color: COLORS.poo,
                  yAxisId: 'left',
                },
              ]}
              leftTickStep={1}
            />
            {weeklyPottyData.length > 0 && (
              <MultiLineChartCard
                title="Potty per week"
                data={weeklyPottyData}
                lines={[
                  {
                    dataKey: 'potty_wet',
                    name: 'Pee',
                    color: COLORS.pee,
                    strokeStyle: 'dashed',
                    yAxisId: 'left',
                  },
                  {
                    dataKey: 'potty_dirty',
                    name: 'Poo',
                    color: COLORS.poo,
                    yAxisId: 'left',
                  },
                ]}
                leftTickStep={1}
              />
            )}
            {weeklyAccidentData.some((w) => w.accident_wet > 0 || w.accident_dirty > 0) && (
              <MultiLineChartCard
                title="Accidents per week"
                data={weeklyAccidentData}
                lines={[
                  {
                    dataKey: 'accident_wet',
                    name: 'Pee',
                    color: COLORS.pee,
                    strokeStyle: 'dashed',
                    yAxisId: 'left',
                  },
                  {
                    dataKey: 'accident_dirty',
                    name: 'Poo',
                    color: COLORS.poo,
                    yAxisId: 'left',
                  },
                ]}
                leftTickStep={1}
              />
            )}
          </Section>
        </>
      )}
    </div>
  )
}

function SleepTimelineChart({ data }: { data: (DailyStat & { date: string })[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setContainerWidth(el.offsetWidth)
    const ro = new ResizeObserver(() => setContainerWidth(el.offsetWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const xTickDates = useMemo(() => new Set(pickTicks(data.map((d) => d.date))), [data])

  const svgH = 220
  const ml = 36   // left margin for y-axis labels
  const mr = 8
  const mt = 4
  const mb = 20   // bottom margin for x-axis labels

  const chartW = Math.max(containerWidth - ml - mr, 0)
  const chartH = svgH - mt - mb

  const n = data.length
  const bandW = n > 0 ? chartW / n : 0

  // 0:00 at top, 24:00 at bottom
  const toY = (h: number) => mt + (h / 24) * chartH
  const toX = (i: number) => ml + i * bandW

  const gridColor = 'oklch(0.7 0.02 27 / 40%)'
  const tickFill = 'oklch(0.55 0.01 27)'

  return (
    <div className="w-full rounded-xl border border-primary/35 bg-card px-3 py-3 flex flex-col gap-2">
      <span className="text-sm font-medium">Sleep timeline</span>
      <div ref={containerRef} className="w-full">
        {containerWidth > 0 && (
          <svg width={containerWidth} height={svgH} style={{ display: 'block' }}>
            <defs>
              <clipPath id="sleep-timeline-bars">
                <rect x={ml} y={mt} width={chartW} height={chartH} />
              </clipPath>
            </defs>

            {[0, 6, 12, 18, 24].map((h) => (
              <g key={h}>
                <line
                  x1={ml} x2={ml + chartW}
                  y1={toY(h)} y2={toY(h)}
                  stroke={gridColor} strokeDasharray="3 3"
                />
                <text x={ml - 4} y={toY(h) + 4} textAnchor="end" fontSize={10} fill={tickFill}>
                  {h}:00
                </text>
              </g>
            ))}

            {data.map((d, i) => {
              if (!xTickDates.has(d.date)) return null
              const cx = toX(i) + bandW / 2
              return (
                <g key={d.date}>
                  <line
                    x1={cx} x2={cx}
                    y1={mt} y2={mt + chartH}
                    stroke={gridColor} strokeDasharray="3 3"
                  />
                  <text x={cx} y={svgH - 4} textAnchor="middle" fontSize={10} fill={tickFill}>
                    {d.date}
                  </text>
                </g>
              )
            })}

            <g clipPath="url(#sleep-timeline-bars)">
              {data.map((d, i) => {
                const x = toX(i)
                const pad = bandW * 0.1
                return (d.sleep_sessions_hours ?? []).map(([start, end], j) => {
                  const s = Math.max(0, Math.min(24, start))
                  const e = Math.max(0, Math.min(24, end))
                  if (s >= e) return null
                  return (
                    <rect
                      key={`${i}-${j}`}
                      x={x + pad}
                      y={toY(s)}
                      width={bandW - pad * 2}
                      height={Math.max(toY(e) - toY(s), 2)}
                      fill={COLORS.sleep}
                      opacity={0.75}
                      rx={2}
                    />
                  )
                })
              })}
            </g>
          </svg>
        )}
      </div>
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

type ChartLine = {
  dataKey: string
  color: string
  strokeStyle?: 'dashed' | 'dotted'
  name: string
  yAxisId?: 'left' | 'right'
  formatValue?: (v: number) => string
}

function MultiLineChartCard({
  title,
  data,
  lines,
  formatLeftTick,
  leftTickStep,
  formatRightTick,
  rightTickStep,
}: {
  title: string
  data: Record<string, unknown>[]
  lines: ChartLine[]
  formatLeftTick?: (v: number | null) => string
  leftTickStep?: number
  formatRightTick?: (v: number | null) => string
  rightTickStep?: number
}) {
  const leftKeys  = useMemo(() => lines.filter((l) => l.yAxisId !== 'right').map((l) => l.dataKey), [lines])
  const rightKeys = useMemo(() => lines.filter((l) => l.yAxisId === 'right').map((l) => l.dataKey), [lines])
  const hasDualAxis = rightKeys.length > 0

  const yLeft  = useMemo(() => computeYTicksMulti(data, leftKeys,  leftTickStep),  [data, leftKeys,  leftTickStep])
  const yRight = useMemo(() => computeYTicksMulti(data, rightKeys, rightTickStep), [data, rightKeys, rightTickStep])

  const xTicks = useMemo(() => computeXTicks(data), [data])

  const gridColor = 'oklch(0.7 0.02 27 / 40%)'
  const gridDash  = '3 3'

  return (
    <div className="w-full rounded-xl border border-primary/35 bg-card px-3 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <div className="flex items-center gap-3 shrink-0">
          {lines.map((line) => (
            <div key={line.dataKey} className="flex items-center gap-1.5">
              <svg width="16" height="8" aria-hidden="true">
                <line
                  x1="0" y1="4" x2="16" y2="4"
                  stroke={line.color}
                  strokeWidth="2"
                  strokeDasharray={line.strokeStyle === 'dotted' ? '2 2' : line.strokeStyle === 'dashed' ? '4 2' : undefined}
                />
              </svg>
              <span className="text-[10px] text-muted-foreground">{line.name}</span>
            </div>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart
          data={data}
          margin={{ top: 4, right: 4, left: -8, bottom: 0 }}
        >
          {yLeft.ticks.map((t) => (
            <ReferenceLine key={`yl${t}`} y={t} yAxisId="left" stroke={gridColor} strokeDasharray={gridDash} />
          ))}
          {xTicks.map((t) => (
            <ReferenceLine key={`x${t}`} x={t} stroke={gridColor} strokeDasharray={gridDash} />
          ))}
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            ticks={xTicks}
            interval={0}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatLeftTick ?? String}
            width={48}
            ticks={yLeft.ticks}
            domain={yLeft.domain}
            interval={0}
          />
          {hasDualAxis && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatRightTick ?? String}
              width={48}
              ticks={yRight.ticks}
              domain={yRight.domain}
              interval={0}
            />
          )}
          <Tooltip
            formatter={(value, name) => {
              const line = lines.find((l) => l.name === name)
              const formatted = line?.formatValue
                ? line.formatValue(value as number)
                : String(value)
              return [formatted, line?.name ?? String(name)]
            }}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: '1px solid oklch(0.7 0.04 27)',
              background: 'var(--color-card)',
            }}
          />
          {lines.map((line) => (
            <Line
              key={line.dataKey}
              type="monotone"
              dataKey={line.dataKey}
              name={line.name}
              stroke={line.color}
              strokeWidth={2}
              strokeDasharray={line.strokeStyle === 'dotted' ? '2 2' : line.strokeStyle === 'dashed' ? '5 3' : undefined}
              yAxisId={line.yAxisId ?? 'left'}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function snakeToLabel(key: string) {
  return key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

function ChartCard({
  title,
  data,
  dataKey,
  color,
  formatTick,
  timeAxis,
  tickStep,
  rawKey,
}: {
  title: string
  data: Record<string, unknown>[]
  dataKey: string
  color: string
  formatTick?: (v: number | null) => string
  timeAxis?: boolean
  tickStep?: number
  rawKey?: string
}) {
  const hasRaw = rawKey != null

  const { dotData, slotKeys } = useMemo(() => {
    if (!hasRaw) return { dotData: data, slotKeys: [] as string[] }
    const maxSlots = data.reduce(
      (m, d) => Math.max(m, ((d[rawKey] as number[]) ?? []).length),
      0,
    )
    const keys = Array.from({ length: maxSlots }, (_, i) => `_v${i}`)
    const transformed = data.map((d) => {
      const vals = (d[rawKey] as number[]) ?? []
      const slots: Record<string, number | null> = {}
      for (let i = 0; i < maxSlots; i++) {
        slots[`_v${i}`] = i < vals.length ? vals[i] : null
      }
      return { ...d, ...slots }
    })
    return { dotData: transformed, slotKeys: keys }
  }, [data, hasRaw, rawKey])

  const yConfig = useMemo(
    () =>
      hasRaw
        ? computeYTicksMulti(dotData, [dataKey, ...slotKeys], tickStep)
        : computeYTicks(data, dataKey, tickStep),
    [data, dotData, dataKey, tickStep, hasRaw, slotKeys],
  )

  const resolvedFormatTick = timeAxis ? timeAxisFormatter(yConfig.domain[1]) : (formatTick ?? String)

  const xTicks = useMemo(() => computeXTicks(data), [data])

  const gridColor = 'oklch(0.7 0.02 27 / 40%)'
  const gridDash = '3 3'
  const contentStyle = {
    fontSize: 12,
    borderRadius: 8,
    border: '1px solid oklch(0.7 0.04 27)',
    background: 'var(--color-card)',
  }

  const sharedAxes = (
    <>
      {yConfig.ticks.map((t) => (
        <ReferenceLine key={`y${t}`} y={t} stroke={gridColor} strokeDasharray={gridDash} />
      ))}
      {xTicks.map((t) => (
        <ReferenceLine key={`x${t}`} x={t} stroke={gridColor} strokeDasharray={gridDash} />
      ))}
      <XAxis
        dataKey="date"
        tick={{ fontSize: 10 }}
        tickLine={false}
        axisLine={false}
        ticks={xTicks}
        interval={0}
      />
      <YAxis
        tick={{ fontSize: 10 }}
        tickLine={false}
        axisLine={false}
        tickFormatter={resolvedFormatTick}
        width={48}
        ticks={yConfig.ticks}
        domain={yConfig.domain}
        interval={0}
      />
    </>
  )

  return (
    <div className="w-full rounded-xl border border-primary/35 bg-card px-3 py-3 flex flex-col gap-3">
      <span className="text-sm font-medium">{title}</span>
      <ResponsiveContainer width="100%" height={150}>
        {hasRaw ? (
          <LineChart data={dotData} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
            {sharedAxes}
            <Tooltip
              content={(props) => {
                if (!props.active || !props.payload?.length) return null
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const entry = props.payload.find((p: any) => p.name === '__median__')
                if (!entry || entry.value == null) return null
                const formatted = resolvedFormatTick(entry.value as number)
                return (
                  <div style={{ ...contentStyle, padding: '10px' }}>
                    <p style={{ margin: 0, marginBottom: 4 }}>{props.label}</p>
                    <p style={{ margin: 0, color: entry.color ?? color }}>{title} : {formatted}</p>
                  </div>
                )
              }}
            />
            {slotKeys.map((key) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={color}
                strokeWidth={0}
                dot={{ r: 3, fill: 'oklch(0.6 0 0)', fillOpacity: 0.5 }}
                activeDot={false}
                legendType="none"
                isAnimationActive={false}
                connectNulls={false}
              />
            ))}
            <Line
              type="monotone"
              dataKey={dataKey}
              name="__median__"
              stroke={color}
              strokeWidth={2}
              dot={{ r: 5, fill: color, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: color, strokeWidth: 0 }}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        ) : (
          <LineChart data={data} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
            {sharedAxes}
            <Tooltip
              formatter={(value, name) => [
                resolvedFormatTick(value as number | null),
                snakeToLabel(String(name)),
              ]}
              contentStyle={contentStyle}
            />
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
