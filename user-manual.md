# BabyTracker — User Manual

A shared tracking app for new parents. Log feeds, sleep, and diapers; see trends over time; and stay in sync with your co-parent.

---

## Table of contents

1. [Logging events](#1-logging-events)
2. [Today's summary](#2-todays-summary)
3. [Today's timeline](#3-todays-timeline)
4. [Daily story](#4-daily-story)
5. [Stats](#5-stats)
6. [Leaderboards](#6-leaderboards)
7. [Night mode](#7-night-mode)
8. [Offline & syncing](#8-offline--syncing)

---

## 1. Logging events

The three buttons at the top of the home screen let you log a feed, toggle sleep, or record a diaper change. Tap a button to open the logging sheet, fill in the details, and tap **Save**.

The time defaults to now. Tap it to adjust if you're logging something that happened a few minutes ago.

> 💡 **A feed logged a few minutes late is infinitely better than one not logged at all.** If you're exhausted and forget immediately, just log it as soon as you remember with an adjusted time.

<!-- SCREENSHOT: screenshots/home.png
     What to show: The full home screen with the app loaded.
       - Feed button showing "Last feed: 1h 30m ago" and "Est. next feed: in 1h"
       - Sleep button showing "Asleep since: 45m · 21:15"
       - Diaper button showing "Last diaper: 3h ago"
       - Today's summary visible below (9 feeds, ~14h sleep, 6 diapers)
       - At least the top two timeline rows visible
     Run `poetry run python scripts/seed_screenshots.py` before taking this screenshot.
-->
![Home screen](screenshots/home.png)
*The home screen: action buttons with live stats, today's summary, and the event timeline.*

---

### Feed

Choose between **Bottle** or **Breast**:

- **Bottle** — enter the amount in ml.
- **Breast** — enter how many minutes on the left and/or right side. Either side is optional; fill in one or both.

<!-- SCREENSHOT: screenshots/feed-sheet-breast.png
     What to show: The feed logging sheet open, with "Breast" selected.
       - Left side: 12 min, Right side: 8 min filled in
       - Time field showing a time like 14:30
       - Save button visible at the bottom
     No extra data needed — just open the sheet and fill in those values before taking the screenshot.
-->
![Feed logging sheet](screenshots/feed-sheet-breast.png)
*Logging a breast feed: enter minutes per side, adjust the time if needed, and tap Save.*

> 💡 **What's a normal feed count?** Newborns typically feed 8–12 times per day. Frequent feeding is how babies signal hunger and drive milk supply — feed on demand and log what actually happens rather than trying to hit a target.

### Sleep

Tap **Sleep** to mark that baby fell asleep. The button label changes to **Wake**. Tap **Wake** when baby wakes up. The completed block is counted toward today's total sleep time.

Only one sleep block can be open at a time.

> 💡 **"Sleeping through the night" means 5 hours.** In paediatric research, sleeping through the night is defined as a 5-hour uninterrupted stretch — not 8 hours. If baby is regularly doing 5+ consecutive hours, that's a real milestone worth acknowledging.

### Diaper

Choose **Wet**, **Dirty**, or **Wet + Dirty**, then save. The time defaults to now.

---

## 2. Today's summary

Below the action buttons you'll see today's totals at a glance:

| Stat | What it shows |
|------|---------------|
| **Feeds** | Number of feeds logged today |
| **Sleep** | Total completed sleep time (open blocks not counted) |
| **Diapers** | Number of diaper changes logged today |

### Estimated next feed

Shown on the Feed button. Calculated from the average gap between your last few feeds and projected forward from the most recent one. It gets more accurate as the day progresses and more data is available.

### Sleep trend signal

After 14 or more days of tracked sleep, a small positive signal appears if baby's longest single sleep stretch has been meaningfully growing over the past week compared to the week before. This is based on the clinically relevant measure of sleep consolidation — the longest uninterrupted stretch, not total sleep.

<!-- SCREENSHOT: screenshots/sleep-trend.png
     What to show: The Today's summary card with the sleep trend signal visible.
       - Feed/sleep/diaper totals showing (e.g. 9 feeds · 14h sleep · 6 diapers)
       - The "Longest sleep stretch is gradually growing." line with the trending-up icon visible
       - Crop to just the summary card (no need for the full screen)
     Run `poetry run python scripts/seed_screenshots.py` first — it seeds 28 days of
     improving sleep data so the trend signal activates.
-->
![Sleep trend signal](screenshots/sleep-trend.png)
*After two weeks of data, the app surfaces a positive signal when sleep is consolidating.*

---

## 3. Today's timeline

All events logged today appear in reverse chronological order (most recent at the top). Each row shows:

- The event type and icon
- Details where applicable (e.g. bottle volume, breast side durations, diaper type)
- The time it was logged
- The name of the caregiver who logged it

<!-- SCREENSHOT: screenshots/timeline.png
     What to show: The timeline section with 5–6 events visible.
       - Mix of feeds (one bottle, one breast), a sleep_start, a sleep_end, a diaper
       - Two different display names (e.g. "Mum" and "Dad") across the rows to show shared logging
       - Crop to just the timeline card, no need for full screen
     Run `poetry run python scripts/seed_screenshots.py` first.
-->
![Timeline](screenshots/timeline.png)
*Today's timeline: mixed event types, times, and who logged each one.*

### Deleting an event

Swipe a row to the left to reveal the red delete button, then tap it. A confirmation dialog appears before the event is permanently removed.

<!-- SCREENSHOT: screenshots/timeline-swipe.png
     What to show: A timeline row half-swiped to the left, showing the red delete button.
       - The row content is translated left, the red trash icon is visible on the right
       - No need to show the confirmation dialog — just the mid-swipe state
     No data script needed — just swipe any row on the seeded timeline.
-->
![Swipe to delete](screenshots/timeline-swipe.png)
*Swipe left to reveal the delete button.*

### Cluster feeding chip

If baby has had three or more feeds within a short window during the evening, a blue information chip appears above the most recent clustered feed:

> *Frequent short feeds in the evening are completely normal — baby is topping up before a longer sleep stretch.*

Tap **✕** to dismiss it for the session. The chip reappears on the next app load if a cluster is still detected.

<!-- SCREENSHOT: screenshots/cluster-chip.png
     What to show: The timeline with the cluster feeding chip visible above a feed row.
       - The blue chip with the info icon and the cluster feeding message
       - The ✕ dismiss button on the right
       - At least one feed row below the chip
     Run `poetry run python scripts/seed_screenshots.py` first — it seeds three feeds
     between 19:00 and 20:30 today to trigger the chip.
-->
![Cluster feeding chip](screenshots/cluster-chip.png)
*The cluster feeding chip appears automatically in the evening when feeds are bunched together.*

> 💡 **Cluster feeding is not a supply problem.** Bunched-up evening feeds are a normal developmental behaviour. It usually leads to a longer first sleep stretch overnight. Stay fed and hydrated yourself — it's a temporary phase that typically eases within a few weeks.

---

## 4. Daily story

After 6 pm, when at least one event has been logged, a **Daily Story** card appears between the summary and the timeline. It shows today's feed count, sleep time, and diaper count alongside a short one-sentence message chosen automatically based on the day's patterns:

| Pattern | Message |
|---------|---------|
| Evening cluster feeding detected | "Busy evening but you got through it." |
| Feed count ≥ 12 | "Busy feeding day — could be a growth spurt. Totally normal." |
| Total sleep ≥ 15 hours | "Good sleep today. Rest up, you've earned it." |
| Total sleep < 10 hours | "Tough sleep day. These happen — it won't always be like this." |
| Feed count 8–11 and sleep ≥ 12 hours | "A solid day. Steady rhythm, good balance." |
| Otherwise | "Quiet, consistent day. That's a win." |

Tap **✕** to dismiss it for the session.

<!-- SCREENSHOT: screenshots/daily-story.png
     What to show: The daily story card between the summary and timeline.
       - "9 feeds · 14h sleep · 6 diapers" in the subtext line
       - The message: "A solid day. Steady rhythm, good balance."
       - The ✕ dismiss button visible
     This card only appears after 18:00 local time. Take this screenshot in the evening,
     or temporarily change `shouldShowDailyStory` to return true always for the screenshot.
     Run `poetry run python scripts/seed_screenshots.py` first for the right stats.
-->
![Daily story card](screenshots/daily-story.png)
*The daily story card surfaces a short message about the day's patterns each evening.*

> 💡 **Growth spurts are predictable.** Expect temporary spikes in feeding frequency — and a corresponding "growth spurt" message — around 2–3 weeks, 6 weeks, 3 months, and 6 months. These usually last 2–4 days and settle on their own.

---

## 5. Stats

The **Stats** tab shows charts over any date range you choose. Use the date pickers at the top to zoom in on a specific week or compare periods.

Available charts:

- **Daily feed count** — how many feeds per day
- **Average feed interval** — average gap between feeds in minutes, per day
- **Total sleep** — total completed sleep per day in hours
- **Average sleep session** — average duration of a single sleep block per day
- **Average wake window** — average gap between sleep sessions per day
- **Diaper count** — number of diaper changes per day

<!-- SCREENSHOT: screenshots/stats.png
     What to show: The Stats page with the date range set to the past 28 days.
       - At least the feed count and total sleep charts fully rendered with data
       - Visible trend lines showing gradual improvement in sleep over time
       - Date pickers showing a 4-week range
     Run `poetry run python scripts/seed_screenshots.py` first — it seeds 28 days of
     realistic data with natural variation and a gentle improving sleep trend.
-->
![Stats page](screenshots/stats.png)
*The Stats tab with 4 weeks of data — feed counts, sleep totals, and wake windows over time.*

> 💡 **Stats are most useful over 2+ weeks of data.** Early on, day-to-day variation is high and any single day can look alarming or unusually good. Zoom out to a week or more to see the real trend.

---

## 6. Leaderboards

The **Leaderboards** tab shows which caregiver logged the most events this week. It's designed as a gentle awareness tool — not a competition — so both parents can see at a glance whether the load is being shared.

The leaderboard resets at the start of each week.

<!-- SCREENSHOT: screenshots/leaderboards.png
     What to show: The Leaderboards page with two caregivers listed.
       - Two entries, e.g. "Mum" with 34 events and "Dad" with 28 events this week
       - Both names and counts clearly visible
     Run `poetry run python scripts/seed_screenshots.py` first — it seeds events for
     two users this week in a realistic ratio.
-->
![Leaderboards](screenshots/leaderboards.png)
*Leaderboards show each caregiver's event count for the week — a quick way to see if the load is shared.*

> 💡 **Both partners should log.** The timeline stays accurate across handoffs, the leaderboard reflects real effort, and neither parent loses track of when the last feed was. The most important events to capture are the ones your co-parent handles — especially overnight.

---

## 7. Night mode

Tap the **moon icon** in the top-right corner of the home screen to switch to night mode. The display dims and shifts to warmer colours to avoid blinding yourself during a 3 am feed. Tap again to return to normal.

Night mode is remembered between sessions.

<!-- SCREENSHOT: screenshots/night-mode.png
     What to show: The home screen in night mode.
       - Warm amber/dim colour scheme applied
       - Same layout as the home screen screenshot but in night mode
       - The moon icon in the top-right corner visible
     Just tap the moon icon after seeding data, then take the screenshot.
-->
![Night mode](screenshots/night-mode.png)
*Night mode dims the display and shifts to warmer colours for middle-of-the-night use.*

---

## 8. Offline & syncing

BabyTracker works without an internet connection. Events logged offline are saved locally and synced automatically the next time the app is online.

The top bar of the home screen shows the sync status:

| Status | Meaning |
|--------|---------|
| *Synced X ago* | All events are saved to the server |
| *N pending — will sync when online* | Events are queued locally |
| *Syncing…* | A sync is in progress |

### Pull to refresh

On the home screen, pull down from the top to force a sync and reload the latest data from the server. This is useful if your co-parent has just logged something and you want to see it immediately.

---

*Sources: Henderson et al. (2010), Pediatrics 126(3):e590–e597 · Grigg-Damberger et al. (2007), J Clin Sleep Med 3(2):201–240 · Weaver et al. (2004), Arch Dis Child Fetal Neonatal Ed 89(6):F517–F520*



1. Run the seed script (from the backend/ directory):                                                                                 
  poetry run python ../scripts/seed_screenshots.py \                                                                                    
    --user1-email mum@example.com  --user1-password <password> \                                                                        
    --user2-email dad@example.com  --user2-password <password>                                                                          
                                                                                                                                        
  It creates 28 days of historical data + today's full event set across two users. IDs are deterministic so re-running it won't create  
  duplicates.                                                                                                                           
                                                                                                                                        
  2. Take 10 screenshots — the script prints the exact order when it finishes:                                                          
                                                            
  ┌───────────────────────┬──────────────────────────────────────────────────────┐
  │         File          │                   What to capture                    │
  ├───────────────────────┼──────────────────────────────────────────────────────┤
  │ home.png              │ Full home screen                                     │
  ├───────────────────────┼──────────────────────────────────────────────────────┤
  │ feed-sheet-breast.png │ Feed sheet open, Breast selected, 12/8 min filled in │
  ├───────────────────────┼──────────────────────────────────────────────────────┤
  │ timeline.png          │ Timeline card showing mixed events + two names       │
  ├───────────────────────┼──────────────────────────────────────────────────────┤                                                      
  │ timeline-swipe.png    │ Any row swiped left showing the red delete button    │
  ├───────────────────────┼──────────────────────────────────────────────────────┤                                                      
  │ cluster-chip.png      │ Cluster chip + feed row below it                     │
  ├───────────────────────┼──────────────────────────────────────────────────────┤                                                      
  │ daily-story.png       │ Daily story card (take after 18:00)                  │
  ├───────────────────────┼──────────────────────────────────────────────────────┤                                                      
  │ sleep-trend.png       │ Today summary card cropped to show the trend signal  │
  ├───────────────────────┼──────────────────────────────────────────────────────┤                                                      
  │ stats.png             │ Stats tab with 28-day range selected                 │
  ├───────────────────────┼──────────────────────────────────────────────────────┤                                                      
  │ leaderboards.png      │ Leaderboards tab                                     │
  ├───────────────────────┼──────────────────────────────────────────────────────┤                                                      
  │ night-mode.png        │ Home screen with night mode active                   │
  └───────────────────────┴──────────────────────────────────────────────────────┘

  3. Drop them into screenshots/ at the repo root and the placeholders in user-manual.md will resolve automatically. 