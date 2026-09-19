import csv
import io
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Response
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth import get_current_user
from ..db import get_db
from ..models import Agent, Lead, User
from ..schemas import LeadUpdate, serialize_lead
from .deps import _get_owned

router = APIRouter(prefix="/api/leads", tags=["leads"])


@router.get("")
async def get_leads(
    agent_id: str | None = None,
    status: str | None = None,
    q: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Lead)
        .options(selectinload(Lead.agent))
        .where(Lead.user_id == user.id)
        .order_by(Lead.created_at.desc())
    )
    if agent_id:
        stmt = stmt.where(Lead.agent_id == agent_id)
    if status and status != "all":
        stmt = stmt.where(Lead.status == status)
    if q and q.strip():
        term = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Lead.name.ilike(term),
                Lead.email.ilike(term),
                Lead.company.ilike(term),
                Lead.message.ilike(term),
            )
        )

    result = await db.execute(stmt)
    leads = result.scalars().all()

    # Aggregate summaries across all user leads
    all_leads_stmt = select(Lead.status, Lead.created_at).where(Lead.user_id == user.id)
    all_res = await db.execute(all_leads_stmt)
    all_rows = all_res.all()

    total = len(all_rows)
    cutoff_24h = datetime.now(UTC) - timedelta(hours=24)
    today = sum(1 for r in all_rows if r.created_at and r.created_at >= cutoff_24h)
    contacted = sum(1 for r in all_rows if r.status in ("contacted", "qualified", "closed"))
    conversion_rate = round((contacted / total * 100), 1) if total > 0 else 0.0

    return {
        "leads": [serialize_lead(lead) for lead in leads],
        "summary": {
            "total": total,
            "today": today,
            "contacted": contacted,
            "conversionRate": conversion_rate,
        },
    }


@router.patch("/{lead_id}")
async def update_lead(
    lead_id: str,
    payload: LeadUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lead = await _get_owned(db, Lead, lead_id, user)
    dump = payload.model_dump(exclude_unset=True)
    for k, v in dump.items():
        setattr(lead, k, v)
    await db.commit()
    await db.refresh(lead)

    agent_name = None
    if lead.agent_id:
        agent = (await db.execute(select(Agent.name).where(Agent.id == lead.agent_id))).scalar_one_or_none()
        agent_name = agent

    return serialize_lead(lead, agent_name)


@router.delete("/{lead_id}", status_code=204)
async def delete_lead(
    lead_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lead = await _get_owned(db, Lead, lead_id, user)
    await db.delete(lead)
    await db.commit()


@router.get("/export")
async def export_leads_csv(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Lead)
        .options(selectinload(Lead.agent))
        .where(Lead.user_id == user.id)
        .order_by(Lead.created_at.desc())
    )
    result = await db.execute(stmt)
    leads = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID",
        "Created At",
        "Agent",
        "Name",
        "Email",
        "Phone",
        "Company",
        "Status",
        "Message",
        "Conversation ID",
    ])
    for lead_row in leads:
        agent_name = lead_row.agent.name if lead_row.agent else "Unknown"
        created_str = lead_row.created_at.strftime("%Y-%m-%d %H:%M:%S UTC") if lead_row.created_at else ""
        writer.writerow([
            lead_row.id,
            created_str,
            agent_name,
            lead_row.name or "",
            lead_row.email,
            lead_row.phone or "",
            lead_row.company or "",
            lead_row.status or "new",
            lead_row.message or "",
            lead_row.conversation_id or "",
        ])

    csv_content = output.getvalue()
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="basemind-leads.csv"'},
    )
