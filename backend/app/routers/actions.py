import json
import time
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..db import get_db
from ..models import Agent, AgentAction, User
from ..schemas import (
    AgentActionCreate,
    AgentActionTest,
    AgentActionUpdate,
    serialize_agent_action,
)

router = APIRouter(tags=["actions"])


async def _get_owned_agent(agent_id: str, user: User, db: AsyncSession) -> Agent:
    res = await db.execute(select(Agent).where(Agent.id == agent_id, Agent.user_id == user.id))
    agent = res.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return agent


async def _get_owned_action(action_id: str, user: User, db: AsyncSession) -> AgentAction:
    res = await db.execute(select(AgentAction).where(AgentAction.id == action_id, AgentAction.user_id == user.id))
    action = res.scalar_one_or_none()
    if not action:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action not found")
    return action


@router.get("/api/agents/{agent_id}/actions")
async def list_agent_actions(
    agent_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    await _get_owned_agent(agent_id, user, db)
    res = await db.execute(
        select(AgentAction)
        .where(AgentAction.agent_id == agent_id, AgentAction.user_id == user.id)
        .order_by(AgentAction.created_at.asc())
    )
    actions = res.scalars().all()
    return [serialize_agent_action(a) for a in actions]


@router.post("/api/agents/{agent_id}/actions", status_code=status.HTTP_201_CREATED)
async def create_agent_action(
    agent_id: str,
    payload: AgentActionCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await _get_owned_agent(agent_id, user, db)

    # Validate JSON formats
    if payload.headers_json:
        try:
            parsed = json.loads(payload.headers_json)
            if not isinstance(parsed, dict):
                raise ValueError("Headers must be a JSON object")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid headers JSON: {e}") from e

    if payload.parameters_schema_json:
        try:
            parsed = json.loads(payload.parameters_schema_json)
            if not isinstance(parsed, list):
                raise ValueError("Parameters schema must be a JSON array")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid parameters schema JSON: {e}") from e

    action = AgentAction(
        user_id=user.id,
        agent_id=agent_id,
        name=payload.name,
        description=payload.description,
        webhook_url=payload.webhook_url,
        method=payload.method,
        headers_json=payload.headers_json or "{}",
        parameters_schema_json=payload.parameters_schema_json or "[]",
        enabled=payload.enabled,
    )
    db.add(action)
    await db.commit()
    await db.refresh(action)
    return serialize_agent_action(action)


@router.patch("/api/actions/{action_id}")
async def update_agent_action(
    action_id: str,
    payload: AgentActionUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    action = await _get_owned_action(action_id, user, db)

    if payload.name is not None:
        action.name = payload.name
    if payload.description is not None:
        action.description = payload.description
    if payload.webhook_url is not None:
        action.webhook_url = payload.webhook_url
    if payload.method is not None:
        action.method = payload.method
    if payload.headers_json is not None:
        try:
            parsed = json.loads(payload.headers_json)
            if not isinstance(parsed, dict):
                raise ValueError("Headers must be a JSON object")
            action.headers_json = payload.headers_json
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid headers JSON: {e}") from e
    if payload.parameters_schema_json is not None:
        try:
            parsed = json.loads(payload.parameters_schema_json)
            if not isinstance(parsed, list):
                raise ValueError("Parameters schema must be a JSON array")
            action.parameters_schema_json = payload.parameters_schema_json
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid parameters schema JSON: {e}") from e
    if payload.enabled is not None:
        action.enabled = payload.enabled

    await db.commit()
    await db.refresh(action)
    return serialize_agent_action(action)


@router.delete("/api/actions/{action_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent_action(
    action_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    action = await _get_owned_action(action_id, user, db)
    await db.delete(action)
    await db.commit()


@router.post("/api/actions/{action_id}/test")
async def execute_action_test(
    action_id: str,
    payload: AgentActionTest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    action = await _get_owned_action(action_id, user, db)

    headers = {"User-Agent": "BaseMind-Webhook/2.0"}
    if action.headers_json:
        try:
            extra = json.loads(action.headers_json)
            if isinstance(extra, dict):
                headers.update({str(k): str(v) for k, v in extra.items()})
        except Exception:
            pass

    target_url = action.webhook_url
    params = dict(payload.parameters)

    # Replace URL path parameters if any (e.g. {order_id})
    for k, v in list(params.items()):
        placeholder = f"{{{k}}}"
        if placeholder in target_url:
            target_url = target_url.replace(placeholder, str(v))
            params.pop(k, None)

    start = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            if action.method.upper() == "GET":
                resp = await client.get(target_url, params=params, headers=headers)
            elif action.method.upper() == "POST":
                resp = await client.post(target_url, json=params, headers=headers)
            elif action.method.upper() == "PUT":
                resp = await client.put(target_url, json=params, headers=headers)
            elif action.method.upper() == "DELETE":
                resp = await client.delete(target_url, params=params, headers=headers)
            else:
                resp = await client.post(target_url, json=params, headers=headers)

        elapsed_ms = round((time.perf_counter() - start) * 1000, 1)

        try:
            resp_body = resp.json()
        except Exception:
            resp_body = resp.text[:2000]

        return {
            "status": "success" if resp.is_success else "error",
            "statusCode": resp.status_code,
            "latencyMs": elapsed_ms,
            "targetUrl": target_url,
            "response": resp_body,
        }
    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - start) * 1000, 1)
        return {
            "status": "error",
            "statusCode": 500,
            "latencyMs": elapsed_ms,
            "targetUrl": target_url,
            "error": str(exc),
        }
