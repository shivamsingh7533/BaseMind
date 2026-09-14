"""Error center: event_logs breakdown + recent error rows."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import EventLog


async def _errors_center(db: AsyncSession) -> dict:
    now = datetime.now(UTC)
    since_24h = now - timedelta(days=1)
    since_7d = now - timedelta(days=7)

    count_rows_24h = (
        await db.execute(
            select(EventLog.event_type, func.count())
            .select_from(EventLog)
            .where(EventLog.created_at >= since_24h)
            .group_by(EventLog.event_type)
        )
    ).all()
    counts_24h: dict[str, int] = {row.event_type: row.count for row in count_rows_24h}

    count_rows_7d = (
        await db.execute(
            select(EventLog.event_type, func.count())
            .select_from(EventLog)
            .where(EventLog.created_at >= since_7d)
            .group_by(EventLog.event_type)
        )
    ).all()
    counts_7d: dict[str, int] = {row.event_type: row.count for row in count_rows_7d}

    recent_rows = (
        await db.execute(
            select(EventLog)
            .where(EventLog.severity.in_(['error', 'attention']))
            .order_by(EventLog.created_at.desc())
            .limit(10)
        )
    ).scalars().all()

    recent = []
    for row in recent_rows:
        recent.append(
            {
                'id': row.id,
                'event_type': row.event_type,
                'severity': row.severity,
                'detail': row.detail,
                'created_at': row.created_at.isoformat() if row.created_at else '',
            }
        )

    return {
        'counts24h': counts_24h,
        'counts7d': counts_7d,
        'recent': recent,
    }