from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.config import settings
from app.limiter import limiter

from app.db.database import engine, Base
from app.models import *  # noqa: ensure all models are registered
from app.routers.auth import router as auth_router
from app.routers.events import router as events_router
from app.routers.stats import router as stats_router
from app.routers.leaderboards import router as leaderboards_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    # create_all creates missing tables on a fresh DB but does NOT run Alembic
    # migrations. On an existing deployment, run `alembic upgrade head` before
    # starting the server whenever new migrations are added.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="Baby Tracker API", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(auth_router)
app.include_router(events_router)
app.include_router(stats_router)
app.include_router(leaderboards_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
