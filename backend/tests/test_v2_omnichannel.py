"""Automated functional tests for BaseMind Version 2 Phase 2.4:
Omnichannel Live Chat Integrations (WhatsApp Business Cloud API & Telegram Bot API)
with Unified Live Inbox and Bidirectional Operator Takeover.
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from starlette.datastructures import Headers, QueryParams
from starlette.requests import Request

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select

from app.db import SessionFactory, init_db
from app.models import Agent, Conversation, Document, DocumentChunk, Integration, Message, User
from app.routers.conversations import add_message
from app.routers.integrations import (
    handle_telegram_webhook,
    handle_whatsapp_webhook,
    trigger_integration_test,
    verify_whatsapp_webhook,
)
from app.schemas import IntegrationCreate, MessageIn, serialize_conversation


def make_mock_request(
    method: str = "GET",
    query_params: dict[str, str] | None = None,
    json_data: dict | None = None,
) -> Request:
    query_string = "&".join(f"{k}={v}" for k, v in (query_params or {}).items()).encode()
    scope = {
        "type": "http",
        "method": method,
        "query_string": query_string,
        "headers": [(b"content-type", b"application/json")],
    }
    req = Request(scope)
    if json_data is not None:
        async def mock_json():
            return json_data
        req.json = mock_json  # type: ignore[method-assign]
    return req


class MockBackgroundTasks:
    def __init__(self):
        self.tasks = []

    def add_task(self, func, *args, **kwargs):
        self.tasks.append((func, args, kwargs))


async def main() -> None:
    print("=== Starting Phase 2.4 Omnichannel Messaging Tests ===", flush=True)
    await init_db()

    results: list[tuple[str, bool, str]] = []

    def check(name: str, condition: bool, info: str = ""):
        results.append((name, condition, info))
        status = "PASS" if condition else "FAIL"
        print(f"{status} {name} {f' [{info}]' if info else ''}", flush=True)

    uid = f"v24_{uuid.uuid4().hex[:8]}"

    async with SessionFactory() as db:
        test_user = User(
            id=f"user_{uid}",
            clerk_id=f"clerk_{uid}",
            email=f"{uid}@example.com",
            name="Omnichannel Tester",
        )
        db.add(test_user)
        await db.commit()

        try:
            # Create test agent
            agent = Agent(
                id=f"agent_{uid}",
                user_id=test_user.id,
                name="Omni Bot",
                instructions="You are an omnichannel customer support assistant.",
            )
            db.add(agent)
            await db.commit()

            # 1. Create WhatsApp Integration
            wa_integ = Integration(
                id=f"wa_{uid}",
                user_id=test_user.id,
                agent_id=agent.id,
                platform="whatsapp",
                bot_token="EAABtesttoken12345",
                signing_secret="my_whatsapp_secret_token",
                channel_id="109876543210",
                status="active",
            )
            # Create Telegram Integration
            tg_integ = Integration(
                id=f"tg_{uid}",
                user_id=test_user.id,
                agent_id=agent.id,
                platform="telegram",
                bot_token="123456789:ABCdefGhIJKlmNoPQRstuVWxYZ",
                status="active",
            )
            db.add_all([wa_integ, tg_integ])
            await db.commit()

            # 2. Test WhatsApp Webhook Verification Handshake (Meta Setup)
            # 2a: Valid challenge token
            valid_req = make_mock_request(
                method="GET",
                query_params={
                    "hub.mode": "subscribe",
                    "hub.verify_token": "my_whatsapp_secret_token",
                    "hub.challenge": "1155992288",
                },
            )
            verify_res = await verify_whatsapp_webhook(agent.id, valid_req, db=db)
            check("whatsapp_webhook_verification_success", verify_res.body == b"1155992288", f"status={verify_res.status_code}")

            # 2b: Invalid verify token
            invalid_req = make_mock_request(
                method="GET",
                query_params={
                    "hub.mode": "subscribe",
                    "hub.verify_token": "wrong_token",
                    "hub.challenge": "1155992288",
                },
            )
            try:
                await verify_whatsapp_webhook(agent.id, invalid_req, db=db)
                check("whatsapp_webhook_verification_rejection", False, "Should have thrown 403")
            except Exception as e:
                check("whatsapp_webhook_verification_rejection", getattr(e, "status_code", None) == 403)

            # 3. Test Inbound WhatsApp Message Webhook
            bg = MockBackgroundTasks()
            wa_payload = {
                "object": "whatsapp_business_account",
                "entry": [
                    {
                        "id": "WHATSAPP_ACC_ID",
                        "changes": [
                            {
                                "value": {
                                    "messaging_product": "whatsapp",
                                    "metadata": {"phone_number_id": "109876543210"},
                                    "contacts": [{"profile": {"name": "Bob WhatsApp"}, "wa_id": "+15551234567"}],
                                    "messages": [
                                        {
                                            "from": "+15551234567",
                                            "id": "wamid.test1234",
                                            "type": "text",
                                            "text": {"body": "Hi, what are your business hours?"},
                                        }
                                    ],
                                }
                            }
                        ],
                    }
                ],
            }
            wa_post_req = make_mock_request(method="POST", json_data=wa_payload)
            wa_res = await handle_whatsapp_webhook(agent.id, wa_post_req, bg, db=db)
            check("whatsapp_inbound_webhook_accepted", wa_res.get("status") == "ok")
            check("whatsapp_inbound_queued_background_task", len(bg.tasks) == 1)

            # Execute background processor with mocked HTTP reply and mocked bot answer
            with patch("app.routers.integrations.httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post, \
                 patch("app.routers.integrations._generate_bot_answer", new_callable=AsyncMock, return_value="Hello! I can help with that."):
                mock_post.return_value.is_success = True
                func, args, kwargs = bg.tasks[0]
                await func(*args, **kwargs)

            # Verify conversation was created with channel='whatsapp' and external_chat_id='+15551234567'
            conv_wa = (
                await db.execute(
                    select(Conversation).where(
                        Conversation.agent_id == agent.id,
                        Conversation.channel == "whatsapp",
                    )
                )
            ).scalar_one_or_none()
            check("whatsapp_conversation_persisted", conv_wa is not None and conv_wa.external_chat_id == "+15551234567")

            ser_wa = serialize_conversation(conv_wa)
            check("whatsapp_conversation_serialized_channel", ser_wa.get("channel") == "whatsapp" and ser_wa.get("externalChatId") == "+15551234567")

            # 4. Test Inbound Telegram Message Webhook
            bg_tg = MockBackgroundTasks()
            tg_payload = {
                "update_id": 998877,
                "message": {
                    "message_id": 42,
                    "from": {"id": 12345678, "first_name": "Charlie", "username": "charlietg"},
                    "chat": {"id": 12345678, "first_name": "Charlie", "type": "private"},
                    "date": 1726950000,
                    "text": "Hello from Telegram bot!",
                },
            }
            tg_post_req = make_mock_request(method="POST", json_data=tg_payload)
            tg_res = await handle_telegram_webhook(agent.id, tg_post_req, bg_tg, db=db)
            check("telegram_inbound_webhook_accepted", tg_res.get("ok") is True)
            check("telegram_inbound_queued_background_task", len(bg_tg.tasks) == 1)

            with patch("app.routers.integrations.httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post, \
                 patch("app.routers.integrations._generate_bot_answer", new_callable=AsyncMock, return_value="Hello from bot!"):
                mock_post.return_value.is_success = True
                func, args, kwargs = bg_tg.tasks[0]
                await func(*args, **kwargs)

            conv_tg = (
                await db.execute(
                    select(Conversation).where(
                        Conversation.agent_id == agent.id,
                        Conversation.channel == "telegram",
                    )
                )
            ).scalar_one_or_none()
            check("telegram_conversation_persisted", conv_tg is not None and conv_tg.external_chat_id == "12345678")

            # 5. Test Natural Language Escalation on WhatsApp
            bg_esc = MockBackgroundTasks()
            wa_esc_payload = {
                "object": "whatsapp_business_account",
                "entry": [
                    {
                        "id": "WHATSAPP_ACC_ID",
                        "changes": [
                            {
                                "value": {
                                    "messaging_product": "whatsapp",
                                    "metadata": {"phone_number_id": "109876543210"},
                                    "contacts": [{"profile": {"name": "Bob WhatsApp"}, "wa_id": "+15551234567"}],
                                    "messages": [
                                        {
                                            "from": "+15551234567",
                                            "id": "wamid.test5678",
                                            "type": "text",
                                            "text": "I need to speak to a human operator right now!",
                                        }
                                    ],
                                }
                            }
                        ],
                    }
                ],
            }
            await handle_whatsapp_webhook(agent.id, make_mock_request(method="POST", json_data=wa_esc_payload), bg_esc, db=db)
            with patch("app.routers.integrations.httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value.is_success = True
                func, args, kwargs = bg_esc.tasks[0]
                await func(*args, **kwargs)

            await db.refresh(conv_wa)
            check("whatsapp_natural_language_escalation", conv_wa.status == "needs_human")

            # 6. Test Human Operator Takeover & Outbound Dispatch
            bg_op = MockBackgroundTasks()
            op_msg_in = MessageIn(
                role="operator",
                text="Hello Bob, I am Sarah from the support team. How can I assist you?",
                sender_name="Sarah",
            )
            with patch("app.routers.conversations.invalidate_user_cache", new_callable=AsyncMock):
                op_res = await add_message(
                    conversation_id=conv_wa.id,
                    payload=op_msg_in,
                    background_tasks=bg_op,
                    user=test_user,
                    db=db,
                )
            await db.refresh(conv_wa)
            check("operator_message_takeover_status", conv_wa.status == "in_takeover")
            check("operator_message_recorded", op_res.get("senderName") == "Sarah")
            check("operator_reply_dispatched_to_whatsapp", len(bg_op.tasks) == 1, f"dispatched_task={bg_op.tasks[0][0].__name__}")

            # 7. Test Integration Verification Ping
            mock_resp = MagicMock()
            mock_resp.is_success = True
            mock_resp.status_code = 200
            mock_resp.json.return_value = {"ok": True, "result": {"username": "OmniBot"}}
            with patch("app.routers.integrations.httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
                mock_get.return_value = mock_resp
                tg_test_res = await trigger_integration_test(agent.id, tg_integ.id, user=test_user, db=db)
                check("telegram_integration_test_ping", tg_test_res.get("ok") is True)

        finally:
            await db.delete(test_user)
            await db.commit()

    failed = [name for name, ok, _ in results if not ok]
    if failed:
        print(f"\nFAILED {len(failed)} tests: {failed}", flush=True)
        sys.exit(1)
    else:
        print(f"\nSUCCESS: All {len(results)} Phase 2.4 tests passed cleanly!", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
