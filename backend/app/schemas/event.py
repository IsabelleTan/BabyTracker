from datetime import datetime
from typing import Any
from pydantic import BaseModel
from app.models.event import EventType


class EventCreate(BaseModel):
    id: str  # UUID generated client-side
    type: EventType
    timestamp: datetime
    metadata: Any = None


class EventResponse(BaseModel):
    id: str
    type: EventType
    timestamp: datetime
    logged_by: str
    display_name: str
    metadata: Any = None

    model_config = {"from_attributes": True}
