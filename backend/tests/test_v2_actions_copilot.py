"""Functional tests for BaseMind Version 2 Phase 2.1:
- Agent Action Creation & Management
- Action Webhook Testing
- CoPilot Conversation Summary
- CoPilot Suggested Replies
"""

import asyncio
import os
import sys
import uuid

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db import SessionFactory, init_db
from app.models import Agent, Conversation, Message, User
from app.routers.actions import (
    create_agent_action,
    delete_agent_action,
    execute_action_test,
    list_agent_actions,
    update_agent_action,
)
from app.routers.conversations import get_copilot_suggestions, get_copilot_summary
from app.schemas import (
    AgentActionCreate,
    AgentActionTest,
    AgentActionUpdate,
    CoPilotSuggestRequest,
)

TEST_CLERK = "test-v2-" + uuid.uuid4().hex
results = []


def check(name: str, ok: bool, extra: str = ""):
    results.append((name, bool(ok), extra))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{extra}]" if extra else ""))


async def main():
    await init_db()
    async with SessionFactory() as db:
        user = User(clerk_id=TEST_CLERK, email="v2-test@example.com", name="V2 Tester")
        db.add(user)
        await db.commit()
        await db.refresh(user)

        agent = Agent(
            user_id=user.id,
            name="V2 Action Bot",
            status="active",
            instructions="You are an order tracking bot.",
        )
        db.add(agent)
        await db.commit()
        await db.refresh(agent)

        conv = Conversation(
            user_id=user.id,
            agent_id=agent.id,
            visitor="Alice",
            status="needs_human",
        )
        db.add(conv)
        await db.commit()
        await db.refresh(conv)

        # Add messages for CoPilot testing
        m1 = Message(conversation_id=conv.id, role="user", content="Hello, where is my order #9821?")
        m2 = Message(conversation_id=conv.id, role="agent", content="Let me look up your order details.")
        m3 = Message(conversation_id=conv.id, role="user", content="It has been delayed for 3 days and I need a refund.")
        db.add_all([m1, m2, m3])
        await db.commit()

        try:
            # 1. Create Agent Action
            action_payload = AgentActionCreate(
                agent_id=agent.id,
                name="track_order",
                description="Checks current shipping and delivery status of an order",
                webhook_url="https://httpbin.org/post",
                method="POST",
                headers_json='{"X-Custom-Header": "TestValue"}',
                parameters_schema_json='[{"name": "order_id", "type": "string", "description": "Order number", "required": true}]',
                enabled=True,
            )
            created = await create_agent_action(agent.id, action_payload, user=user, db=db)
            check("create_agent_action", created["name"] == "track_order" and created["agentId"] == agent.id)
            action_id = created["id"]

            # 2. List Agent Actions
            actions_list = await list_agent_actions(agent.id, user=user, db=db)
            check("list_agent_actions", len(actions_list) == 1 and actions_list[0]["id"] == action_id)

            # 3. Update Agent Action
            update_payload = AgentActionUpdate(description="Updated description for order tracking")
            updated = await update_agent_action(action_id, update_payload, user=user, db=db)
            check("update_agent_action", updated["description"] == "Updated description for order tracking")

            # 4. Test Action Webhook Execution
            test_payload = AgentActionTest(parameters={"order_id": "9821"})
            test_res = await execute_action_test(action_id, test_payload, user=user, db=db)
            check("execute_action_test", "statusCode" in test_res, f"code={test_res.get('statusCode')}")

            # 5. CoPilot Summary
            summary_res = await get_copilot_summary(conv.id, user=user, db=db)
            check("get_copilot_summary", bool(summary_res.summary), f"summary={summary_res.summary[:50]}...")

            # 6. CoPilot Suggestions
            suggest_payload = CoPilotSuggestRequest(tone="friendly")
            suggest_res = await get_copilot_suggestions(conv.id, suggest_payload, user=user, db=db)
            check("get_copilot_suggestions", len(suggest_res.suggestions) > 0, f"count={len(suggest_res.suggestions)}")

            # 7. Delete Agent Action
            await delete_agent_action(action_id, user=user, db=db)
            post_delete = await list_agent_actions(agent.id, user=user, db=db)
            check("delete_agent_action", len(post_delete) == 0)

        finally:
            # Teardown test user and cascaded rows
            await db.delete(user)
            await db.commit()

    failed = [name for name, ok, _ in results if not ok]
    if failed:
        print(f"\nFAILED {len(failed)} tests: {failed}")
        sys.exit(1)
    else:
        print(f"\nSUCCESS: All {len(results)} tests passed cleanly!")


if __name__ == "__main__":
    asyncio.run(main())
