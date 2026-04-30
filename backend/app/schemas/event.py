from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, TypeAdapter, model_validator
from app.models.event import EventType


class FeedMetadata(BaseModel):
    breast_left_min: float | None = None
    breast_right_min: float | None = None
    pumped_ml: float | None = None
    formula_ml: float | None = None

    @model_validator(mode="after")
    def at_least_one_field(self) -> "FeedMetadata":
        if all(v is None for v in (self.breast_left_min, self.breast_right_min, self.pumped_ml, self.formula_ml)):
            raise ValueError("at least one feed field must be provided")
        return self


class OutputMetadata(BaseModel):
    diaper_type: Literal["wet", "dirty", "both"]
    location: Literal["diaper", "potty", "accident"] = "diaper"


_feed_adapter = TypeAdapter(FeedMetadata)
_output_adapter = TypeAdapter(OutputMetadata)


class EventCreate(BaseModel):
    id: str  # UUID generated client-side
    type: EventType
    timestamp: datetime
    metadata: Any = None

    @model_validator(mode="after")
    def metadata_matches_type(self) -> "EventCreate":
        if self.type == EventType.feed:
            _feed_adapter.validate_python(self.metadata or {})
        elif self.type == EventType.output:
            _output_adapter.validate_python(self.metadata)
        else:  # sleep_start, sleep_end, vitamin_d
            if self.metadata is not None:
                raise ValueError("this event type does not accept metadata")
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
