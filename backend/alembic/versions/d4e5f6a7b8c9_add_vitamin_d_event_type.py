"""add vitamin_d event type

Revision ID: d4e5f6a7b8c9
Revises: a1b2c3d4e5f6
Create Date: 2026-04-26 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.alter_column(
            'type',
            existing_type=sa.Enum('feed', 'sleep_start', 'sleep_end', 'output', name='eventtype'),
            type_=sa.Enum('feed', 'sleep_start', 'sleep_end', 'output', 'vitamin_d', name='eventtype'),
            nullable=False,
        )


def downgrade() -> None:
    op.execute("DELETE FROM events WHERE type = 'vitamin_d'")

    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.alter_column(
            'type',
            existing_type=sa.Enum('feed', 'sleep_start', 'sleep_end', 'output', 'vitamin_d', name='eventtype'),
            type_=sa.Enum('feed', 'sleep_start', 'sleep_end', 'output', name='eventtype'),
            nullable=False,
        )
