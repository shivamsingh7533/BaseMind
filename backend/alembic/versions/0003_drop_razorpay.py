"""drop Razorpay subscription fields

Revision ID: 0003_drop_razorpay
Revises: 0002_razorpay_subscription
Create Date: 2026-09-16
"""

revision = "0003_drop_razorpay"
down_revision = "0002_razorpay_subscription"
branch_labels = None
depends_on = None

from alembic import op  # noqa: E402


def upgrade() -> None:
    op.drop_index("ix_subscriptions_razorpay_subscription_id", table_name="subscriptions")
    op.drop_column("subscriptions", "razorpay_plan_id")
    op.drop_column("subscriptions", "razorpay_customer_id")
    op.drop_column("subscriptions", "razorpay_subscription_id")


def downgrade() -> None:
    import sqlalchemy as sa  # noqa: PLC0415

    op.add_column("subscriptions", sa.Column("razorpay_subscription_id", sa.Text(), nullable=True))
    op.add_column("subscriptions", sa.Column("razorpay_customer_id", sa.Text(), nullable=True))
    op.add_column("subscriptions", sa.Column("razorpay_plan_id", sa.Text(), nullable=True))
    op.create_index("ix_subscriptions_razorpay_subscription_id", "subscriptions", ["razorpay_subscription_id"])