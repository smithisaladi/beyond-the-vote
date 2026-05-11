from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = ""
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    sentry_dsn: str = ""
    environment: str = "development"
    debug: bool = False
    model_config = {"env_prefix": "", "env_file": ".env"}

settings = Settings()
