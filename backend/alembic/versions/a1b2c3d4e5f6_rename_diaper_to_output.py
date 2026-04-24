"""rename diaper event type to output and add location to metadata

Revision ID: a1b2c3d4e5f6
Revises: f3a8c912d047
Create Date: 2026-04-24 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'f3a8c912d047'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add location: "diaper" to metadata for all existing diaper events, then rename type
    op.execute(
        "UPDATE events "
        "SET metadata = json_set(COALESCE(metadata, '{}'), '$.location', 'diaper') "
        "WHERE type = 'diaper'"
    )
    op.execute("UPDATE events SET type = 'output' WHERE type = 'diaper'")

    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.alter_column(
            'type',
            existing_type=sa.Enum('feed', 'sleep_start', 'sleep_end', 'diaper', name='eventtype'),
            type_=sa.Enum('feed', 'sleep_start', 'sleep_end', 'output', name='eventtype'),
            nullable=False,
        )


def downgrade() -> None:
    op.execute("UPDATE events SET type = 'diaper' WHERE type = 'output'")
    op.execute(
        "UPDATE events "
        "SET metadata = json_remove(metadata, '$.location') "
        "WHERE type = 'diaper'"
    )

    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.alter_column(
            'type',
            existing_type=sa.Enum('feed', 'sleep_start', 'sleep_end', 'output', name='eventtype'),
            type_=sa.Enum('feed', 'sleep_start', 'sleep_end', 'diaper', name='eventtype'),
            nullable=False,
        )
