from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.dialects.sqlite import insert

from app.db.database import get_db
from app.models.event import Event
from app.models.user import User
from app.schemas.event import EventCreate, EventResponse

router = APIRouter(prefix="/events", tags=["events"])


def _to_response(event: Event, display_name: str) -> EventResponse:
    return EventResponse(
        id=event.id,
        type=event.type,
        timestamp=event.timestamp,
        logged_by=event.logged_by,
        display_name=display_name,
        metadata=event.metadata_,
    )


@router.post("", status_code=201, response_model=EventResponse)
async def create_event(payload: EventCreate, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, payload.logged_by)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    stmt = (
        insert(Event)
        .values(
            id=payload.id,
            type=payload.type,
            timestamp=payload.timestamp,
            logged_by=payload.logged_by,
            metadata_=payload.metadata,
        )
        .on_conflict_do_nothing(index_elements=["id"])
    )
    await db.execute(stmt)
    await db.commit()

    event = await db.get(Event, payload.id)
    return _to_response(event, user.display_name)


@router.get("", response_model=list[EventResponse])
async def get_events(
    from_: datetime | None = None,
    to: datetime | None = None,
    since: datetime | None = None,
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
    else:
        raise HTTPException(
            status_code=422, detail="Provide either 'since' or both 'from' and 'to'"
        )

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
async def delete_event(event_id: str, db: AsyncSession = Depends(get_db)):
    event = await db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")

    await db.execute(delete(Event).where(Event.id == event_id))
    await db.commit()
