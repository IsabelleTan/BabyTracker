from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.limiter import limiter

load_dotenv()

from app.db.database import engine, Base
from app.models import *  # noqa: ensure all models are registered
from app.routers.auth import router as auth_router
from app.routers.events import router as events_router
from app.routers.stats import router as stats_router
from app.routers.leaderboards import router as leaderboards_router

@asynccontextmanager
async def lifespan(_: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="Baby Tracker API", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors_origins.split(",")],
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
