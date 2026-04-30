from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db.database import get_db
from app.db.queries import baby_ids_for_user, get_users_map
from app.config import settings
from app.limiter import limiter
from app.models.event import Event
from app.models.user import User
from app.models.user_baby import UserBaby
from app.utils import _utc, local_date, output_dirty, output_at_accident, output_at_diaper, output_at_potty, output_wet, pair_sleep_sessions, safe_zone, NIGHT_SHIFT_START, NIGHT_SHIFT_END

router = APIRouter(prefix="/leaderboards", tags=["leaderboards"])


class ParentStat(BaseModel):
    display_name: str
    night_shifts: int
    total_logs: int
    poop_changes: int
    potty_assists: int
    accident_cleanups: int


class BabyRecord(BaseModel):
    value: float | None
    date: date | None


class LeaderboardData(BaseModel):
    longest_sleep: BabyRecord
    best_night: BabyRecord
    worst_night: BabyRecord
    most_feeds: BabyRecord
    most_poop: BabyRecord
    longest_potty_streak: BabyRecord
    total_accidents: int
    awards_claimed_today: list[str]
    parents: list[ParentStat]


def _compute_parent_stats(evts: list, users: dict[str, str]) -> dict[str, dict]:
    s = {uid: {"night_shifts": 0, "total_logs": 0, "poop_changes": 0, "potty_assists": 0, "accident_cleanups": 0} for uid in users}
    for e in evts:
        uid = e.logged_by
        if uid not in s:
            continue
        ts = _utc(e.timestamp)
        s[uid]["total_logs"] += 1
        if ts.hour >= NIGHT_SHIFT_START or ts.hour < NIGHT_SHIFT_END:
            s[uid]["night_shifts"] += 1
        if e.type == "output":
            meta = e.metadata_ or {}
            if output_dirty(meta) and output_at_diaper(meta):
                s[uid]["poop_changes"] += 1
            if output_at_potty(meta):
                s[uid]["potty_assists"] += 1
            if output_at_accident(meta):
                s[uid]["accident_cleanups"] += 1
    return s


def _winner_uid(stats: dict[str, dict], key: str) -> str | None:
    candidates = {uid: v[key] for uid, v in stats.items() if v[key] > 0}
    return max(candidates, key=lambda uid: candidates[uid]) if candidates else None


@dataclass
class SleepStats:
    longest_sleep_min: float | None
    longest_sleep_date: date | None
    best_night_min: float | None
    best_night_date: date | None
    worst_night_min: float | None
    worst_night_date: date | None


@dataclass
class FeedStats:
    most_feeds_count: int | None
    most_feeds_date: date | None
    most_poop_count: int | None
    most_poop_date: date | None
    longest_potty_streak: int | None
    longest_potty_streak_date: date | None
    total_accidents: int


@dataclass
class AwardFlags:
    claimed: frozenset[str]


def compute_sleep_stats(sleep_sessions: list[tuple], zone: ZoneInfo) -> SleepStats:
    longest_sleep_min: float | None = None
    longest_sleep_date: date | None = None
    if sleep_sessions:
        longest = max(sleep_sessions, key=lambda s: (s[1] - s[0]).total_seconds())
        longest_sleep_min = round((longest[1] - longest[0]).total_seconds() / 60, 1)
        longest_sleep_date = local_date(longest[0], zone)

    night_sleep: dict[date, float] = defaultdict(float)
    for start, end in sleep_sessions:
        for offset in range(-1, 2):
            night_start = datetime(
                start.year, start.month, start.day, NIGHT_SHIFT_START, 0, 0, tzinfo=timezone.utc
            ) + timedelta(days=offset)
            night_end = night_start + timedelta(hours=10)
            overlap_start = max(start, night_start)
            overlap_end = min(end, night_end)
            if overlap_end > overlap_start:
                night_sleep[local_date(night_start, zone)] += (
                    overlap_end - overlap_start
                ).total_seconds() / 60

    best_night_min: float | None = None
    best_night_date: date | None = None
    worst_night_min: float | None = None
    worst_night_date: date | None = None
    if night_sleep:
        best_night_date = max(night_sleep, key=lambda k: night_sleep[k])
        best_night_min = round(night_sleep[best_night_date], 1)
        worst_night_date = min(night_sleep, key=lambda k: night_sleep[k])
        worst_night_min = round(night_sleep[worst_night_date], 1)

    return SleepStats(longest_sleep_min, longest_sleep_date, best_night_min, best_night_date, worst_night_min, worst_night_date)


def compute_feed_stats(events: list, zone: ZoneInfo) -> FeedStats:
    feeds_by_day: dict[date, int] = defaultdict(int)
    poop_by_day: dict[date, int] = defaultdict(int)
    total_accidents = 0
    for e in events:
        if e.type == "feed":
            feeds_by_day[local_date(e.timestamp, zone)] += 1
        elif e.type == "output":
            meta = e.metadata_ or {}
            if output_dirty(meta) and output_at_diaper(meta):
                poop_by_day[local_date(e.timestamp, zone)] += 1
            if output_at_accident(meta):
                total_accidents += 1

    most_feeds_count: int | None = None
    most_feeds_date: date | None = None
    if feeds_by_day:
        most_feeds_date = max(feeds_by_day, key=lambda k: feeds_by_day[k])
        most_feeds_count = feeds_by_day[most_feeds_date]

    most_poop_count: int | None = None
    most_poop_date: date | None = None
    if poop_by_day:
        most_poop_date = max(poop_by_day, key=lambda k: poop_by_day[k])
        most_poop_count = poop_by_day[most_poop_date]

    potty_days: set[date] = set()
    for e in events:
        if e.type == "output":
            meta = e.metadata_ or {}
            if output_at_potty(meta):
                potty_days.add(local_date(e.timestamp, zone))

    longest_potty_streak: int | None = None
    longest_potty_streak_date: date | None = None
    if potty_days:
        sorted_days = sorted(potty_days)
        best_streak = 1
        best_end = sorted_days[0]
        current_streak = 1
        for i in range(1, len(sorted_days)):
            if sorted_days[i] == sorted_days[i - 1] + timedelta(days=1):
                current_streak += 1
            else:
                current_streak = 1
            if current_streak >= best_streak:
                best_streak = current_streak
                best_end = sorted_days[i]
        longest_potty_streak = best_streak
        longest_potty_streak_date = best_end

    return FeedStats(most_feeds_count, most_feeds_date, most_poop_count, most_poop_date, longest_potty_streak, longest_potty_streak_date, total_accidents)


def compute_award_changes(
    curr_stats: dict[str, dict],
    prev_stats: dict[str, dict],
) -> AwardFlags:
    def award_claimed(key: str) -> bool:
        curr = _winner_uid(curr_stats, key)
        prev = _winner_uid(prev_stats, key)
        return curr is not None and curr != prev

    return AwardFlags(claimed=frozenset(
        name
        for stat_key, name in [
            ("night_shifts", "night_shift"),
            ("total_logs", "chief_log"),
            ("poop_changes", "poop"),
            ("potty_assists", "potty"),
            ("accident_cleanups", "accident"),
        ]
        if award_claimed(stat_key)
    ))


def build_leaderboard_response(
    sleep: SleepStats,
    feeds: FeedStats,
    awards: AwardFlags,
    curr_stats: dict[str, dict],
    users: dict[str, str],
) -> LeaderboardData:
    parents = [
        ParentStat(
            display_name=users[uid],
            night_shifts=v["night_shifts"],
            total_logs=v["total_logs"],
            poop_changes=v["poop_changes"],
            potty_assists=v["potty_assists"],
            accident_cleanups=v["accident_cleanups"],
        )
        for uid, v in curr_stats.items()
        if uid in users
    ]

    return LeaderboardData(
        longest_sleep=BabyRecord(value=sleep.longest_sleep_min, date=sleep.longest_sleep_date),
        best_night=BabyRecord(value=sleep.best_night_min, date=sleep.best_night_date),
        worst_night=BabyRecord(value=sleep.worst_night_min, date=sleep.worst_night_date),
        most_feeds=BabyRecord(value=feeds.most_feeds_count, date=feeds.most_feeds_date),
        most_poop=BabyRecord(value=feeds.most_poop_count, date=feeds.most_poop_date),
        longest_potty_streak=BabyRecord(value=feeds.longest_potty_streak, date=feeds.longest_potty_streak_date),
        total_accidents=feeds.total_accidents,
        awards_claimed_today=list(awards.claimed),
        parents=parents,
    )


@router.get("", response_model=LeaderboardData, responses={204: {"description": "Not enough data yet (< 7 days of events)"}})
@limiter.limit(settings.rate_limit_read)
async def get_leaderboards(
    request: Request,
    tz: str = Query(default="UTC"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    baby_ids = baby_ids_for_user(current_user.id)
    family_user_ids = select(UserBaby.user_id).where(UserBaby.baby_id.in_(baby_ids))

    zone = safe_zone(tz)
    today_utc = datetime.now(timezone.utc)
    today = local_date(today_utc, zone)
    today_start = datetime(today.year, today.month, today.day, tzinfo=zone)

    # Cap at 4 years — the realistic maximum lifetime of this app for any family.
    # The compound index on (baby_id, timestamp) makes this range scan fast even
    # at the upper bound (~25k events).
    MAX_LEADERBOARD_DAYS = 4 * 365
    cutoff = today_utc - timedelta(days=MAX_LEADERBOARD_DAYS)
    events_result = await db.execute(
        select(Event)
        .where(Event.baby_id.in_(baby_ids), Event.timestamp >= cutoff)
        .order_by(Event.timestamp)
    )
    events = events_result.scalars().all()

    family_user_id_rows = await db.execute(family_user_ids)
    users = await get_users_map(db, set(family_user_id_rows.scalars().all()))

    earliest_ts = min((_utc(e.timestamp) for e in events), default=None)
    if earliest_ts is None or (today_utc - earliest_ts).days < 7:
        return Response(status_code=204)

    raw_sleep_events = [
        (e.type, _utc(e.timestamp))
        for e in events
        if e.type in ("sleep_start", "sleep_end")
    ]
    sleep_sessions = pair_sleep_sessions(raw_sleep_events)

    sleep = compute_sleep_stats(sleep_sessions, zone)
    feeds = compute_feed_stats(events, zone)

    curr_stats = _compute_parent_stats(events, users)
    prev_stats = _compute_parent_stats([e for e in events if _utc(e.timestamp) < today_start], users)
    awards = compute_award_changes(curr_stats, prev_stats)

    return build_leaderboard_response(sleep, feeds, awards, curr_stats, users)
