import { Trophy, Sparkles, Crown, Swords, Toilet, WandSparkles } from 'lucide-react'
import { type LeaderboardData, type ParentStat } from '@/lib/leaderboards'
import { useLeaderboardData } from '@/contexts/LeaderboardContext'
import NightToggle from '@/components/NightToggle'
import { formatMins, formatDateShort } from '@/lib/time'

export default function Leaderboards() {
  const { data, status, notifications } = useLeaderboardData()

  if (status === 'loading') {
    return <p className="text-sm text-muted-foreground text-center py-16">Loading…</p>
  }
  if (status === 'error') {
    return <p className="text-sm text-destructive text-center py-16">Failed to load leaderboards</p>
  }
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center px-6">
        <Trophy className="w-10 h-10 text-primary opacity-40" />
        <p className="text-sm text-muted-foreground">
          Leaderboards unlock after 7 days of tracking — check back soon!
        </p>
      </div>
    )
  }

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
      <AwardsSection data={data} />
      <RecordsSection data={data} />
    </div>
  )
}

// ── Awards ───────────────────────────────────────────────────────────────────

function NewBadge() {
  return (
    <span className="text-xs font-medium text-primary bg-primary/15 rounded-full px-2 py-0.5 ml-1.5">
      New!
    </span>
  )
}

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
      icon: <Crown className="w-5 h-5" />,
      title: 'Chief Log Officer (CLO)',
      subtitle: 'Most events logged overall',
      getValue: (p) => p.total_logs,
      formatValue: (n) => `${n} logs`,
      claimedToday: data.awards_claimed_today.includes('chief_log'),
    },
    {
      icon: <Swords className="w-5 h-5" />,
      title: 'Night Shift Ninja',
      subtitle: 'Most events logged between 9 pm – 7 am',
      getValue: (p) => p.night_shifts,
      formatValue: (n) => `${n} logs`,
      claimedToday: data.awards_claimed_today.includes('night_shift'),
    },
    {
      icon: <Toilet className="w-5 h-5" />,
      title: 'Number One at Number Two',
      subtitle: 'Most poop diapers changed',
      getValue: (p) => p.poop_changes,
      formatValue: (n) => `${n} changes`,
      claimedToday: data.awards_claimed_today.includes('poop'),
    },
    {
      icon: <WandSparkles className="w-5 h-5" />,
      title: 'Potty Whisperer',
      subtitle: 'Most potty events logged',
      getValue: (p) => p.potty_assists,
      formatValue: (n) => `${n} assists`,
      claimedToday: data.awards_claimed_today.includes('potty'),
    },
  ]

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Awards
        </h2>
        <NightToggle />
      </div>
      <div className="flex flex-col gap-3">
        {awards.map((award) => (
          <AwardCard key={award.title} award={award} parents={data.parents} />
        ))}
      </div>
    </section>
  )
}

function AwardCard({
  award,
  parents,
}: {
  award: Award
  parents: ParentStat[]
}) {
  const values = parents.map((p) => award.getValue(p))
  const winnerIdx = values.indexOf(Math.max(...values))

  return (
    <div
      className={`rounded-xl border bg-card shadow-sm px-4 py-3 flex flex-col gap-3 ${
        award.claimedToday ? 'border-primary/60' : 'border-primary/25'
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
      <div className="flex gap-8 justify-center">
        {parents.map((p, i) => {
          const isWinner = i === winnerIdx
          const val = award.getValue(p)
          const max = Math.max(...values)
          const pct = max > 0 ? (val / max) * 100 : 0
          return (
            <div key={p.display_name} className="w-[88px] flex flex-col items-center gap-1.5">
              <span className={`text-xs font-semibold ${isWinner ? 'text-primary' : 'text-muted-foreground'}`}>
                {award.formatValue(val)}
              </span>
              <div className="w-full h-20 flex items-end">
                <div className="w-full h-full flex items-end">
                  <div
                    className={`w-full rounded-t-sm transition-all ${isWinner ? 'bg-primary/60' : 'bg-muted-foreground/30'}`}
                    style={{ height: `${pct}%` }}
                  />
                </div>
              </div>
              <span className={`text-xs truncate max-w-full ${isWinner ? 'text-primary font-medium' : 'text-muted-foreground'}`}>{p.display_name}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Records ──────────────────────────────────────────────────────────────────

function RecordsSection({ data }: { data: LeaderboardData }) {
  const today = new Date().toLocaleDateString('en-CA')
  const isNew = (r: { date: string | null }) => r.date === today

  const rows: { label: string; value: string; sub: string; isNew: boolean }[] = [
    {
      label: 'Longest sleep',
      value: formatMins(data.longest_sleep.value),
      sub: formatDateShort(data.longest_sleep.date),
      isNew: isNew(data.longest_sleep),
    },
    {
      label: 'Best night',
      value: formatMins(data.best_night.value),
      sub: formatDateShort(data.best_night.date),
      isNew: isNew(data.best_night),
    },
    {
      label: 'Worst night',
      value: formatMins(data.worst_night.value),
      sub: formatDateShort(data.worst_night.date),
      isNew: false,
    },
    {
      label: 'Most feeds in a day',
      value: data.most_feeds.value != null ? String(data.most_feeds.value) : '—',
      sub: formatDateShort(data.most_feeds.date),
      isNew: isNew(data.most_feeds),
    },
    {
      label: 'Most poop diapers in a day',
      value: data.most_poop.value != null ? String(data.most_poop.value) : '—',
      sub: formatDateShort(data.most_poop.date),
      isNew: isNew(data.most_poop),
    },
    {
      label: 'Longest potty streak',
      value: data.longest_potty_streak.value != null ? `${data.longest_potty_streak.value} days` : '—',
      sub: formatDateShort(data.longest_potty_streak.date),
      isNew: isNew(data.longest_potty_streak),
    },
  ]

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
        Records
      </h2>
      <div className="rounded-xl border border-primary/25 bg-surface divide-y divide-primary/15">
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
