from datetime import datetime
from typing import Annotated, Any, Literal, Union
from pydantic import BaseModel, Field, TypeAdapter, model_validator
from app.models.event import EventType


# ── Per-type metadata shapes ───────────────────────────────────────────────

class BottleFeedMetadata(BaseModel):
    feed_type: Literal["bottle"]
    amount_ml: float


class BreastFeedMetadata(BaseModel):
    feed_type: Literal["breast"]
    left_duration_min: float | None = None
    right_duration_min: float | None = None


class DiaperMetadata(BaseModel):
    diaper_type: Literal["wet", "dirty", "both"]


_FeedMetadata = Annotated[
    Union[BottleFeedMetadata, BreastFeedMetadata],
    Field(discriminator="feed_type"),
]
_feed_adapter = TypeAdapter(_FeedMetadata)
_diaper_adapter = TypeAdapter(DiaperMetadata)


# ── Request / response models ──────────────────────────────────────────────

class EventCreate(BaseModel):
    id: str  # UUID generated client-side
    type: EventType
    timestamp: datetime
    metadata: Any = None

    @model_validator(mode="after")
    def metadata_matches_type(self) -> "EventCreate":
        if self.type == EventType.feed:
            _feed_adapter.validate_python(self.metadata)
        elif self.type == EventType.diaper:
            _diaper_adapter.validate_python(self.metadata)
        else:  # sleep_start, sleep_end
            if self.metadata is not None:
                raise ValueError("sleep events do not accept metadata")
        return self


class EventResponse(BaseModel):
    id: str
    type: EventType
    timestamp: datetime
    logged_by: str
    display_name: str
    baby_id: str
    metadata: Any = None

    model_config = {"from_attributes": True}
