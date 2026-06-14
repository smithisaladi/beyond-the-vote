"""Alembic env — single source of truth for database migrations.

Imports the API SQLAlchemy models (Base.metadata) for autogenerate, and runs
migrations with the version table in the `ops` schema to match how the database
is stamped (`ops.alembic_version`). Generate new migrations from the pipeline
dir:  uv run alembic -c migrations/alembic.ini revision --autogenerate -m "..."
"""
import os
import sys
from pathlib import Path

from alembic import context
from sqlalchemy import create_engine

# Make the API package importable so Base.metadata is available for autogenerate.
api_root = Path(__file__).resolve().parent.parent.parent / "apps" / "api"
sys.path.insert(0, str(api_root))

from app.db.models import Base  # noqa: E402

config = context.config
target_metadata = Base.metadata

# App-owned schemas; everything else (e.g. Neon Auth tables) is ignored by autogenerate.
SCHEMA_INCLUDE = {"congress", "fec", "enrichment", "analytics", "anomalies", "app", "derived", "ops"}


def get_sync_url() -> str:
    """psycopg2-compatible URL from DATABASE_URL (Alembic has no async engine)."""
    url = os.environ.get("DATABASE_URL", "")
    url = url.replace("postgresql+asyncpg://", "postgresql://")
    url = url.replace("postgres://", "postgresql://")
    # psycopg2 accepts sslmode but not channel_binding.
    url = url.replace("&channel_binding=require", "").replace("channel_binding=require&", "")
    return url


def include_object(object, name, type_, reflected, compare_to):
    if type_ == "table" and hasattr(object, "schema"):
        return object.schema in SCHEMA_INCLUDE
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=get_sync_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_schemas=True,
        include_object=include_object,
        version_table_schema="ops",
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(get_sync_url())
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_schemas=True,
            include_object=include_object,
            version_table_schema="ops",
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
