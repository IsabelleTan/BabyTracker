from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.dialects.sqlite import insert

from app.db.database import get_db
from app.models.event import Event
from app.models.user import User
from app.schemas.event import EventCreate, EventResponse
from app.auth import get_current_user

router = APIRouter(prefix="/events", tags=["events"])


def _to_response(event: Event, display_name: str) -> EventResponse:
    ts = event.timestamp
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return EventResponse(
        id=event.id,
        type=event.type,
        timestamp=ts,
        logged_by=event.logged_by,
        display_name=display_name,
        metadata=event.metadata_,
    )


@router.post("", status_code=201, response_model=EventResponse)
async def create_event(
    payload: EventCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        insert(Event)
        .values(
            id=payload.id,
            type=payload.type,
            timestamp=payload.timestamp,
            logged_by=current_user.id,
            metadata_=payload.metadata,
        )
        .on_conflict_do_nothing(index_elements=["id"])
    )
    await db.execute(stmt)
    await db.commit()

    event = await db.get(Event, payload.id)
    return _to_response(event, current_user.display_name)


@router.get("", response_model=list[EventResponse])
async def get_events(
    from_: datetime | None = None,
    to: datetime | None = None,
    since: datetime | None = None,
    type: str | None = None,
    limit: int | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if since is not None:
        stmt = select(Event).where(Event.timestamp > since).order_by(Event.timestamp)
    elif from_ is not None and to is not None:
        stmt = (
            select(Event)
            .where(Event.timestamp >= from_, Event.timestamp < to)
            .order_by(Event.timestamp)
        )
    elif limit is not None:
        # Return last N events (optionally filtered by type), no date range required
        stmt = select(Event).order_by(Event.timestamp.desc())
    else:
        raise HTTPException(
            status_code=422, detail="Provide either 'since', 'from'+'to', or 'limit'"
        )

    if type is not None:
        stmt = stmt.where(Event.type == type)
    if limit is not None:
        stmt = stmt.limit(limit)

    result = await db.execute(stmt)
    events = result.scalars().all()

    user_ids = {e.logged_by for e in events}
    users = {}
    for uid in user_ids:
        u = await db.get(User, uid)
        if u:
            users[uid] = u.display_name

    return [_to_response(e, users.get(e.logged_by, "")) for e in events]


@router.delete("/{event_id}", status_code=204)
async def delete_event(
    event_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event = await db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")

    await db.execute(delete(Event).where(Event.id == event_id))
    await db.commit()
