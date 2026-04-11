# BabyTracker — Science & Methodology

This document explains the scientific background and algorithmic design behind BabyTracker's data-driven features. It is written to be accessible to new parents while remaining technically precise and fully referenced.

Each section covers one feature: what it detects, why the underlying biology matters, how the algorithm works, and what the relevant literature says. The [user manual](user-manual.md) covers day-to-day use; come here when you want to understand the *why*.

---

## Contents

- [1. Cluster Feeding Detection](#1-cluster-feeding-detection)
- [2. Sleep Trend Signal](#2-sleep-trend-signal) *(coming soon)*
- [3. Smarter Feed Prediction (EMA)](#3-smarter-feed-prediction-ema) *(coming soon)*

---

## 1. Cluster Feeding Detection

### What is cluster feeding?

Cluster feeding is a period — typically in the late afternoon or evening — during which a baby feeds much more frequently than usual: several short feeds bunched together within a couple of hours rather than spaced evenly throughout the day.

It is one of the most common sources of anxiety for new parents. The natural instinct is to interpret it as "baby isn't getting enough" or "my supply has dropped." Neither is usually true.

> **In plain terms:** cluster feeding is normal baby behaviour, not a feeding problem.

---

### Why does it happen?

There are several well-supported biological explanations, and they are not mutually exclusive.

#### 1. Preparation for a longer sleep stretch

The most widely cited explanation is that babies load up on calories in the evening to extend their first sleep block of the night. Studies tracking sleep consolidation in the first months of life show that the longest uninterrupted sleep stretch in a 24-hour period almost always follows the evening feed cluster ([Henderson et al., 2010](#ref-3)).

#### 2. Circadian variation in breast milk composition

Breast milk is not a fixed substance — its composition changes across the day. Evening milk is richer in certain sleep-promoting compounds, particularly tryptophan (the precursor to serotonin and melatonin). The baby's drive to feed more in the evening may be partly a response to lower caloric density of daytime milk or higher energy expenditure during alertness windows ([Cubero et al., 2005](#ref-4); [Illnerová et al., 1993](#ref-5)).

#### 3. The witching hour and nervous system development

In the first 8–12 weeks, many babies have a daily "fussy window" in the late afternoon or evening. This is associated with an immature nervous system that has difficulty self-regulating at the end of a stimulating day. Frequent feeding provides comfort and sensory regulation as well as calories ([Riordan & Wambach, 2014](#ref-2)).

#### 4. Supply calibration in early breastfeeding

In the first 4–6 weeks, frequent evening feeding helps establish and maintain milk supply by signalling high demand to the body. From this perspective, cluster feeding is a supply-building mechanism as much as it is a hunger response ([Mohrbacher, 2010](#ref-1)).

---

### What a cluster day looks like

The timeline below shows a typical day. Daytime feeds (blue) are spaced 2–3 hours apart; the evening cluster (amber) brings three feeds within 90 minutes; a longer sleep stretch follows.

![Cluster feeding timeline — daytime feeds spaced 2–3 hours apart, cluster feeds at 19:00, 19:45 and 20:25](docs/cluster-feeding-timeline.svg)

---

### When is cluster feeding expected?

Cluster feeding is most common in the first 12 weeks and tends to occur daily, not just occasionally. It typically eases as the baby's sleep consolidates and the nervous system matures.

| Baby's age | Cluster feeding frequency | Notes |
|---|---|---|
| 0–2 weeks | Daily, often intense | Supply establishment phase |
| 2–6 weeks | Daily, especially in growth spurts | Peak witching-hour period |
| 6–12 weeks | Most evenings | Gradually less intense |
| 3–4 months | Occasional | Sleep architecture shift begins |
| 4 months+ | Rare; usually tied to growth spurts | |

---

### The detection algorithm

BabyTracker detects cluster feeding automatically from the logged events. Here is the decision logic:

```mermaid
flowchart TD
    A([Feed logged]) --> B{≥ 3 feeds in the\nlast 2.5 hours?}
    B -- No --> Z([No cluster])
    B -- Yes --> C{Every consecutive\ninterval ≤ 45 min?}
    C -- No --> Z
    C -- Yes --> D{Does the window\noverlap 17:00–23:00?}
    D -- No --> Z
    D -- Yes --> E([🔵 Cluster chip\nshown in timeline])
```

**Why each threshold:**

| Parameter | Value | Rationale |
|---|---|---|
| Minimum feeds | 3 | Two feeds close together is coincidence; three is a pattern |
| Maximum interval | 45 min | Intervals ≥ 45 min suggest a pause rather than a cluster. [Mohrbacher (2010)](#ref-1) uses 60 min; we use 45 to reduce false negatives |
| Window duration | 2.5 hours | Captures the cluster episode as a single block without merging distinct feeding sessions |
| Hour range | 17:00–23:00 | Cluster feeding is an evening phenomenon; applying the chip to a 2am burst of feeds would be misleading |

**Implementation:** `frontend/src/lib/clusterFeeding.ts` — `detectClusters(events: BabyEvent[])`

The algorithm uses a greedy forward scan: it starts at each feed and extends the candidate group as long as consecutive intervals stay under 45 minutes. If the resulting group has ≥ 3 feeds, fits in 2.5 hours, and overlaps the evening window, it is recorded as a cluster episode. This ensures no feed can belong to two clusters simultaneously.

---

### What the app shows

When a cluster is detected, an information chip appears above the most recent clustered feed in today's timeline:

> **Cluster feeding**
> Short feeds bunched together in the evening are completely normal — baby is topping up before a longer sleep stretch. This usually lasts 1–2 hours.
> *[Don't show again]* &nbsp;&nbsp; ✕

**Design decisions:**

- **Named explicitly.** The term "cluster feeding" is used so parents can search for it and find more information. Naming the phenomenon is more reassuring than a vague description.
- **Duration expectation set.** "Usually lasts 1–2 hours" gives parents a realistic end-point rather than leaving it open-ended.
- **No warning colours.** The chip uses a soft blue-tinted background, not amber or red. Cluster feeding is normal; the visual language reflects that.
- **Smart suppression.** The chip is shown on the first three calendar days a cluster is detected, then automatically suppressed. By day 3, the parent has seen the explanation and knows what it is — continuing to show it daily would be patronising and would train parents to ignore all notifications. A "Don't show again" button skips straight to permanent suppression for parents who get it the first time.
- **Session dismiss (✕) vs. permanent dismiss.** Tapping ✕ hides the chip until the next app load. "Don't show again" permanently suppresses it via `localStorage`.

The chip is also suppressed from the **feed prediction model**: cluster intervals are excluded when calculating the estimated next feed, so a burst of 40-minute intervals does not make the app predict the next feed in 40 minutes. See [Section 3](#3-smarter-feed-prediction-ema) for details on how this works.

---

### References

| # | Authors | Year | Title | Source | DOI / ISBN |
|---|---|---|---|---|---|
| <a id="ref-1"></a>1 | Mohrbacher, N. | 2010 | *[Breastfeeding Answers Made Simple](https://www.worldcat.org/isbn/9780984772605)* | Hale Publishing | ISBN 978-0-9847726-0-5 |
| <a id="ref-2"></a>2 | Riordan, J. & Wambach, K. | 2014 | *[Breastfeeding and Human Lactation](https://www.worldcat.org/isbn/9781284023886)*, 5th ed. | Jones & Bartlett | ISBN 978-1-284-02388-6 |
| <a id="ref-3"></a>3 | Henderson, J.M.T. et al. | 2010 | [Consolidation of nighttime sleep in the first year of life](https://pubmed.ncbi.nlm.nih.gov/20974775/) | *Pediatrics* 126(5):e1081–e1087 | [10.1542/peds.2010-0976](https://doi.org/10.1542/peds.2010-0976) |
| <a id="ref-4"></a>4 | Cubero, J. et al. | 2005 | [The circadian rhythm of tryptophan in breast milk affects the rhythms of 6-sulfatoxymelatonin and sleep in newborn](https://pubmed.ncbi.nlm.nih.gov/16380706/) | *Neuroendocrinology Letters* 26(6):657–661 | [PMID 16380706](https://pubmed.ncbi.nlm.nih.gov/16380706/) |
| <a id="ref-5"></a>5 | Illnerová, H. et al. | 1993 | [Melatonin rhythm in human milk](https://pubmed.ncbi.nlm.nih.gov/8370707/) | *J Clin Endocrinol Metab* 77(3):838–841 | [PMID 8370707](https://pubmed.ncbi.nlm.nih.gov/8370707/) |
| <a id="ref-6"></a>6 | Woolridge, M.W. & Fisher, C. | 1988 | [Colic, overfeeding, and symptoms of lactose malabsorption in the breast-fed baby](https://doi.org/10.1016/S0140-6736(88)92790-0) | *The Lancet* 332(8607):382–384 | [10.1016/S0140-6736(88)92790-0](https://doi.org/10.1016/S0140-6736(88)92790-0) |

---

## 2. Sleep Trend Signal

*Documentation coming in the sleep-trend PR.*

---

## 3. Smarter Feed Prediction (EMA)

*Documentation coming in the feed-prediction PR.*
