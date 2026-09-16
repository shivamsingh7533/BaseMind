from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..cache import cache_get, cache_set, invalidate_user_cache
from ..db import get_db
from ..email import dispatch_welcome
from ..models import Agent, User
from ..schemas import AgentCreate, AgentUpdate, serialize_agent
from .deps import AGENT_CREATE_RATE_MAX, AGENT_CREATE_WINDOW, _allow_rate_limited, _get_owned

router = APIRouter(prefix="/api")


@router.get("/agents")
async def list_agents(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    cache_key = f"agents:{user.id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached
    result = await db.execute(select(Agent).where(Agent.user_id == user.id).order_by(Agent.created_at.desc()))
    payload = [serialize_agent(a) for a in result.scalars()]
    await cache_set(cache_key, payload)
    return payload


@router.post("/agents", status_code=201)
async def create_agent(
    payload: AgentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from fastapi import HTTPException as _HTTPException

    if not _allow_rate_limited("agent_create", user.id, AGENT_CREATE_RATE_MAX, AGENT_CREATE_WINDOW):
        raise _HTTPException(status_code=429, detail="Rate limit: too many agents, try again shortly")
    agent = Agent(
        user_id=user.id,
        name=payload.name,
        url=payload.url,
        instructions=payload.instructions,
        color=payload.color,
        status="active",
        train_progress=100,
    )
    existing = (await db.execute(select(func.count()).select_from(Agent).where(Agent.user_id == user.id))).scalar_one()
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    await invalidate_user_cache(user.id)
    if existing == 0:
        await dispatch_welcome(user)
    return serialize_agent(agent)


@router.patch("/agents/{agent_id}")
async def update_agent(
    agent_id: str,
    payload: AgentUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    agent = await _get_owned(db, Agent, agent_id, user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(agent, field, value)
    await db.commit()
    await db.refresh(agent)
    await invalidate_user_cache(user.id)
    return serialize_agent(agent)


@router.delete("/agents/{agent_id}", status_code=204)
async def delete_agent(
    agent_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    agent = await _get_owned(db, Agent, agent_id, user)
    await db.delete(agent)
    await db.commit()
    await invalidate_user_cache(user.id)
