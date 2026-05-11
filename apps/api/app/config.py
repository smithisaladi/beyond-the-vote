from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = ""
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    sentry_dsn: str = ""
    environment: str = "development"
    debug: bool = False
    supabase_jwt_issuer: str = ""
    rate_limit: str = "60/minute"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    geocodio_api_key: str = ""
    anthropic_api_key: str = ""

    model_config = {"env_prefix": "", "env_file": ".env"}

    @property
    def async_database_url(self) -> str:
        url = self.database_url
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url


settings = Settings()
