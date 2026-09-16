"""add Razorpay subscription fields

Revision ID: 0002_razorpay_subscription
Revises: 0001_baseline
Create Date: 2026-09-16
"""

revision = "0002_razorpay_subscription"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None

from alembic import op  # noqa: E402
import sqlalchemy as sa  # noqa: E402


def upgrade() -> None:
    op.add_column("subscriptions", sa.Column("razorpay_subscription_id", sa.Text(), nullable=True))
    op.add_column("subscriptions", sa.Column("razorpay_customer_id", sa.Text(), nullable=True))
    op.add_column("subscriptions", sa.Column("razorpay_plan_id", sa.Text(), nullable=True))
    op.create_index("ix_subscriptions_razorpay_subscription_id", "subscriptions", ["razorpay_subscription_id"])


def downgrade() -> None:
    op.drop_index("ix_subscriptions_razorpay_subscription_id", table_name="subscriptions")
    op.drop_column("subscriptions", "razorpay_plan_id")
    op.drop_column("subscriptions", "razorpay_customer_id")
    op.drop_column("subscriptions", "razorpay_subscription_id")