# Feature Ideas — Encouragement, Insights & Smart Predictions

Synthesised from `positivefeedbackfeature.md` + literature review.
All science-based features cite sources; citations can be verified on PubMed or Google Scholar.

---

## ⚠️ Prerequisite: Baby Date of Birth

Nearly every science-based insight below requires knowing the baby's age.
Without it the app can't apply age-appropriate norms (feed frequency, sleep duration, stool patterns).

**Required data model change:** add `date_of_birth` to the `babies` table.
This would also unlock a small "X weeks old today" display — a nice touch in itself.

---

## 1. Smarter Feed Prediction

### Current approach
Simple average of the last N feed intervals — no age awareness, no time-of-day awareness, treats cluster feeding intervals the same as normal ones.

### Problems
- Feed intervals change systematically week-over-week (old data is from a different distribution)
- Evening feeds are structurally shorter than daytime feeds (circadian rhythm effects in breast milk; Cubero et al., 2005)
- Cluster feeding bursts (≥3 feeds in 2.5 hrs) pull the average down and produce wildly wrong predictions

### Proposed algorithm: Time-of-Day EMA with cluster suppression

**Step 1 — Exclude cluster intervals**
Any interval < 45 minutes is classified as cluster feeding and excluded from the prediction model. It is a "refuelling" event, not representative of the underlying hunger cycle.

**Step 2 — Exponential Moving Average (EMA) over same time-of-day window**
Rather than averaging all recent feeds, use only feeds that started in the same ±3-hour window of day. Weight recent intervals more heavily:

```
EMA_new = α × current_interval + (1 − α) × EMA_prev
α ≈ 0.3  (reasonable for a non-stationary process with slow drift)
```

The time-of-day bucketing means the 3am prediction is built from 3am history, not mixed with afternoon feeds.

**Step 3 — Age-adjusted floor/ceiling**
Clip the prediction to the age-appropriate range (see Section 3 norms). This prevents the model from predicting a 6-hour interval for a 2-week-old even if the last few intervals were unusually long.

**Step 4 — Confidence**
If there are < 5 historical intervals in that time-of-day window, fall back to the overall EMA with a wider stated uncertainty. Don't show a precise time if the data is sparse.

**Why EMA over SMA:**
For non-stationary processes with drift, EMA consistently outperforms SMA.
Source: Gardner (1985), "Exponential smoothing: The state of the art," *Journal of Forecasting* 4(1):1–28.
Full theoretical treatment: Hyndman & Athanasopoulos (2018), *Forecasting: Principles and Practice* (free: otexts.com/fpp3), Chapter 7.

**Circadian effect sources:**
- Cubero et al. (2005), "The circadian rhythm of tryptophan in breast milk affects the rhythms of 6-sulfatoxymelatonin and sleep in newborn," *Neuroendocrinology Letters* 26(6):657–661
- Illnerová et al. (1993), "The circadian rhythm in plasma melatonin concentration of the artificially fed infant," *J Clin Endocrinol Metab* 77(3):838–841

**Cluster feeding sources:**
- Mohrbacher (2010), *Breastfeeding Answers Made Simple*, Hale Publishing
- Woolridge & Fisher (1988), "Colic, overfeeding, and symptoms of lactose malabsorption," *The Lancet* 332(8607):382–384

---

## 2. Contextual Reassurance: "Everything Looks Normal"

Show a calm signal on the home/dashboard screen when today's data falls within age-appropriate norms. Show nothing when it's outside norms (see below for how to handle that).

### Normal ranges by age (requires DOB)

**Feeding frequency per 24hrs:**

| Age | Breastfed | Formula-fed |
|-----|-----------|-------------|
| 0–2 weeks | 8–12 feeds | 6–10 feeds |
| 2–4 weeks | 8–12 | 6–8 |
| 1–2 months | 7–9 | 5–7 |
| 2–3 months | 6–8 | 5–6 |
| 3–4 months | 5–7 | 4–6 |
| 4–6 months | 4–6 | 4–5 |
| 6 months+ | 4–5 + solids | 3–4 + solids |

Source: AAP (2022), "Breastfeeding and the Use of Human Milk," *Pediatrics* 150(1):e2022057988; Lawrence & Lawrence (2022), *Breastfeeding: A Guide for the Medical Profession*, 9th ed.

**Total sleep per 24hrs:**

| Age | Normal range |
|-----|--------------|
| 0–1 month | 15–18 hrs |
| 1–2 months | 14–17 hrs |
| 2–4 months | 13–16 hrs |
| 4–6 months | 12–15 hrs |
| 6–12 months | 12–14 hrs |

Source: Hirshkowitz et al. (2015), "NSF sleep time duration recommendations," *Sleep Health* 1(1):40–43.

**Wet diapers per day (indicator of adequate hydration):**

| Age | Normal minimum |
|-----|---------------|
| Day 1 | ≥1 |
| Day 2 | ≥2 |
| Day 3–6 | ≥3–6 (rising) |
| 1 week+ | ≥6 |

Source: AAP (2022) newborn guidance; Nommsen-Rivers et al. (2010), *J Human Lactation* 26(1):40–47.

### UI approach
- ✅ Within range → show calm reassurance ("Feed count looks great today")
- ⚠️ Outside range → show soft contextual note (never a warning, see Section 5)
- Show nothing if < 1 day of data

---

## 3. Cluster Feeding Detection

### What it is
3 or more feeds within a 2.5-hour window, typically between 5pm and 11pm. Normal, extremely common in the first 8 weeks. Often misread by new parents as a sign of insufficient milk supply.

### Detection logic
```
cluster = (≥3 feeds in any rolling 2.5-hour window)
           AND (time window overlaps 17:00–23:00)
           AND (each individual feed interval < 60 min)
```

### UI response
- Soft label in the timeline: "Cluster feeding pattern — normal"
- Tappable for more info: "More frequent feeds in the evening are completely normal, especially in the first weeks. Baby is topping up before the longer stretch."
- Do NOT alter the feed prediction estimate during a cluster (suppress EMA update for these intervals, as per Section 1)
- Do NOT use warning colors

**Source:** Mohrbacher (2010), op. cit.; Riordan & Wambach (2014), *Breastfeeding and Human Lactation*, 5th ed., Jones & Bartlett.

---

## 4. Growth Spurt Detection

### Timing (approximate, individual variation ±1 week)
7–10 days, 2–3 weeks, 4–6 weeks, 3 months, 4 months, 6 months, 9 months, 12 months.

Source: Lampl et al. (1992), "Saltation and stasis: a model of human growth," *Science* 258(5083):801–803 (establishes that infant growth is episodic, not linear).

### Detection logic
Flag a probable growth spurt when all of the following are true for ≥2 consecutive days:
```
feed_count_today > rolling_14day_mean_feed_count + 1.5 × rolling_14day_std
AND age_of_baby within ±5 days of a known spurt window (optional refinement)
```

Optionally reinforce with sleep signal:
```
mean_nap_length_today < rolling_7day_mean_nap_length × 0.8
```

### UI response
- Short explanation card (dismissable): "Feeding more than usual? Could be a growth spurt — totally normal, usually lasts 2–7 days."
- After the episode resolves (feed count returns to baseline), brief positive: "Growth spurt looks like it's passing — well done getting through it."
- Never show this as a concern; frame it as a moment to notice, not act on

---

## 5. Sleep Development Awareness

### The 4-month regression
At ~3.5–4 months, infant sleep architecture permanently matures to adult-like staging with ~45-min cycles. This causes more frequent night wakings — not a regression in the true sense, but a developmental transition.

Detection: if the baby is 3.5–4.5 months old AND nighttime wake frequency increases sharply vs. the prior 2 weeks → show a contextual note rather than silence.

UI: "Sleep patterns often change around 4 months as the brain matures. This is a normal developmental shift, not a step backward."

### "Sleep is trending better" signal
Requires ≥14 days of sleep data. Show a gentle positive signal only when:
```
rolling_7day_longest_stretch > rolling_7day_longest_stretch (prior week) + 20 min
```
i.e. the longest nighttime stretch is meaningfully and consistently growing.

Phrase positively: "Longest sleep stretch is gradually growing 🌙"

### What counts as normal sleep — context for users

| Age | Typical longest stretch |
|-----|------------------------|
| 0–1 month | 2–4 hrs |
| 1–2 months | 3–5 hrs |
| 2–3 months | 4–6 hrs |
| 3–4 months | 5–8 hrs |
| 4–6 months | 6–10 hrs |

"Sleeping through the night" in pediatric literature = a 5-hour stretch, not 8 hours. Worth surfacing as a gentle fact.

Source: Henderson et al. (2010), "Consolidation of nighttime sleep in first year of life," *Pediatrics* 126(3):e590–e597; Grigg-Damberger et al. (2007), "Visual scoring of sleep in infants," *J Clin Sleep Med* 3(2):201–240.

---

## 6. Stool Frequency Context

One of the most anxiety-inducing things for new parents: breastfed babies can go days without a bowel movement after 6 weeks and it is completely normal. The app should proactively surface this rather than let parents worry in silence.

### Logic
```
if baby_age > 42 days
   AND feed_type == "breastfed"
   AND days_since_last_poop_diaper >= 2
→ show soft note (once, dismissable)
```

Message: "No poop in a couple of days? For breastfed babies older than 6 weeks, this is completely normal — breast milk is absorbed so efficiently that there's very little residue."

Source: Weaver et al. (2004), "Bowel habit and stool form in first 6 weeks of infancy," *Arch Dis Child Fetal Neonatal Ed* 89(6):F517–F520; Tunc et al. (2008), "Factors associated with defecation patterns in 0–24 month old children," *Eur J Pediatrics* 167(12):1357–1362.

---

## 7. Daily Story / End-of-Day Summary

A dismissable card that appears in the evening (e.g. after 8pm or on demand):

```
Today:
🍼 8 feeds   😴 14h sleep   💩 4 diapers

→ [tone-based message]
```

### Tone selection logic

| Condition | Message |
|-----------|---------|
| All metrics within normal range | "A solid day. Steady rhythm, good balance." |
| Feed count high (growth spurt window) | "Busy feeding day — could be a growth spurt. Totally normal." |
| Long sleep stretches | "Good sleep today. Rest up, you've earned it." |
| Short/fragmented sleep | "Tough sleep day. These happen — it won't always be like this." |
| Late night cluster feeding | "Busy evening but you got through it." |
| Very typical day | "Quiet, consistent day. That's a win." |

Keep it short. One sentence max. Never include numbers in the tone message (they're already in the summary above it).

---

## 8. Baby "Voice" Layer (Optional, Toggleable)

Light, first-person messages from the baby's perspective. Should be opt-in or at least easily dismissed if parents find it too cutesy.

| Trigger | Message |
|---------|---------|
| Many feeds today | "Hungry day 🍼 — growth is real work" |
| Long nap | "Finally, a proper sleep 😴" |
| Cluster feeding | "Just needed some extra comfort tonight" |
| First poop after a gap | "Worth the wait 💩" |
| Normal quiet day | "Solid day. Minimal complaints." |
| After a chaotic day | "Big day for a small human 😅" |

Tone: gently self-aware, not saccharine. Avoid emojis overload.

---

## 9. Partner Experience

### Awareness messages (non-competitive)
- "Partner logged a feed 2 hours ago" — subtle awareness without pressure
- During night shift: "Partner handled the last two night feeds" — acknowledgement
- After a stretch of one partner logging everything: "Flying solo today — that's a lot, well done"

### Teamwork recognition
Exists already in leaderboards. But could surface more gently in the daily story:
- "You both logged today — good teamwork"
- Don't frame as competition; frame as collaboration

---

## 10. Night Mode Experience

Already implemented (auto-activates 9pm–7am). Could layer on:
- All encouragement messages in night mode switch to shorter, softer phrasing
- Reduce animation intensity during night mode
- Night-specific messages: "Night shift 🌙", "You're doing great at this hour"
- Suppress "insights" and growth spurt cards during night hours — wrong time to process information

---

## 11. "It's Been a While" Gentle Nudge

Replace the current hard-coded silence with a soft contextual note if it's been unusually long since the last feed — but calibrated to the baby's age and recent history, not a fixed threshold.

```
threshold = max(EMA_predicted_interval × 1.5, age_appropriate_max_interval)
if time_since_last_feed > threshold:
    show: "It's been a while since the last feed — worth checking in"
```

Tone: informational, not alarming. Never red. Never the word "overdue."

---

## 12. Micro-Interaction Polish

- Haptic feedback on log button tap (Web Vibration API, iOS/Android PWA)
- Log confirmation animation: brief scale pulse + "Logged ✓" toast (already partially done)
- Milestone moments (e.g. first 5-hour sleep stretch, first day with 6 wet diapers): slightly stronger animation, warmer toast message

---

## Implementation Notes

### Features that require DOB (high priority prerequisite)
- Feed frequency normative comparison (Section 2)
- Growth spurt timing detection (Section 4)
- 4-month regression detection (Section 5)
- Sleep stretch norms by age (Section 5)
- Stool frequency context (Section 6)
- Age-adjusted feed prediction floor/ceiling (Section 1)

### Features that work without DOB (can build now)
- EMA feed prediction (Section 1, steps 1–3 without age floor)
- Cluster feeding detection (Section 3)
- Sleep trend signal (Section 5, trend-only version)
- Daily story / end-of-day summary (Section 7)
- Baby voice layer (Section 8)
- Partner teamwork messages (Section 9)
- Night mode message softening (Section 10)
- "It's been a while" nudge using EMA threshold (Section 11)
- Micro-interaction polish (Section 12)

### Data model additions needed
- `babies.date_of_birth` (DATE) — prerequisite for age-aware features
- `babies.feed_type` (ENUM: breastfed / formula / mixed) — for feed frequency norms and stool context
- Consider: `users.notification_preferences` — for opt-in baby voice, growth spurt cards, etc.

---

## Sources

| Source | Topic |
|--------|-------|
| AAP (2022). *Pediatrics* 150(1):e2022057988 | Feeding frequency norms |
| WHO (2009). *Infant and Young Child Feeding* | Breastfeeding demand feeding |
| Hirshkowitz et al. (2015). *Sleep Health* 1(1):40–43 | Sleep duration norms |
| Grigg-Damberger et al. (2007). *J Clin Sleep Med* 3(2):201–240 | Sleep architecture maturation, 4-month transition |
| Henderson et al. (2010). *Pediatrics* 126(3):e590–e597 | Sleep consolidation trajectory |
| Lampl et al. (1992). *Science* 258(5083):801–803 | Growth spurts are episodic (saltatory) |
| Cubero et al. (2005). *Neuroendocrinology Letters* 26(6):657–661 | Circadian rhythm in breast milk |
| Illnerová et al. (1993). *J Clin Endocrinol Metab* 77(3):838–841 | Melatonin & circadian feeding rhythms |
| Gardner (1985). *J Forecasting* 4(1):1–28 | EMA superiority over SMA for non-stationary series |
| Hyndman & Athanasopoulos (2018). *Forecasting: Principles and Practice* | EMA/ETS forecasting framework (otexts.com/fpp3) |
| Kent et al. (2006). *Exp Physiol* 91(2):523–532 | Breast storage capacity and interval dynamics |
| Mohrbacher (2010). *Breastfeeding Answers Made Simple* | Cluster feeding definition and norms |
| Riordan & Wambach (2014). *Breastfeeding and Human Lactation*, 5th ed. | Feeding patterns including clustering |
| Weaver et al. (2004). *Arch Dis Child Fetal Neonatal Ed* 89(6):F517–F520 | Stool frequency norms including breastfed gap |
| Tunc et al. (2008). *Eur J Pediatrics* 167(12):1357–1362 | Stool frequency by age and feeding type |
| Nommsen-Rivers et al. (2010). *J Human Lactation* 26(1):40–47 | Wet diaper norms in first 2 weeks |
| Lawrence & Lawrence (2022). *Breastfeeding: A Guide for the Medical Profession*, 9th ed. | Granular feeding frequency by age |
| Mindell & Owens (2015). *A Clinical Guide to Pediatric Sleep*, 3rd ed. | Sleep maturation clinical reference |
