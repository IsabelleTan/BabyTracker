"""unify feed metadata to flat format and merge sessions within one hour

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-04-30 00:00:00.000000

"""
import json
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _parse_ts(ts) -> datetime:
    if isinstance(ts, datetime):
        if ts.tzinfo is None:
            return ts.replace(tzinfo=timezone.utc)
        return ts.astimezone(timezone.utc)
    s = str(ts).strip().replace(' ', 'T')
    if s.endswith('Z'):
        s = s[:-1] + '+00:00'
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        # Last-resort: strip fractional seconds beyond 6 digits
        import re
        s = re.sub(r'(\.\d{6})\d+', r'\1', s)
        dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _convert(meta: dict) -> dict:
    """Convert old discriminated feed metadata to new flat format."""
    ft = meta.get("feed_type")
    if ft == "breast":
        result = {}
        l = meta.get("left_duration_min")
        r = meta.get("right_duration_min")
        # Always include breast fields so we know breast was selected (even if None)
        result["breast_left_min"] = l
        result["breast_right_min"] = r
        return result
    if ft == "bottle":
        ml = meta.get("amount_ml")
        if meta.get("bottle_type") == "formula":
            return {"formula_ml": ml}
        return {"pumped_ml": ml}
    # Already in new format (or unknown) — keep recognised fields only
    return {k: meta[k] for k in ("breast_left_min", "breast_right_min", "pumped_ml", "formula_ml") if k in meta}


def _merge(metas: list[dict]) -> dict:
    """Merge multiple new-format feed metadata dicts into one."""
    bl = [m.get("breast_left_min") for m in metas if "breast_left_min" in m]
    br = [m.get("breast_right_min") for m in metas if "breast_right_min" in m]
    pm = [m.get("pumped_ml") for m in metas if "pumped_ml" in m]
    fm = [m.get("formula_ml") for m in metas if "formula_ml" in m]

    result: dict = {}
    if bl:
        total = sum(v for v in bl if v)
        result["breast_left_min"] = total or None
    if br:
        total = sum(v for v in br if v)
        result["breast_right_min"] = total or None
    if pm:
        total = sum(v for v in pm if v)
        result["pumped_ml"] = total or None
    if fm:
        total = sum(v for v in fm if v)
        result["formula_ml"] = total or None
    return result


def upgrade() -> None:
    conn = op.get_bind()

    rows = conn.execute(text(
        "SELECT id, baby_id, timestamp, metadata "
        "FROM events WHERE type = 'feed' ORDER BY baby_id, timestamp"
    )).fetchall()

    if not rows:
        return

    events = []
    for row in rows:
        raw = row.metadata
        if isinstance(raw, str):
            meta = json.loads(raw) if raw else {}
        elif isinstance(raw, dict):
            meta = raw
        else:
            meta = {}
        events.append({
            "id": row.id,
            "baby_id": row.baby_id,
            "ts": _parse_ts(row.timestamp),
            "metadata": _convert(meta),
        })

    # Group consecutive events within 60 minutes for the same baby
    groups: list[list[dict]] = []
    current: list[dict] = []
    for ev in events:
        if not current:
            current = [ev]
        elif ev["baby_id"] == current[-1]["baby_id"] and (ev["ts"] - current[-1]["ts"]).total_seconds() <= 3600:
            current.append(ev)
        else:
            groups.append(current)
            current = [ev]
    if current:
        groups.append(current)

    for group in groups:
        merged = _merge([e["metadata"] for e in group])
        conn.execute(
            text("UPDATE events SET metadata = :meta WHERE id = :id"),
            {"meta": json.dumps(merged), "id": group[0]["id"]},
        )
        for ev in group[1:]:
            conn.execute(text("DELETE FROM events WHERE id = :id"), {"id": ev["id"]})


def downgrade() -> None:
    raise NotImplementedError("This migration cannot be reversed")
