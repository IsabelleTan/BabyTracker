import { useEffect, useState } from 'react'
import { Moon, Trophy, Baby } from 'lucide-react'
import { getLeaderboards, type LeaderboardData, type ParentStat } from '@/lib/leaderboards'

function fmtMins(mins: number | null | undefined): string {
  if (mins == null) return '—'
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`
}

export default function Leaderboards() {
  const [data, setData] = useState<LeaderboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    getLeaderboards()
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <p className="text-sm text-muted-foreground text-center py-16">Loading…</p>
  }
  if (error || !data) {
    return <p className="text-sm text-destructive text-center py-16">Failed to load leaderboards</p>
  }

  return (
    <div className="flex flex-col gap-6 py-4">
      <RecordsSection data={data} />
      <AwardsSection parents={data.parents} />
    </div>
  )
}

// ── Records ──────────────────────────────────────────────────────────────────

function RecordsSection({ data }: { data: LeaderboardData }) {
  const rows: { label: string; value: string; sub: string }[] = [
    {
      label: 'Longest sleep',
      value: fmtMins(data.longest_sleep_min),
      sub: fmtDate(data.longest_sleep_date),
    },
    {
      label: 'Best night',
      value: fmtMins(data.best_night_min),
      sub: fmtDate(data.best_night_date),
    },
    {
      label: 'Worst night',
      value: fmtMins(data.worst_night_min),
      sub: fmtDate(data.worst_night_date),
    },
    {
      label: 'Most feeds in a day',
      value: data.most_feeds_count != null ? String(data.most_feeds_count) : '—',
      sub: fmtDate(data.most_feeds_date),
    },
    {
      label: 'Most poop diapers in a day',
      value: data.most_poop_count != null ? String(data.most_poop_count) : '—',
      sub: fmtDate(data.most_poop_date),
    },
  ]

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
        Records
      </h2>
      <div className="rounded-xl border border-primary/35 bg-surface divide-y divide-primary/15">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm">{row.label}</span>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold">{row.value}</span>
              {row.sub && (
                <span className="text-xs text-muted-foreground">{row.sub}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Awards ───────────────────────────────────────────────────────────────────

interface Award {
  icon: React.ReactNode
  title: string
  subtitle: string
  getValue: (p: ParentStat) => number
  formatValue: (n: number) => string
  higherIsBetter: boolean
}

const AWARDS: Award[] = [
  {
    icon: <Moon className="w-5 h-5" />,
    title: 'Night Shift Ninja',
    subtitle: 'Most events logged between 9 pm – 7 am',
    getValue: (p) => p.night_shifts,
    formatValue: (n) => `${n} logs`,
    higherIsBetter: true,
  },
  {
    icon: <Trophy className="w-5 h-5" />,
    title: 'Chief Log Officer',
    subtitle: 'Most events logged overall',
    getValue: (p) => p.total_logs,
    formatValue: (n) => `${n} logs`,
    higherIsBetter: true,
  },
  {
    icon: <Baby className="w-5 h-5" />,
    title: 'Number One at Number Two',
    subtitle: 'Most poop diapers changed',
    getValue: (p) => p.poop_changes,
    formatValue: (n) => `${n} changes`,
    higherIsBetter: true,
  },
]

function AwardsSection({ parents }: { parents: ParentStat[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
        Awards
      </h2>
      <div className="flex flex-col gap-3">
        {AWARDS.map((award) => (
          <AwardCard key={award.title} award={award} parents={parents} />
        ))}
      </div>
    </section>
  )
}

function AwardCard({ award, parents }: { award: Award; parents: ParentStat[] }) {
  const values = parents.map((p) => award.getValue(p))
  const winnerIdx = award.higherIsBetter
    ? values.indexOf(Math.max(...values))
    : values.indexOf(Math.min(...values))

  return (
    <div className="rounded-xl border border-primary/35 bg-surface px-4 py-3 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-primary">
        {award.icon}
        <div>
          <p className="text-sm font-semibold leading-tight">{award.title}</p>
          <p className="text-xs text-muted-foreground">{award.subtitle}</p>
        </div>
      </div>
      <div className="flex gap-3">
        {parents.map((p, i) => {
          const isWinner = i === winnerIdx
          return (
            <div
              key={p.display_name}
              className={`flex-1 rounded-lg px-3 py-2 flex flex-col items-center gap-0.5 ${
                isWinner
                  ? 'bg-primary/15 border border-primary/40'
                  : 'bg-background/60 border border-primary/15'
              }`}
            >
              <span
                className={`text-lg font-bold leading-tight ${isWinner ? 'text-primary' : 'text-foreground'}`}
              >
                {award.formatValue(award.getValue(p))}
              </span>
              <span className="text-xs text-muted-foreground">{p.display_name}</span>
              {isWinner && (
                <span className="text-xs font-medium text-primary mt-0.5">winner</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
