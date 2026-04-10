import { useEffect, useState } from 'react'
import { Moon, Trophy, Baby, Sparkles } from 'lucide-react'
import { getLeaderboards, buildNotifications, type LeaderboardData, type ParentStat } from '@/lib/leaderboards'

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

  const notifications = buildNotifications(data)

  return (
    <div className="flex flex-col gap-6 py-4">
      {notifications.length > 0 && (
        <div className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-primary">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span className="text-sm font-semibold">New today</span>
          </div>
          {notifications.map((n) => (
            <p key={n} className="text-xs text-foreground pl-5">{n}</p>
          ))}
        </div>
      )}
      <RecordsSection data={data} />
      <AwardsSection data={data} />
    </div>
  )
}

// ── Records ──────────────────────────────────────────────────────────────────

function NewBadge() {
  return (
    <span className="text-xs font-medium text-primary bg-primary/15 rounded-full px-2 py-0.5 ml-1.5">
      New!
    </span>
  )
}

function RecordsSection({ data }: { data: LeaderboardData }) {
  const rows: { label: string; value: string; sub: string; isNew: boolean }[] = [
    {
      label: 'Longest sleep',
      value: fmtMins(data.longest_sleep_min),
      sub: fmtDate(data.longest_sleep_date),
      isNew: data.longest_sleep_new,
    },
    {
      label: 'Best night',
      value: fmtMins(data.best_night_min),
      sub: fmtDate(data.best_night_date),
      isNew: data.best_night_new,
    },
    {
      label: 'Worst night',
      value: fmtMins(data.worst_night_min),
      sub: fmtDate(data.worst_night_date),
      isNew: false,
    },
    {
      label: 'Most feeds in a day',
      value: data.most_feeds_count != null ? String(data.most_feeds_count) : '—',
      sub: fmtDate(data.most_feeds_date),
      isNew: data.most_feeds_new,
    },
    {
      label: 'Most poop diapers in a day',
      value: data.most_poop_count != null ? String(data.most_poop_count) : '—',
      sub: fmtDate(data.most_poop_date),
      isNew: data.most_poop_new,
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
            <div className="flex items-center">
              <span className="text-sm">{row.label}</span>
              {row.isNew && <NewBadge />}
            </div>
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
  claimedToday: boolean
}

function AwardsSection({ data }: { data: LeaderboardData }) {
  const awards: Award[] = [
    {
      icon: <Moon className="w-5 h-5" />,
      title: 'Night Shift Ninja',
      subtitle: 'Most events logged between 9 pm – 7 am',
      getValue: (p) => p.night_shifts,
      formatValue: (n) => `${n} logs`,
      claimedToday: data.night_shift_claimed_today,
    },
    {
      icon: <Trophy className="w-5 h-5" />,
      title: 'Chief Log Officer',
      subtitle: 'Most events logged overall',
      getValue: (p) => p.total_logs,
      formatValue: (n) => `${n} logs`,
      claimedToday: data.chief_log_claimed_today,
    },
    {
      icon: <Baby className="w-5 h-5" />,
      title: 'Number One at Number Two',
      subtitle: 'Most poop diapers changed',
      getValue: (p) => p.poop_changes,
      formatValue: (n) => `${n} changes`,
      claimedToday: data.poop_award_claimed_today,
    },
  ]

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
        Awards
      </h2>
      {!data.has_enough_data && (
        <p className="text-xs text-muted-foreground px-1">
          Awards are unlocked after 7 days of tracking — check back soon!
        </p>
      )}
      <div className="flex flex-col gap-3">
        {awards.map((award) => (
          <AwardCard key={award.title} award={award} parents={data.parents} showWinner={data.has_enough_data} />
        ))}
      </div>
    </section>
  )
}

function AwardCard({
  award,
  parents,
  showWinner,
}: {
  award: Award
  parents: ParentStat[]
  showWinner: boolean
}) {
  const values = parents.map((p) => award.getValue(p))
  const winnerIdx = values.indexOf(Math.max(...values))

  return (
    <div
      className={`rounded-xl border bg-surface px-4 py-3 flex flex-col gap-3 ${
        award.claimedToday ? 'border-primary/60' : 'border-primary/35'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary">
          {award.icon}
          <div>
            <p className="text-sm font-semibold leading-tight">{award.title}</p>
            <p className="text-xs text-muted-foreground">{award.subtitle}</p>
          </div>
        </div>
        {award.claimedToday && <NewBadge />}
      </div>
      <div className="flex gap-3">
        {parents.map((p, i) => {
          const isWinner = showWinner && i === winnerIdx
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
