"""Functional tests for BaseMind Version 2 Phase 2.5:
- Multi-Seat Team Workspaces
- RBAC (Owner, Admin, Operator, Viewer)
- Member Invitations and Role Updates
- Seat Quota Enforcement
- Live Usage Metering & Quotas
"""

import asyncio
import os
import sys
import uuid

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import HTTPException

from app.db import SessionFactory, init_db
from app.models import Agent, Document, Subscription, User
from app.routers.billing import get_usage_metering
from app.routers.workspaces import (
    create_workspace,
    delete_workspace,
    get_workspace,
    invite_workspace_member,
    list_workspace_members,
    list_workspaces,
    remove_workspace_member,
    update_member_role,
    update_workspace,
)
from app.schemas import (
    WorkspaceCreate,
    WorkspaceMemberInvite,
    WorkspaceMemberUpdateRole,
    WorkspaceUpdate,
)

results = []


def check(name: str, ok: bool, extra: str = ""):
    results.append((name, bool(ok), extra))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{extra}]" if extra else ""))


async def main():
    await init_db()
    async with SessionFactory() as db:
        # Create Owner User
        owner_clerk = "test-ws-owner-" + uuid.uuid4().hex[:8]
        owner = User(
            clerk_id=owner_clerk,
            email=f"{owner_clerk}@example.com",
            name="Workspace Owner",
        )
        db.add(owner)
        await db.flush()
        sub = Subscription(user_id=owner.id, plan="free", status="active")
        db.add(sub)

        # Create Colleague User to invite
        invitee_clerk = "test-ws-member-" + uuid.uuid4().hex[:8]
        invitee = User(
            clerk_id=invitee_clerk,
            email=f"{invitee_clerk}@example.com",
            name="Team Member",
        )
        db.add(invitee)
        await db.flush()
        invitee_sub = Subscription(user_id=invitee.id, plan="free", status="active")
        db.add(invitee_sub)

        await db.commit()
        await db.refresh(owner)
        await db.refresh(invitee)

        try:
            # 1. Test Auto-Creation on list_workspaces
            workspaces = await list_workspaces(user=owner, db=db)
            check("list_workspaces_auto_create", len(workspaces) >= 1)
            default_ws = workspaces[0]
            check("default_workspace_role", default_ws["currentUserRole"] == "owner")
            ws_id = default_ws["id"]

            # 2. Get Workspace details
            detail = await get_workspace(ws_id, user=owner, db=db)
            check("get_workspace_detail", detail["id"] == ws_id and detail["ownerId"] == owner.id)

            # 3. Update Workspace
            upd = await update_workspace(ws_id, WorkspaceUpdate(name="Acme Corp Workspace"), user=owner, db=db)
            check("update_workspace_name", upd["name"] == "Acme Corp Workspace")

            # 4. Seat limit enforcement on Free plan
            # Owner already occupies 1 seat (free plan allows 1 seat)
            seat_blocked = False
            try:
                await invite_workspace_member(
                    ws_id,
                    WorkspaceMemberInvite(email=invitee.email, role="operator"),
                    user=owner,
                    db=db,
                )
            except HTTPException as exc:
                if exc.status_code == 403 and "seat limit" in exc.detail.lower():
                    seat_blocked = True
            check("seat_limit_enforcement_free_plan", seat_blocked)

            # 5. Upgrade owner to pro to allow team invites (5 seats)
            sub.plan = "pro"
            await db.commit()

            # 6. Invite Member now that plan is Pro
            member_res = await invite_workspace_member(
                ws_id,
                WorkspaceMemberInvite(email=invitee.email, role="operator"),
                user=owner,
                db=db,
            )
            check("invite_workspace_member_pro", member_res["email"] == invitee.email and member_res["role"] == "operator")
            member_id = member_res["id"]

            # 7. List Members
            members_list = await list_workspace_members(ws_id, user=owner, db=db)
            check("list_workspace_members", len(members_list) == 2)

            # 8. Update Member Role to Admin
            updated_role = await update_member_role(
                ws_id,
                member_id,
                WorkspaceMemberUpdateRole(role="admin"),
                user=owner,
                db=db,
            )
            check("update_workspace_member_role", updated_role["role"] == "admin")

            # 9. Verify Non-Owner Permission Restriction (Invitee cannot delete workspace)
            invitee_forbidden = False
            try:
                await delete_workspace(ws_id, user=invitee, db=db)
            except HTTPException as exc:
                if exc.status_code == 403:
                    invitee_forbidden = True
            check("rbac_non_owner_delete_prevented", invitee_forbidden)

            # 10. Remove Workspace Member
            await remove_workspace_member(ws_id, member_id, user=owner, db=db)
            post_remove_members = await list_workspace_members(ws_id, user=owner, db=db)
            check("remove_workspace_member", len(post_remove_members) == 1)

            # 11. Create New Secondary Workspace (Pro plan allows up to 5)
            secondary = await create_workspace(
                WorkspaceCreate(name="Research & Development"),
                user=owner,
                db=db,
            )
            check("create_secondary_workspace", secondary["name"] == "Research & Development")

            # 12. Live Usage Metering & Quotas
            # Add an agent and a document for owner to verify live usage calculation
            agent = Agent(user_id=owner.id, name="Quota Test Bot", workspace_id=ws_id)
            doc = Document(user_id=owner.id, name="Doc 1", detail="Quota test document", workspace_id=ws_id)
            db.add(agent)
            db.add(doc)
            await db.commit()

            usage = await get_usage_metering(user=owner, db=db)
            check("usage_metrics_plan", usage["plan"] == "pro")
            check("usage_metrics_agents", usage["current"]["agents"] >= 1 and usage["limits"]["agents"] == 10)
            check("usage_metrics_documents", usage["current"]["documents"] >= 1 and usage["limits"]["documents"] == 100)
            check("usage_metrics_team_seats", usage["current"]["teamSeats"] >= 1 and usage["limits"]["teamSeats"] == 5)
            check("usage_metrics_percentages", "agents" in usage["percentages"])

            # 13. Delete Secondary Workspace
            await delete_workspace(secondary["id"], user=owner, db=db)
            check("delete_workspace_success", True)

        finally:
            # Teardown
            await db.delete(owner)
            await db.delete(invitee)
            await db.commit()

    failed = [name for name, ok, _ in results if not ok]
    if failed:
        print(f"\nFAILED {len(failed)} tests: {failed}")
        sys.exit(1)
    else:
        print(f"\nSUCCESS: All {len(results)} Phase 2.5 Workspaces & RBAC tests passed cleanly!")


if __name__ == "__main__":
    asyncio.run(main())
