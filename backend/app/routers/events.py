from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, exists
from sqlalchemy.dialects.sqlite import insert

from app.db.database import get_db
from app.db.queries import baby_ids_for_user, get_user_baby_id, get_users_map
from app.limiter import limiter
from app.models.event import Event
from app.models.user import User
from app.models.user_baby import UserBaby
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
        baby_id=event.baby_id,
        metadata=event.metadata_,
    )


@router.post("", status_code=201, response_model=EventResponse)
@limiter.limit("60/minute")
async def create_event(
    request: Request,
    payload: EventCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    baby_id = await get_user_baby_id(db, current_user.id)
    if baby_id is None:
        raise HTTPException(status_code=400, detail="User is not linked to any baby")

    stmt = (
        insert(Event)
        .values(
            id=payload.id,
            type=payload.type,
            timestamp=payload.timestamp,
            logged_by=current_user.id,
            baby_id=baby_id,
            metadata_=payload.metadata,
        )
        .on_conflict_do_nothing(index_elements=["id"])
    )
    await db.execute(stmt)
    await db.commit()

    event = await db.get(Event, payload.id)
    return _to_response(event, current_user.display_name)


@router.get("", response_model=list[EventResponse])
@limiter.limit("60/minute")
async def get_events(
    request: Request,
    from_: datetime | None = None,
    to: datetime | None = None,
    since: datetime | None = None,
    type: str | None = None,
    limit: int | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Only return events for babies the current user is linked to
    user_baby_ids = baby_ids_for_user(current_user.id)

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

    stmt = stmt.where(Event.baby_id.in_(user_baby_ids))
    if type is not None:
        stmt = stmt.where(Event.type == type)
    if limit is not None:
        stmt = stmt.limit(min(limit, 1000))

    result = await db.execute(stmt)
    events = result.scalars().all()

    users = await get_users_map(db, {e.logged_by for e in events})

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

    # Allow delete if current user is linked to the same baby as the event
    can_delete = await db.scalar(
        select(exists().where(
            UserBaby.user_id == current_user.id,
            UserBaby.baby_id == event.baby_id,
        ))
    )
    if not can_delete:
        raise HTTPException(status_code=403, detail="Not your family's event")

    await db.execute(delete(Event).where(Event.id == event_id))
    await db.commit()
