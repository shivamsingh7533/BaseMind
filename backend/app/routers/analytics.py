from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth import get_current_user
from ..cache import invalidate_user_cache
from ..db import get_db
from ..models import Agent, Conversation, KnowledgeGap, Message, User
from ..schemas import (
    KnowledgeGapUpdate,
    MessageFeedbackIn,
    serialize_knowledge_gap,
    serialize_message,
)
from .deps import _get_owned

router = APIRouter(prefix="/api", tags=["analytics"])


async def record_knowledge_gap(
    db: AsyncSession,
    user_id: str,
    agent_id: str | None,
    conversation_id: str | None,
    query: str,
    reason: str = "low_confidence",
    matched_context: str | None = None,
    response_snippet: str | None = None,
) -> KnowledgeGap:
    """Find existing unresolved gap for similar query or create a new one."""
    clean_query = query.strip()
    if not clean_query:
        return None

    # Check for exact case-insensitive match among unresolved gaps for this agent/user
    stmt = select(KnowledgeGap).where(
        KnowledgeGap.user_id == user_id,
        KnowledgeGap.status == "unresolved",
        func.lower(KnowledgeGap.query) == clean_query.lower(),
    )
    if agent_id:
        stmt = stmt.where(KnowledgeGap.agent_id == agent_id)

    existing = (await db.execute(stmt)).scalar_one_or_none()
    now = datetime.now(UTC)

    if existing:
        existing.frequency += 1
        existing.last_asked_at = now
        if response_snippet and not existing.ai_response_snippet:
            existing.ai_response_snippet = response_snippet[:300]
        if matched_context and not existing.matched_context:
            existing.matched_context = matched_context[:500]
        await db.commit()
        await db.refresh(existing)
        return existing

    gap = KnowledgeGap(
        user_id=user_id,
        agent_id=agent_id,
        conversation_id=conversation_id,
        query=clean_query,
        matched_context=(matched_context[:500] if matched_context else None),
        ai_response_snippet=(response_snippet[:300] if response_snippet else None),
        reason=reason,
        frequency=1,
        status="unresolved",
        created_at=now,
        last_asked_at=now,
    )
    db.add(gap)
    await db.commit()
    await db.refresh(gap)
    return gap


@router.post("/conversations/{conversation_id}/messages/{message_id}/feedback")
async def rate_message(
    conversation_id: str,
    message_id: str,
    payload: MessageFeedbackIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Rate an assistant message (thumbs up/down) with optional reason."""
    conv = await _get_owned(db, Conversation, conversation_id, user)
    msg = (
        await db.execute(
            select(Message).where(
                Message.id == message_id,
                Message.conversation_id == conv.id,
            )
        )
    ).scalar_one_or_none()

    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    msg.rating = payload.rating
    msg.feedback_reason = payload.reason
    await db.commit()

    # If thumbs down, automatically capture knowledge gap
    if payload.rating == -1:
        # Look for the preceding user question
        prev_user_msg = (
            await db.execute(
                select(Message)
                .where(
                    Message.conversation_id == conv.id,
                    Message.role == "user",
                    Message.created_at <= msg.created_at,
                )
                .order_by(Message.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

        if prev_user_msg:
            await record_knowledge_gap(
                db=db,
                user_id=user.id,
                agent_id=conv.agent_id,
                conversation_id=conv.id,
                query=prev_user_msg.content,
                reason=f"negative_feedback:{payload.reason or 'unhelpful'}",
                response_snippet=msg.content[:200],
            )

    # Recalculate conversation sentiment
    ratings = (
        await db.execute(
            select(Message.rating).where(
                Message.conversation_id == conv.id,
                Message.rating.is_not(None),
            )
        )
    ).scalars().all()

    if ratings:
        pos = sum(1 for r in ratings if r > 0)
        neg = sum(1 for r in ratings if r < 0)
        if neg > pos:
            conv.sentiment = "negative"
        elif pos > neg:
            conv.sentiment = "positive"
        else:
            conv.sentiment = "neutral"
        await db.commit()

    await invalidate_user_cache(user.id)
    return serialize_message(msg)


@router.get("/analytics/overview")
async def analytics_overview(
    days: int = 14,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate CSAT satisfaction score, ratings, trends, and per-agent metrics."""
    now = datetime.now(UTC)
    range_days = max(1, min(days, 90))
    day_start = (now - timedelta(days=range_days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)

    # 1. Total ratings breakdown
    ratings_res = (
        await db.execute(
            select(
                func.count(Message.id).filter(Message.rating.is_not(None)).label("total_rated"),
                func.count(Message.id).filter(Message.rating == 1).label("positive"),
                func.count(Message.id).filter(Message.rating == -1).label("negative"),
            )
            .join(Conversation, Message.conversation_id == Conversation.id)
            .where(Conversation.user_id == user.id)
        )
    ).one()

    total_rated = ratings_res.total_rated or 0
    positive_ratings = ratings_res.positive or 0
    negative_ratings = ratings_res.negative or 0
    csat_score = round((positive_ratings / total_rated) * 100) if total_rated > 0 else 0

    # 2. Conversation resolution & sentiment metrics
    sentiment_res = (
        await db.execute(
            select(
                func.count(Conversation.id).label("total_convs"),
                func.count(Conversation.id).filter(Conversation.status == "resolved").label("resolved"),
                func.count(Conversation.id).filter(Conversation.sentiment == "positive").label("positive_convs"),
                func.count(Conversation.id).filter(Conversation.sentiment == "negative").label("negative_convs"),
                func.count(Conversation.id).filter(
                    or_(Conversation.sentiment == "neutral", Conversation.sentiment.is_(None))
                ).label("neutral_convs"),
            ).where(Conversation.user_id == user.id)
        )
    ).one()

    total_convs = sentiment_res.total_convs or 0
    resolved_convs = sentiment_res.resolved or 0
    resolution_rate = round((resolved_convs / total_convs) * 100) if total_convs > 0 else 0

    # 3. Knowledge gaps count
    gaps_res = (
        await db.execute(
            select(
                func.count(KnowledgeGap.id).label("total"),
                func.count(KnowledgeGap.id).filter(KnowledgeGap.status == "unresolved").label("unresolved"),
                func.count(KnowledgeGap.id).filter(KnowledgeGap.status == "resolved").label("resolved"),
            ).where(KnowledgeGap.user_id == user.id)
        )
    ).one()

    total_gaps = gaps_res.total or 0
    unresolved_gaps = gaps_res.unresolved or 0
    resolved_gaps = gaps_res.resolved or 0

    # 4. Daily feedback trend
    daily_messages = (
        await db.execute(
            select(
                func.date_trunc("day", Message.created_at).label("day"),
                func.count(Message.id).label("queries"),
                func.count(Message.id).filter(Message.rating == 1).label("pos"),
                func.count(Message.id).filter(Message.rating == -1).label("neg"),
            )
            .join(Conversation, Message.conversation_id == Conversation.id)
            .where(
                Conversation.user_id == user.id,
                Message.created_at >= day_start,
                Message.role == "user",
            )
            .group_by("day")
            .order_by("day")
        )
    ).all()

    daily_map = {
        row.day.strftime("%Y-%m-%d") if hasattr(row.day, "strftime") else str(row.day)[:10]: row
        for row in daily_messages
    }

    # Also fetch rated messages by day
    daily_ratings = (
        await db.execute(
            select(
                func.date_trunc("day", Message.created_at).label("day"),
                func.count(Message.id).filter(Message.rating == 1).label("pos"),
                func.count(Message.id).filter(Message.rating == -1).label("neg"),
            )
            .join(Conversation, Message.conversation_id == Conversation.id)
            .where(
                Conversation.user_id == user.id,
                Message.created_at >= day_start,
                Message.rating.is_not(None),
            )
            .group_by("day")
        )
    ).all()
    ratings_map = {
        row.day.strftime("%Y-%m-%d") if hasattr(row.day, "strftime") else str(row.day)[:10]: row
        for row in daily_ratings
    }

    trends = []
    for i in range(range_days):
        d = (day_start + timedelta(days=i)).strftime("%Y-%m-%d")
        q_row = daily_map.get(d)
        r_row = ratings_map.get(d)
        q_count = q_row.queries if q_row else 0
        pos = r_row.pos if r_row else 0
        neg = r_row.neg if r_row else 0
        day_total = pos + neg
        day_csat = round((pos / day_total) * 100) if day_total > 0 else 0

        trends.append({
            "date": d,
            "queries": q_count,
            "ratingCount": day_total,
            "positiveCount": pos,
            "negativeCount": neg,
            "positiveRatings": pos,
            "negativeRatings": neg,
            "csatScore": day_csat,
        })

    # 5. Agent leaderboard
    agents = (await db.execute(select(Agent).where(Agent.user_id == user.id))).scalars().all()
    leaderboard = []

    for ag in agents:
        ag_ratings = (
            await db.execute(
                select(
                    func.count(Message.id).label("total_queries"),
                    func.count(Message.id).filter(Message.rating == 1).label("pos"),
                    func.count(Message.id).filter(Message.rating == -1).label("neg"),
                )
                .join(Conversation, Message.conversation_id == Conversation.id)
                .where(Conversation.agent_id == ag.id, Message.role == "user")
            )
        ).one()

        ag_rated = (
            await db.execute(
                select(
                    func.count(Message.id).filter(Message.rating == 1).label("pos"),
                    func.count(Message.id).filter(Message.rating == -1).label("neg"),
                )
                .join(Conversation, Message.conversation_id == Conversation.id)
                .where(Conversation.agent_id == ag.id, Message.rating.is_not(None))
            )
        ).one()

        pos_count = ag_rated.pos or 0
        neg_count = ag_rated.neg or 0
        tot_rated = pos_count + neg_count
        ag_csat = round((pos_count / tot_rated) * 100) if tot_rated > 0 else None

        ag_gaps = (
            await db.execute(
                select(func.count(KnowledgeGap.id)).where(
                    KnowledgeGap.agent_id == ag.id,
                    KnowledgeGap.status == "unresolved",
                )
            )
        ).scalar_one() or 0

        leaderboard.append({
            "agentId": ag.id,
            "agentName": ag.name,
            "name": ag.name,
            "agentColor": ag.color or "#0d9488",
            "color": ag.color or "#0d9488",
            "queries": ag_ratings.total_queries or 0,
            "totalRatings": tot_rated,
            "positiveRatings": pos_count,
            "negativeRatings": neg_count,
            "csatScore": ag_csat,
            "unresolvedGaps": ag_gaps,
            "gapsCount": ag_gaps,
        })

    # Sort leaderboard by queries desc
    leaderboard.sort(key=lambda x: x["queries"], reverse=True)

    return {
        # Flat camelCase for direct consumption
        "csatScore": csat_score,
        "totalRatings": total_rated,
        "positiveRatings": positive_ratings,
        "negativeRatings": negative_ratings,
        "resolutionRate": resolution_rate,
        "totalConversations": total_convs,
        "resolvedConversations": resolved_convs,
        "unresolvedGapsCount": unresolved_gaps,
        "trend14d": trends,
        "perAgent": leaderboard,
        # Grouped dicts for backwards/nested compatibility
        "csat": {
            "score": csat_score,
            "totalRatings": total_rated,
            "positiveRatings": positive_ratings,
            "negativeRatings": negative_ratings,
        },
        "resolution": {
            "rate": resolution_rate,
            "totalConversations": total_convs,
            "resolvedConversations": resolved_convs,
        },
        "sentiment": {
            "positive": sentiment_res.positive_convs or 0,
            "neutral": sentiment_res.neutral_convs or 0,
            "negative": sentiment_res.negative_convs or 0,
        },
        "knowledgeGaps": {
            "total": total_gaps,
            "unresolved": unresolved_gaps,
            "resolved": resolved_gaps,
        },
        "trends": trends,
        "leaderboard": leaderboard,
    }


@router.get("/analytics/knowledge-gaps")
async def list_knowledge_gaps(
    agent_id: str | None = None,
    status: str | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List knowledge gaps with filters and search query."""
    stmt = (
        select(KnowledgeGap)
        .options(selectinload(KnowledgeGap.agent))
        .where(KnowledgeGap.user_id == user.id)
    )

    if agent_id:
        stmt = stmt.where(KnowledgeGap.agent_id == agent_id)
    if status and status != "all":
        stmt = stmt.where(KnowledgeGap.status == status)
    if q and q.strip():
        term = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                KnowledgeGap.query.ilike(term),
                KnowledgeGap.matched_context.ilike(term),
                KnowledgeGap.ai_response_snippet.ilike(term),
                KnowledgeGap.resolution_note.ilike(term),
            )
        )

    # Sort by frequency desc, then last_asked_at desc
    stmt = stmt.order_by(KnowledgeGap.frequency.desc(), KnowledgeGap.last_asked_at.desc())

    # Count total matching
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one() or 0

    # Unresolved count for badges
    unresolved_count = (
        await db.execute(
            select(func.count(KnowledgeGap.id)).where(
                KnowledgeGap.user_id == user.id,
                KnowledgeGap.status == "unresolved",
            )
        )
    ).scalar_one() or 0

    paginated_stmt = stmt.limit(limit).offset(offset)
    gaps = (await db.execute(paginated_stmt)).scalars().all()

    return {
        "gaps": [serialize_knowledge_gap(g) for g in gaps],
        "total": total,
        "unresolvedCount": unresolved_count,
    }


@router.patch("/analytics/knowledge-gaps/{gap_id}")
async def update_knowledge_gap(
    gap_id: str,
    payload: KnowledgeGapUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a knowledge gap as resolved, ignored, or update its notes."""
    gap = await _get_owned(db, KnowledgeGap, gap_id, user)
    if payload.status is not None:
        gap.status = payload.status
    if payload.resolution_note is not None:
        gap.resolution_note = payload.resolution_note

    await db.commit()
    await db.refresh(gap, attribute_names=["agent"])
    return serialize_knowledge_gap(gap)


@router.delete("/analytics/knowledge-gaps/{gap_id}", status_code=204)
async def delete_knowledge_gap(
    gap_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a knowledge gap record."""
    gap = await _get_owned(db, KnowledgeGap, gap_id, user)
    await db.delete(gap)
    await db.commit()
    return Response(status_code=204)
