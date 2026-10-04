import re
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..db import get_db
from ..models import User, Workspace, WorkspaceMember
from ..schemas import (
    WorkspaceCreate,
    WorkspaceMemberInvite,
    WorkspaceMemberUpdateRole,
    WorkspaceUpdate,
    serialize_workspace,
    serialize_workspace_member,
)
from .billing import get_plan, get_plan_limits

router = APIRouter(prefix="/api")


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return f"{slug or 'team'}-{uuid.uuid4().hex[:6]}"


async def _get_or_create_default_workspace(db: AsyncSession, user: User) -> Workspace:
    # 1. Check if user already owns a workspace
    owned = (await db.execute(select(Workspace).where(Workspace.owner_id == user.id).limit(1))).scalar_one_or_none()
    if owned:
        return owned

    # 2. Check if user is member of any workspace
    membership = (
        await db.execute(select(WorkspaceMember).where(WorkspaceMember.user_id == user.id).limit(1))
    ).scalar_one_or_none()
    if membership:
        ws = (await db.execute(select(Workspace).where(Workspace.id == membership.workspace_id))).scalar_one_or_none()
        if ws:
            return ws

    # 3. Create default personal workspace
    name = f"{user.name or 'My'}'s Team"
    slug = _slugify(name)
    ws = Workspace(
        id=f"ws_{uuid.uuid4().hex[:16]}",
        name=name,
        slug=slug,
        owner_id=user.id,
    )
    db.add(ws)
    await db.flush()

    member = WorkspaceMember(
        id=f"wm_{uuid.uuid4().hex[:16]}",
        workspace_id=ws.id,
        user_id=user.id,
        email=user.email or "owner@example.com",
        role="owner",
        status="active",
    )
    db.add(member)
    await db.commit()
    await db.refresh(ws)
    return ws


async def _get_caller_role(db: AsyncSession, workspace_id: str, user_id: str) -> str | None:
    # Check direct ownership first
    ws = (await db.execute(select(Workspace).where(Workspace.id == workspace_id))).scalar_one_or_none()
    if not ws:
        return None
    if ws.owner_id == user_id:
        return "owner"

    # Check member record
    member = (
        await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user_id,
                WorkspaceMember.status == "active",
            )
        )
    ).scalar_one_or_none()
    return member.role if member else None


@router.get("/workspaces")
async def list_workspaces(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all workspaces the user owns or belongs to."""
    await _get_or_create_default_workspace(db, user)

    # Workspaces owned or member of
    stmt = (
        select(Workspace, WorkspaceMember.role)
        .outerjoin(WorkspaceMember, (WorkspaceMember.workspace_id == Workspace.id) & (WorkspaceMember.user_id == user.id))
        .where((Workspace.owner_id == user.id) | (WorkspaceMember.user_id == user.id))
        .distinct()
        .order_by(Workspace.created_at.asc())
    )
    results = (await db.execute(stmt)).all()

    workspaces_payload = []
    for ws, member_role in results:
        role = "owner" if ws.owner_id == user.id else (member_role or "viewer")
        # Fetch member count
        count = (
            await db.execute(
                select(func.count(WorkspaceMember.id)).where(WorkspaceMember.workspace_id == ws.id)
            )
        ).scalar_one() or 1
        workspaces_payload.append(serialize_workspace(ws, members=None, current_user_role=role) | {"memberCount": count})

    return workspaces_payload


@router.post("/workspaces", status_code=201)
async def create_workspace(
    payload: WorkspaceCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new team workspace."""
    plan = await get_plan(db, user.id)
    # Check how many workspaces user already owns
    owned_count = (
        await db.execute(select(func.count(Workspace.id)).where(Workspace.owner_id == user.id))
    ).scalar_one()

    # Free plan: 1 workspace. Pro: 5 workspaces. Enterprise: unlimited
    max_workspaces = 1 if plan == "free" else (5 if plan == "pro" else 100)
    if owned_count >= max_workspaces:
        raise HTTPException(
            status_code=403,
            detail=f"Workspace limit ({max_workspaces}) reached for your {plan.title()} plan. Please upgrade to Pro for more team workspaces.",
        )

    slug = payload.slug or _slugify(payload.name)
    # Ensure slug uniqueness
    existing_slug = (await db.execute(select(Workspace.id).where(Workspace.slug == slug))).scalar_one_or_none()
    if existing_slug:
        slug = f"{slug}-{uuid.uuid4().hex[:4]}"

    ws = Workspace(
        id=f"ws_{uuid.uuid4().hex[:16]}",
        name=payload.name.strip(),
        slug=slug,
        owner_id=user.id,
    )
    db.add(ws)
    await db.flush()

    member = WorkspaceMember(
        id=f"wm_{uuid.uuid4().hex[:16]}",
        workspace_id=ws.id,
        user_id=user.id,
        email=user.email or "owner@example.com",
        role="owner",
        status="active",
    )
    db.add(member)
    await db.commit()
    await db.refresh(ws)

    return serialize_workspace(ws, members=[member], current_user_role="owner")


@router.get("/workspaces/{workspace_id}")
async def get_workspace(
    workspace_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get single workspace and its members."""
    ws = (await db.execute(select(Workspace).where(Workspace.id == workspace_id))).scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    role = await _get_caller_role(db, ws.id, user.id)
    if not role:
        raise HTTPException(status_code=403, detail="You are not a member of this workspace")

    # Fetch members with linked user details
    stmt = (
        select(WorkspaceMember, User)
        .outerjoin(User, User.id == WorkspaceMember.user_id)
        .where(WorkspaceMember.workspace_id == ws.id)
        .order_by(WorkspaceMember.created_at.asc())
    )
    member_rows = (await db.execute(stmt)).all()
    members = [serialize_workspace_member(m, u) for m, u in member_rows]

    return serialize_workspace(ws, members=None, current_user_role=role) | {
        "members": members,
        "memberCount": len(members),
    }


@router.patch("/workspaces/{workspace_id}")
async def update_workspace(
    workspace_id: str,
    payload: WorkspaceUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update workspace name."""
    ws = (await db.execute(select(Workspace).where(Workspace.id == workspace_id))).scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    role = await _get_caller_role(db, ws.id, user.id)
    if role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only owners and admins can edit workspace settings")

    if payload.name:
        ws.name = payload.name.strip()
        ws.updated_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(ws)

    return serialize_workspace(ws, current_user_role=role)


@router.delete("/workspaces/{workspace_id}", status_code=204)
async def delete_workspace(
    workspace_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a workspace (requires owner)."""
    ws = (await db.execute(select(Workspace).where(Workspace.id == workspace_id))).scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if ws.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only the workspace owner can delete the workspace")

    # Count owned workspaces - cannot delete your last workspace
    owned_count = (
        await db.execute(select(func.count(Workspace.id)).where(Workspace.owner_id == user.id))
    ).scalar_one()
    if owned_count <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete your primary workspace")

    await db.delete(ws)
    await db.commit()
    return None


@router.get("/workspaces/{workspace_id}/members")
async def list_workspace_members(
    workspace_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List members of a workspace."""
    role = await _get_caller_role(db, workspace_id, user.id)
    if not role:
        raise HTTPException(status_code=403, detail="You are not a member of this workspace")

    stmt = (
        select(WorkspaceMember, User)
        .outerjoin(User, User.id == WorkspaceMember.user_id)
        .where(WorkspaceMember.workspace_id == workspace_id)
        .order_by(WorkspaceMember.created_at.asc())
    )
    rows = (await db.execute(stmt)).all()
    return [serialize_workspace_member(m, u) for m, u in rows]


@router.post("/workspaces/{workspace_id}/members", status_code=201)
async def invite_workspace_member(
    workspace_id: str,
    payload: WorkspaceMemberInvite,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Invite a new team member to the workspace."""
    ws = (await db.execute(select(Workspace).where(Workspace.id == workspace_id))).scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    caller_role = await _get_caller_role(db, workspace_id, user.id)
    if caller_role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only owners and admins can invite team members")

    # Check team seat quota of the workspace owner
    owner_plan = await get_plan(db, ws.owner_id)
    limits = get_plan_limits(owner_plan)

    current_member_count = (
        await db.execute(
            select(func.count(WorkspaceMember.id)).where(WorkspaceMember.workspace_id == workspace_id)
        )
    ).scalar_one()

    if current_member_count >= limits.teamSeats:
        raise HTTPException(
            status_code=403,
            detail=(
                f"Team seat limit of {limits.teamSeats} reached for {owner_plan.title()} plan. "
                "Upgrade to Pro for multi-seat team collaboration."
            ),
        )

    invite_email = payload.email.strip().lower()

    # Check if already invited or member
    existing = (
        await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.email == invite_email,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail=f"Member with email {invite_email} is already in this workspace")

    # Check if user already exists in BaseMind
    existing_user = (
        await db.execute(select(User).where(func.lower(User.email) == invite_email))
    ).scalar_one_or_none()

    member = WorkspaceMember(
        id=f"wm_{uuid.uuid4().hex[:16]}",
        workspace_id=workspace_id,
        user_id=existing_user.id if existing_user else None,
        email=invite_email,
        role=payload.role,
        status="active" if existing_user else "invited",
        invited_by_id=user.id,
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)

    return serialize_workspace_member(member, existing_user)


@router.patch("/workspaces/{workspace_id}/members/{member_id}")
async def update_member_role(
    workspace_id: str,
    member_id: str,
    payload: WorkspaceMemberUpdateRole,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change a member's role (requires workspace owner)."""
    ws = (await db.execute(select(Workspace).where(Workspace.id == workspace_id))).scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    caller_role = await _get_caller_role(db, workspace_id, user.id)
    if caller_role != "owner":
        raise HTTPException(status_code=403, detail="Only the workspace owner can modify member roles")

    member = (
        await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.id == member_id,
                WorkspaceMember.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    if member.user_id == ws.owner_id:
        raise HTTPException(status_code=400, detail="Cannot change role of workspace owner")

    member.role = payload.role
    member.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(member)

    linked_user = None
    if member.user_id:
        linked_user = (await db.execute(select(User).where(User.id == member.user_id))).scalar_one_or_none()

    return serialize_workspace_member(member, linked_user)


@router.delete("/workspaces/{workspace_id}/members/{member_id}", status_code=204)
async def remove_workspace_member(
    workspace_id: str,
    member_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a member from the workspace or cancel pending invitation."""
    ws = (await db.execute(select(Workspace).where(Workspace.id == workspace_id))).scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    caller_role = await _get_caller_role(db, workspace_id, user.id)
    member = (
        await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.id == member_id,
                WorkspaceMember.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    if member.user_id == ws.owner_id:
        raise HTTPException(status_code=400, detail="Cannot remove workspace owner")

    # Member can remove themselves (leave), or owner/admin can remove member
    is_self = member.user_id == user.id
    if not is_self and caller_role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient permissions to remove this member")

    await db.delete(member)
    await db.commit()
    return None
