from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    secret_key: str
    cors_origins: str = "http://localhost:5173"
    database_url: str = "sqlite+aiosqlite:///./babytracker.db"

    rate_limit_events: str = "60/minute"
    rate_limit_read: str = "30/minute"
    rate_limit_auth: str = "10/minute"

    max_future_event_seconds: int = 24 * 3600

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


settings = Settings()
