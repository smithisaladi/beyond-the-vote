"""baseline: initial schema

Revision ID: bcfe2420302d
Revises: 
Create Date: 2026-05-11 22:53:21.716890
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'bcfe2420302d'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
