import { type ReactNode } from 'react'
import {
  Milk,
  Moon,
  BarChart2,
  Trophy,
  BookOpen,
  Wifi,
  Sparkles,
  Info,
  Lightbulb,
  type LucideIcon,
} from 'lucide-react'

export default function Help() {
  return (
    <div className="flex flex-col gap-6 py-4">
      <div>
        <h1 className="text-xl font-bold">User guide</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Everything you need to know about using BabyTracker.
        </p>
      </div>

      <Section title="Logging events" icon={Milk}>
        <p>
          The three buttons at the top of the home screen let you log a feed,
          toggle sleep, or record a diaper change. Tap one to open a logging
          sheet, fill in the details, and tap <strong>Save</strong>.
        </p>
        <SubSection title="Feed">
          <ul className="list-disc pl-4 space-y-1">
            <li>
              <strong>Bottle</strong> — enter the amount in ml.
            </li>
            <li>
              <strong>Breast</strong> — enter how many minutes on the left and/or right
              side. You can fill in one or both.
            </li>
            <li>The time defaults to now; tap it to adjust.</li>
          </ul>
        </SubSection>
        <SubSection title="Sleep">
          <p>
            Tap <strong>Sleep</strong> to mark that baby fell asleep; the button
            changes to <strong>Wake</strong>. Tap Wake when baby wakes up. The
            completed block is counted toward today's total sleep.
          </p>
        </SubSection>
        <SubSection title="Diaper">
          <p>Choose Wet, Dirty, or Wet + Dirty, then save.</p>
        </SubSection>
      </Section>

      <Section title="Today's summary" icon={Sparkles}>
        <p>
          Below the action buttons you'll see today's totals: number of feeds,
          total completed sleep, and diaper count.
        </p>
        <ul className="list-disc pl-4 space-y-1">
          <li>
            <strong>Est. next feed</strong> — shown on the Feed button; calculated
            from the average gap between your last few feeds. It gets more
            accurate as the day progresses.
          </li>
          <li>
            <strong>Sleep trend</strong> — after 14 or more days of data, a small
            signal appears if baby's longest sleep stretch has been growing
            meaningfully over the past week.
          </li>
        </ul>
      </Section>

      <Section title="Today's timeline" icon={Moon}>
        <p>
          All events logged today appear in the timeline, most recent first.
          Each row shows the event type, any details (e.g. bottle volume), the
          time, and who logged it.
        </p>
        <SubSection title="Deleting an event">
          <p>
            Swipe a row to the left to reveal the red delete button, then tap
            it. A confirmation dialog will appear before the event is removed.
          </p>
        </SubSection>
        <SubSection title="Cluster feeding chip">
          <p>
            If baby has had three or more feeds within a short window in the
            evening, a blue information chip appears above the latest one. This
            is completely normal — baby is topping up before a longer sleep
            stretch. Tap <strong>✕</strong> to dismiss it for the session.
          </p>
        </SubSection>
      </Section>

      <Section title="Daily story" icon={BookOpen}>
        <p>
          After 6pm, when at least one event has been logged, a Daily Story
          card appears between the summary and the timeline. It shows today's
          feed, sleep, and diaper totals alongside a short one-sentence message
          based on the day's patterns. Tap <strong>✕</strong> to dismiss it for
          the session.
        </p>
        <p className="text-muted-foreground text-xs mt-1">
          The message is selected automatically: it accounts for high feed counts
          (growth spurt), cluster feeding, sleep quality, and quiet normal days.
        </p>
      </Section>

      <Section title="Stats" icon={BarChart2}>
        <p>
          The Stats tab shows charts over any date range you choose. Use the
          date pickers at the top to zoom in or compare weeks. Available charts:
        </p>
        <ul className="list-disc pl-4 space-y-1">
          <li>Daily feed count and average interval between feeds</li>
          <li>Total sleep per day and average session length</li>
          <li>Average wake window between sleep sessions</li>
          <li>Diaper count per day</li>
        </ul>
      </Section>

      <Section title="Leaderboards" icon={Trophy}>
        <p>
          The Leaderboards tab shows which caregiver logged the most events this
          week. It's meant as a fun awareness tool — not a competition — so
          both parents can see whether the load is being shared.
        </p>
      </Section>

      <Section title="Night mode" icon={Moon}>
        <p>
          Tap the moon icon in the top-right corner of the home screen to
          switch to night mode: the screen dims and shifts to warmer colours so
          you don't blind yourself during a 3am feed. Tap again to return to
          normal.
        </p>
      </Section>

      <Section title="Offline & syncing" icon={Wifi}>
        <p>
          BabyTracker works offline. Events logged without a connection are
          saved on your device and automatically synced the next time you're
          online. The top of the home screen shows a pending count when there
          are unsynced events.
        </p>
        <SubSection title="Pull to refresh">
          <p>
            On the home screen, pull down from the top to force a sync and
            reload the latest data from the server.
          </p>
        </SubSection>
      </Section>

      <Section title="Tips for parents" icon={Lightbulb} defaultOpen>
        <div className="flex flex-col gap-3">
          <Tip title="What's a normal feed count?">
            Newborns typically feed 8–12 times per day. Frequent feeding is how
            babies signal hunger and drive your milk supply. Don't try to stretch
            feeds to hit a target — feed on demand.
          </Tip>
          <Tip title="Cluster feeding is not a supply problem">
            Bunched-up evening feeds are a normal developmental behaviour, not a
            sign that baby isn't getting enough. It usually leads to a longer
            first sleep stretch. Stay fed and hydrated yourself — it's a
            temporary phase.
          </Tip>
          <Tip title="'Sleeping through the night' means 5 hours">
            In paediatric research, sleeping through the night is defined as a
            5-hour uninterrupted stretch — not 8 hours. If baby is doing 5+
            hours, that's a milestone worth celebrating.
          </Tip>
          <Tip title="Growth spurts are predictable">
            Expect temporary spikes in feeding frequency around 2–3 weeks,
            6 weeks, 3 months, and 6 months. These usually last 2–4 days and
            settle on their own.
          </Tip>
          <Tip title="Both partners should log">
            Having both caregivers log events makes the app far more useful —
            the timeline stays accurate, the leaderboard reflects real effort,
            and neither parent loses track of when the last feed was.
          </Tip>
          <Tip title="You don't need to be exact">
            A feed logged a few minutes late is infinitely better than a feed
            not logged at all. Approximate times are fine.
          </Tip>
        </div>
      </Section>
    </div>
  )
}

// ── primitives ──────────────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
}: {
  title: string
  icon: LucideIcon
  children: ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details className="group" open={defaultOpen}>
      <summary className="flex items-center gap-2 cursor-pointer list-none select-none rounded-xl border border-primary/35 bg-surface px-4 py-3">
        <Icon className="w-4 h-4 text-primary shrink-0" />
        <span className="flex-1 text-sm font-semibold">{title}</span>
        <ChevronIcon />
      </summary>
      <div className="mt-1 rounded-xl border border-primary/20 bg-surface px-4 py-3 flex flex-col gap-3 text-sm">
        {children}
      </div>
    </details>
  )
}

function SubSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
      <div className="flex flex-col gap-1 text-sm">{children}</div>
    </div>
  )
}

function Tip({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
      <div>
        <p className="text-xs font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{children}</p>
      </div>
    </div>
  )
}

function ChevronIcon() {
  return (
    <svg
      className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}
