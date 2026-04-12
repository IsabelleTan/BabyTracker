"""add index on events(baby_id, timestamp)

Revision ID: f3a8c912d047
Revises: 51aeae57cfeb
Create Date: 2026-04-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f3a8c912d047'
down_revision: Union[str, Sequence[str], None] = '51aeae57cfeb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.create_index('ix_event_baby_timestamp', ['baby_id', 'timestamp'])


def downgrade() -> None:
    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.drop_index('ix_event_baby_timestamp')
