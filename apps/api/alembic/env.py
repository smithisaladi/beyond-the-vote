"""Alembic environment configuration.

Uses the sync database URL (psycopg2) for migrations since Alembic
doesn't natively support async engines. Reads DATABASE_URL from
environment / .env file via app.config.settings.
"""
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

from app.config import settings
from app.db.models import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_sync_url() -> str:
    url = settings.database_url
    if not url:
        url = os.environ.get("DATABASE_URL", "")
    url = url.replace("&channel_binding=require", "")
    return url


SCHEMA_INCLUDE = {"congress", "fec", "enrichment", "analytics", "anomalies", "app", "derived", "ops"}


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
