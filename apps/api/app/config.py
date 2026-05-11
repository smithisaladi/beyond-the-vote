from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = ""
    sentry_dsn: str = ""
    environment: str = "development"
    debug: bool = False
    rate_limit: str = "60/minute"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    geocodio_api_key: str = ""
    anthropic_api_key: str = ""
    congress_api_key: str = ""
    openfec_api_key: str = ""
    fec_api_key: str = ""
    mapbox_token: str = ""

    # Neon Auth
    neon_auth_url: str = ""  # e.g. https://ep-xxx.neonauth.us-east-1.aws.neon.tech/neondb/auth
    neon_auth_jwt_secret: str = ""  # Better Auth secret for HS256 validation

    model_config = {"env_prefix": "", "env_file": ".env", "extra": "ignore"}

    @property
    def async_database_url(self) -> str:
        url = self.database_url
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        # asyncpg uses 'ssl' not 'sslmode' — convert for Neon compatibility
        url = url.replace("sslmode=require", "ssl=require")
        url = url.replace("&channel_binding=require", "")
        return url


settings = Settings()
