"""Full functional sweep for BaseMind backend (Phases 1-5).

Runs the routers directly against the real Neon DB + Gemini + B2 bucket, then
removes every test row and test B2 object at the end.

Run from the `backend/` directory (so `.env` resolves) with the venv python:

    PYTHONPATH="D:\\BaseMind\\backend" .venv\\Scripts\\python.exe tests\\test_all.py

Requires DATABASE_URL (real DB) and optionally GEMINI_API_KEY + B2_* for the
upload/chat/storage checks. Creates no permanent rows: a `func-test-*` user is
cleaned up on teardown.
"""

import asyncio
import contextlib
import io
import json
import os
import sys
import time
import uuid

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import BackgroundTasks, HTTPException, UploadFile
from sqlalchemy import delete, func, select, update

from app import routers
from app.db import SessionFactory, init_db
from app.models import (
    Agent,
    Conversation,
    Document,
    DocumentChunk,
    EventLog,
    Integration,
    KnowledgeGap,
    Lead,
    Message,
    Subscription,
    User,
)
from app.schemas import (
    AgentCreate,
    AgentUpdate,
    ConversationCreate,
    ConversationUpdate,
    DocumentCreate,
    KnowledgeGapUpdate,
    MessageFeedbackIn,
    MessageIn,
    SyncUrlRequest,
)
from app.storage import get_blob_api, is_b2_enabled

sys.stdout.reconfigure(line_buffering=True)

TEST_CLERK = "func-test-" + uuid.uuid4().hex
results = []


def check(name, ok, extra=""):
    results.append((name, bool(ok), extra))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{extra}]" if extra else ""))


async def main():
    os.environ["BREVO_ENABLED"] = "0"
    os.environ["OPERATOR_EMAILS"] = "func-test@example.com"
    await init_db()
    async with SessionFactory() as db:
        user = User(clerk_id=TEST_CLERK, email="func-test@example.com", name="Func Test")
        db.add(user)
        await db.commit()
        await db.refresh(user)
        user_id = user.id

        try:
            # ---- Agents ----
            agent = await routers.create_agent(
                AgentCreate(
                    name="Test Bot",
                    instructions="Be brief.",
                    color="#123456",
                    hide_branding=True,
                    custom_brand_name="Custom Brand Corp",
                ),
                user,
                db,
            )
            check("create_agent", agent["status"] == "active" and agent["name"] == "Test Bot" and agent["hideBranding"] is True and agent["customBrandName"] == "Custom Brand Corp")

            class _DummyRequest:
                headers = {}
                client = None

            pub = await routers.get_public_agent(agent["id"], _DummyRequest(), db)
            check("get_public_agent (whitelabel)", pub["hideBranding"] is True and pub["customBrandName"] == "Custom Brand Corp")

            upd = await routers.update_agent(agent["id"], AgentUpdate(status="paused", name="Test Bot 2", hide_branding=False, custom_brand_name=""), user, db)
            check("update_agent (pause+rename)", upd["status"] == "paused" and upd["name"] == "Test Bot 2" and upd["hideBranding"] is False and upd["customBrandName"] == "")

            # ownership guard
            user2 = User(clerk_id="func-test-" + uuid.uuid4().hex + "-b")
            db.add(user2)
            await db.commit()
            await db.refresh(user2)
            try:
                await routers.update_agent(agent["id"], AgentUpdate(status="active"), user2, db)
                check("_get_owned cross-account blocked", False)
            except HTTPException as e:
                check("_get_owned cross-account blocked", e.status_code == 404 and "different account" in e.detail)
            try:
                await routers.delete_agent("no-such-id", user, db)
                check("_get_owned missing id -> 404", False)
            except HTTPException as e:
                check("_get_owned missing id -> 404", e.status_code == 404)

            # ---- Documents ----
            metadata_doc = await routers.create_document(
                DocumentCreate(name="meta.txt", type="Text", detail="manual"), user, db
            )
            check("create_document (metadata)", metadata_doc["status"] == "ready")

            up = UploadFile(
                filename="func-test.txt",
                file=io.BytesIO(
                    b"BaseMind knowledge: pricing is free for students. Refund policy is 30 days. "
                    b"Support team replies within 24 hours."
                ),
            )
            doc = await routers.upload_document(up, None, user, db)
            check("upload_document (txt)", doc["type"] == "Text" and doc["detail"].startswith("1 chunks"))
            if is_b2_enabled():
                check("upload_document -> B2 storage_key set", bool(doc.get("storageKey")))
            else:
                check("upload_document -> B2 storage_key set", True, "B2 off")

            sync = await routers.sync_url(SyncUrlRequest(url="https://example.com"), user, db)
            check("sync_url (example.com)", sync["type"] == "Web Link" and sync["detail"].startswith("1 chunks"))

            bad = None
            try:
                bad = await routers.sync_url(SyncUrlRequest(url="ftp://example.com/x"), user, db)
            except HTTPException as e:
                if e.status_code == 422 and "http(s)" in e.detail:
                    check("sync_url bad scheme -> 422", True)
                else:
                    check("sync_url bad scheme -> 422", False, str(e.detail))
            check("sync_url bad scheme rejected", bad is None)

            # ---- Lists ----
            docs = await routers.list_documents(user, db)
            agents = await routers.list_agents(user, db)
            check("list_documents count", len(docs) == 3, f"{len(docs)} docs")
            check("list_agents count", len(agents) == 1)

            # ---- Conversations ----
            conv = await routers.create_conversation(
                ConversationCreate(visitor="Tester", agent_id=agent["id"]), user, db
            )
            check("create_conversation", bool(conv["id"]))

            conv_detail = await routers.conversation_detail(conv["id"], user, db)
            check("conversation_detail", conv_detail["id"] == conv["id"])
            check(
                "conversation detail camel startedAt",
                "startedAt" in conv_detail and "started_at" not in conv_detail,
            )

            await routers.add_message(conv["id"], MessageIn(role="user", text="hello"), user, db)
            conv2 = await routers.update_conversation(conv["id"], ConversationUpdate(status="resolved"), user, db)
            check("update_conversation (resolve)", conv2["status"] == "resolved")

            # ---- Chat (SSE, real Gemini) ----
            bt = BackgroundTasks()
            resp = await routers.chat(
                conv["id"],
                MessageIn(role="user", text="What is the refund policy?"),
                bt,
                user,
                db,
            )
            frames = []
            async for chunk in resp.body_iterator:
                frames.append(chunk)
            body = "".join(frames)
            await bt()  # persists the assistant message via background task
            check(
                "chat streamed", '"type": "sources"' in body and "refund" in body.lower(), body.replace("\n", " ")[:160]
            )
            check("chat done frame", '"type": "done"' in body)
            check("chat sources carry docId", '"docId"' in body)

            # agent message persisted (user "hello" + chat user + assistant = 3)
            mcount = (await db.execute(select(Message).where(Message.conversation_id == conv["id"]))).scalars().all()
            check("chat persisted 3 messages", len(mcount) == 3, f"{len(mcount)} rows")

            # ---- Public Chat Widget API ----
            from starlette.requests import Request  # noqa: PLC0415
            fake_req = Request({"type": "http", "method": "GET", "path": f"/api/public/agents/{agent['id']}", "headers": []})

            # Check 404 while agent is paused
            try:
                await routers.get_public_agent(agent["id"], fake_req, db)
                check("public agent 404 while paused", False)
            except HTTPException as e:
                check("public agent 404 while paused", e.status_code == 404)

            # Reactivate agent for widget access
            await routers.update_agent(agent["id"], AgentUpdate(status="active"), user, db)

            pub_agent = await routers.get_public_agent(agent["id"], fake_req, db)
            check(
                "public agent profile",
                pub_agent["id"] == agent["id"]
                and pub_agent["name"] == "Test Bot 2"
                and "greetingMessage" in pub_agent
                and isinstance(pub_agent["suggestedQuestions"], list)
                and pub_agent["status"] == "active",
                str(pub_agent),
            )

            try:
                await routers.get_public_agent("missing-agent-id", fake_req, db)
                check("public agent 404 for missing", False)
            except HTTPException as e:
                check("public agent 404 for missing", e.status_code == 404)

            from app.routers.public import PublicConversationCreate  # noqa: PLC0415
            pub_conv = await routers.create_public_conversation(
                agent["id"],
                PublicConversationCreate(visitor="Jane Visitor"),
                fake_req,
                db,
            )
            check("create_public_conversation", bool(pub_conv["id"]) and pub_conv["visitor"] == "Jane Visitor")

            pub_chat_stream = await routers.public_chat(
                pub_conv["id"],
                MessageIn(role="user", text="What is the refund policy?"),
                fake_req,
                db,
            )
            pub_body_chunks = [c async for c in pub_chat_stream.body_iterator]
            pub_body = "".join(pub_body_chunks)
            check("public_chat streamed", '"type": "token"' in pub_body and '"type": "done"' in pub_body)

            pub_detail = await routers.get_public_conversation(pub_conv["id"], db)
            check("get_public_conversation detail", pub_detail["id"] == pub_conv["id"] and pub_detail["messageCount"] >= 1)

            # ---- Live Agent Handover & Operator Takeover Tests ----
            # 1. Operator sends message with role="operator"
            op_msg_res = await routers.add_message(
                conv["id"],
                MessageIn(role="operator", text="Hello visitor, I am taking over your issue.", sender_name="Jane Agent"),
                user,
                db,
            )
            check("operator message added", op_msg_res["role"] == "operator" and op_msg_res["senderName"] == "Jane Agent")

            # Verify conversation shows operator message in thread
            conv_after_op = await routers.conversation_detail(conv["id"], user, db)
            check("conversation shows operator in thread", any(m["role"] == "operator" for m in conv_after_op["messages"]))

            # 2. Operator Takeover endpoint
            taken_over = await routers.takeover_conversation(conv["id"], user, db)
            check(
                "takeover_conversation sets in_takeover",
                taken_over["status"] == "in_takeover" and taken_over["assignedTo"] is not None,
                f"status={taken_over['status']} assignedTo={taken_over['assignedTo']}",
            )
            check("takeover notice appended", any("has taken over" in m["text"] for m in taken_over["messages"]))

            # 3. Return to AI endpoint
            returned_conv = await routers.return_conversation_to_ai(conv["id"], user, db)
            check(
                "return_conversation_to_ai resets active",
                returned_conv["status"] == "active" and returned_conv["assignedTo"] is None,
                f"status={returned_conv['status']}",
            )
            check("return notice appended", any("returned this conversation back to the AI" in m["text"] for m in returned_conv["messages"]))

            # 4. Public Handover endpoint (visitor clicks 'Talk to Human')
            pub_handover = await routers.request_public_handover(pub_conv["id"], fake_req, db)
            check("request_public_handover", pub_handover["status"] == "needs_human" and "handoverRequestedAt" in pub_handover)

            # 5. Public chat while in needs_human returns handover event without AI rag
            pub_msg_in_handover = await routers.public_chat(
                pub_conv["id"],
                MessageIn(role="user", text="Are you there operator?"),
                fake_req,
                db,
            )
            pub_handover_chunks = [c async for c in pub_msg_in_handover.body_iterator]
            pub_handover_body = "".join(pub_handover_chunks)
            check("public chat in handover returns handover event", '"type": "handover"' in pub_handover_body and '"needs_human"' in pub_handover_body)

            # 6. Natural Language Handover Intent Detection
            pub_conv2 = await routers.create_public_conversation(
                agent["id"],
                PublicConversationCreate(visitor="Escalation Tester"),
                fake_req,
                db,
            )
            intent_chat_stream = await routers.public_chat(
                pub_conv2["id"],
                MessageIn(role="user", text="I really want to talk to a human support person please"),
                fake_req,
                db,
            )
            intent_chunks = [c async for c in intent_chat_stream.body_iterator]
            intent_body = "".join(intent_chunks)
            check("natural language escalation intent triggered", '"type": "handover"' in intent_body and '"needs_human"' in intent_body)

            # Verify pub_conv2 status became needs_human
            pub_conv2_detail = await routers.get_public_conversation(pub_conv2["id"], db)
            check("conv auto-escalated status is needs_human", pub_conv2_detail["status"] == "needs_human")

            # ---- Conversation Analytics, CSAT Ratings & Knowledge Gap Detection ----
            pub_asst_msgs = [m for m in pub_detail["messages"] if m["role"] == "agent"]
            if pub_asst_msgs:
                pub_msg_id = pub_asst_msgs[0]["id"]
                rated_pub = await routers.submit_public_message_feedback(
                    pub_msg_id,
                    MessageFeedbackIn(rating=1, reason="Very helpful", comment="Clear explanation"),
                    fake_req,
                    db,
                )
                check("submit_public_message_feedback (+1)", rated_pub["rating"] == 1 and "Very helpful" in (rated_pub["feedbackReason"] or ""))

            # Studio chat message rating (-1 negative feedback auto-generates gap)
            asst_msgs = [m for m in mcount if m.role == "agent"]
            if asst_msgs:
                rated_asst = await routers.rate_message(
                    conv["id"],
                    asst_msgs[0].id,
                    MessageFeedbackIn(rating=-1, reason="outdated_knowledge", comment="Policy details were old"),
                    user,
                    db,
                )
                check("rate_message (-1 with reason)", rated_asst["rating"] == -1 and "outdated_knowledge" in (rated_asst["feedbackReason"] or ""))

            # Knowledge gaps listing & auto-detection verification
            gaps_res = await routers.list_knowledge_gaps(status="unresolved", user=user, db=db)
            check("knowledge gap auto-created from negative rating", gaps_res["total"] >= 1, f"gaps={gaps_res['total']}")

            if gaps_res["gaps"]:
                first_gap = gaps_res["gaps"][0]
                check("gap fields populated", bool(first_gap["id"]) and first_gap["frequency"] >= 1)

                # Deduplication test: re-recording the same query increments frequency
                dupe = await routers.record_knowledge_gap(
                    db=db,
                    user_id=user.id,
                    agent_id=agent["id"],
                    conversation_id=conv["id"],
                    query=first_gap["query"],
                    reason="low_confidence",
                )
                check("knowledge gap deduplication increments frequency", dupe.frequency >= 2, f"frequency={dupe.frequency}")

                # Update gap status to resolved
                resolved_gap = await routers.update_knowledge_gap(
                    first_gap["id"],
                    KnowledgeGapUpdate(status="resolved", resolution_note="Added updated policy document"),
                    user=user,
                    db=db,
                )
                check("update_knowledge_gap (resolved)", resolved_gap["status"] == "resolved" and resolved_gap["resolutionNote"] == "Added updated policy document")

                # Delete gap
                del_ok = await routers.delete_knowledge_gap(first_gap["id"], user=user, db=db)
                check("delete_knowledge_gap", del_ok is None or getattr(del_ok, "status_code", None) == 204 or del_ok is True)

            # Analytics overview KPIs & trends
            overview_res = await routers.analytics_overview(days=14, user=user, db=db)
            check(
                "analytics_overview computation",
                isinstance(overview_res["csatScore"], (int, float))
                and overview_res["totalRatings"] >= 1
                and isinstance(overview_res["trend14d"], list)
                and isinstance(overview_res["perAgent"], list),
                f"csat={overview_res.get('csatScore')} totalRatings={overview_res.get('totalRatings')}",
            )

            # ---- Lead Capture & Management ----
            from app.schemas import LeadCreate, LeadUpdate  # noqa: PLC0415
            pub_lead = await routers.submit_public_lead(
                agent["id"],
                LeadCreate(
                    name="Alice Wonder",
                    email="alice@wonderland.io",
                    phone="+1234567890",
                    company="Wonder Corp",
                    message="Interested in your enterprise solution.",
                    conversation_id=pub_conv["id"],
                ),
                fake_req,
                db,
            )
            check("submit_public_lead", pub_lead["id"] and pub_lead["email"] == "alice@wonderland.io")

            # Check conversation visitor updated from Guest to Alice Wonder
            conv_recheck = await routers.conversation_detail(pub_conv["id"], user, db)
            check("lead updated conversation visitor name", conv_recheck["user"] == "Alice Wonder")

            # List leads
            leads_res = await routers.get_leads(user=user, db=db)
            check(
                "get_leads returns lead and summary",
                len(leads_res["leads"]) >= 1
                and leads_res["summary"]["total"] >= 1
                and leads_res["summary"]["today"] >= 1,
            )

            # Filter leads by query
            q_res = await routers.get_leads(q="Wonder Corp", user=user, db=db)
            check("get_leads query filter matches", len(q_res["leads"]) == 1)

            # Update lead status
            updated_lead = await routers.update_lead(
                pub_lead["id"],
                LeadUpdate(status="contacted"),
                user,
                db,
            )
            check("update_lead status", updated_lead["status"] == "contacted")

            # Export leads CSV
            csv_resp = await routers.export_leads_csv(user, db)
            csv_body = csv_resp.body.decode("utf-8")
            check("export_leads_csv", "alice@wonderland.io" in csv_body and "Wonder Corp" in csv_body)

            # Delete lead
            await routers.delete_lead(pub_lead["id"], user, db)
            leads_after_del = await routers.get_leads(user=user, db=db)
            check("delete_lead", all(item["id"] != pub_lead["id"] for item in leads_after_del["leads"]))

            # ---- Slack & Discord Integrations ----
            import hashlib  # noqa: PLC0415
            import hmac  # noqa: PLC0415

            from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey  # noqa: PLC0415
            from starlette.requests import Request  # noqa: PLC0415

            from app.schemas import IntegrationCreate  # noqa: PLC0415

            # 1. Upsert Slack integration
            slack_secret = "slack-secret-123456789"  # noqa: S105
            slack_integ = await routers.upsert_agent_integration(
                agent["id"],
                IntegrationCreate(
                    platform="slack",
                    bot_token="xoxb-testbot-token-1234",  # noqa: S106
                    signing_secret=slack_secret,
                    channel_id="C12345678",
                ),
                user,
                db,
            )
            check("upsert slack integration", slack_integ["platform"] == "slack" and slack_integ["hasBotToken"] is True)
            check("slack token is masked", "••••••••" in slack_integ["botTokenMasked"])

            # 2. Slack URL challenge verification
            challenge_body = b'{"type": "url_verification", "challenge": "test-challenge-token"}'
            challenge_req = Request({
                "type": "http",
                "method": "POST",
                "path": f"/api/integrations/slack/{agent['id']}",
                "headers": [],
            })
            challenge_req._body = challenge_body
            bg_tasks = BackgroundTasks()
            challenge_res = await routers.handle_slack_webhook(agent["id"], challenge_req, bg_tasks, db)
            check("slack url verification challenge", challenge_res.get("challenge") == "test-challenge-token")

            # 3. Slack HMAC signature verification
            ts = str(int(time.time()))
            event_body = b'{"type": "event_callback", "event": {"type": "app_mention", "text": "<@U123> help", "channel": "C12345678"}}'
            sig_basestring = f"v0:{ts}:{event_body.decode('utf-8')}".encode()
            valid_sig = "v0=" + hmac.new(slack_secret.encode(), sig_basestring, hashlib.sha256).hexdigest()

            event_req = Request({
                "type": "http",
                "method": "POST",
                "path": f"/api/integrations/slack/{agent['id']}",
                "headers": [
                    (b"x-slack-request-timestamp", ts.encode()),
                    (b"x-slack-signature", valid_sig.encode()),
                ],
            })
            event_req._body = event_body
            event_res = await routers.handle_slack_webhook(agent["id"], event_req, bg_tasks, db)
            check("slack event with valid HMAC accepted", event_res.get("ok") is True)

            # 4. Slack forged signature rejected
            bad_req = Request({
                "type": "http",
                "method": "POST",
                "path": f"/api/integrations/slack/{agent['id']}",
                "headers": [
                    (b"x-slack-request-timestamp", ts.encode()),
                    (b"x-slack-signature", b"v0=invalid-signature"),
                ],
            })
            bad_req._body = event_body
            try:
                await routers.handle_slack_webhook(agent["id"], bad_req, bg_tasks, db)
                check("slack forged signature rejected", False)
            except HTTPException as e:
                check("slack forged signature rejected", e.status_code == 401)

            # 5. Discord Ed25519 Integration & Ping (Type 1)
            discord_priv = Ed25519PrivateKey.generate()
            discord_pub = discord_priv.public_key()
            discord_pub_hex = discord_pub.public_bytes_raw().hex()

            discord_integ = await routers.upsert_agent_integration(
                agent["id"],
                IntegrationCreate(
                    platform="discord",
                    signing_secret=discord_pub_hex,
                    webhook_url="https://discord.com/api/webhooks/test/123",
                ),
                user,
                db,
            )
            check("upsert discord integration", discord_integ["platform"] == "discord")

            # Discord PING with Ed25519 signature
            d_ts = str(int(time.time()))
            d_body = b'{"type": 1}'
            d_sig = discord_priv.sign(d_ts.encode() + d_body).hex()

            discord_req = Request({
                "type": "http",
                "method": "POST",
                "path": f"/api/integrations/discord/{agent['id']}",
                "headers": [
                    (b"x-signature-timestamp", d_ts.encode()),
                    (b"x-signature-ed25519", d_sig.encode()),
                ],
            })
            discord_req._body = d_body
            discord_res = await routers.handle_discord_webhook(agent["id"], discord_req, bg_tasks, db)
            check("discord PING type 1 acknowledged with type 1", discord_res.get("type") == 1)

            # Delete integration
            await routers.delete_agent_integration(agent["id"], slack_integ["id"], user, db)
            integs_after_del = await routers.list_agent_integrations(agent["id"], user, db)
            check("delete slack integration", all(i["id"] != slack_integ["id"] for i in integs_after_del))

            # ---- Dashboard ----
            dash = await routers.dashboard(user, db)
            stats = {s["id"]: s for s in dash["stats"]}
            check("dashboard 4 stats", len(dash["stats"]) == 4)
            check("dashboard real deltas", stats["agents"]["delta"] == "+1" and stats["documents"]["delta"] == "+3")
            check("dashboard activity feed", len(dash["activity"]) >= 1, f"{len(dash['activity'])} items")
            check("dashboard web-vs-file split", "web" in stats["documents"]["sub"])
            check(
                "dashboard perAgent",
                len(dash["perAgent"]) == 1
                and dash["perAgent"][0]["conversations"] >= 1
                and dash["perAgent"][0]["agentMsgs"] >= 1
                and dash["perAgent"][0]["resolved"] >= 1,
            )
            check("dashboard trend7d", len(dash["trend7d"]) == 7 and dash["trend7d"][-1]["conversations"] >= 1)
            check("dashboard perAgent has resolved field", "resolved" in dash["perAgent"][0])
            check(
                "dashboard vector block",
                dash["vector"]["embeddings"] >= 1
                and dash["vector"]["indexedDocs"] >= 1
                and dash["vector"]["dim"] == 768
                and dash["vector"]["status"] in {"synced", "syncing", "attention"},
                str(dash["vector"]),
            )

            from app.config import get_settings

            os.environ["OPERATOR_EMAILS"] = "func-test@example.com"
            get_settings.cache_clear()
            about = await routers.op_announcements(
                {"title": "Planned Maintenance", "body": "Downtime window tonight", "severity": "info"}, user, db
            )
            check("op_announcements creates unread row", bool(about["id"]))
            user2_dash = await routers.dashboard(user2, db)
            check(
                "announcement unread contract",
                any(a["id"] == about["id"] for a in user2_dash["announcements"]),
                str(user2_dash["announcements"]),
            )
            from app.cache import invalidate_user_cache

            await invalidate_user_cache(user.id)
            user2_dash2 = await routers.dashboard(user, db)
            check(
                "announcement visible to operator",
                any(a["id"] == about["id"] for a in user2_dash2["announcements"]),
            )
            await routers.mark_announcement_read(about["id"], user2, db)
            user2_dash3 = await routers.dashboard(user2, db)
            check(
                "announcement read -> absent",
                all(a["id"] != about["id"] for a in user2_dash3["announcements"]),
            )
            user_dash = await routers.dashboard(user, db)
            check(
                "announcement unread persists per-user",
                any(a["id"] == about["id"] for a in user_dash["announcements"]),
            )

            # ---- Ops / Admin dashboard ----
            from app.config import get_settings

            os.environ["OPERATOR_EMAILS"] = "func-test@example.com"
            get_settings.cache_clear()
            await routers.update_conversation(conv["id"], ConversationUpdate(status="halted"), user, db)
            ops = await routers.ops_status(user, db)
            check(
                "ops operator 200 + engine",
                ops["engine"] == "3.5" and isinstance(ops["nominal"], bool) and bool(ops["generatedAt"]),
            )
            check(
                "ops global metrics",
                ops["metrics"]["users"] >= 1
                and ops["metrics"]["activeAgents"] >= 1
                and ops["metrics"]["queriesToday"] >= 1
                and ops["metrics"]["totalQueries"] >= 1,
                str(ops["metrics"]),
            )
            check(
                "ops vector block",
                ops["vector"]["embeddings"] >= 1
                and ops["vector"]["dim"] == 768
                and ops["vector"]["status"] in {"synced", "syncing", "attention"},
                str(ops["vector"]),
            )
            check(
                "ops halted alert derived",
                any("halted" in a["text"].lower() or "rate limit" in a["text"].lower() for a in ops["alerts"]),
                str(ops["alerts"]),
            )
            await routers.update_conversation(conv["id"], ConversationUpdate(status="active"), user, db)

            try:
                await routers.ops_status(user2, db)
                check("ops non-operator blocked", False)
            except HTTPException as e:
                check("ops non-operator blocked", e.status_code == 403)

            db.add(EventLog(user_id=user.id, event_type="chat_stream_error", severity="error", detail="synthetic stream fail"))
            await db.commit()
            ops2 = await routers.ops_status(user, db)
            check(
                "ops activity surfaces error event",
                any(a["severity"] == "error" and "stream" in a["text"].lower() for a in ops2["activity"]),
                str(ops2["activity"][:2]),
            )

            _orig_embed = routers.documents.embed_texts

            async def _embed_boom(chunks):
                raise RuntimeError("embedding down (synthetic)")

            routers.documents.embed_texts = _embed_boom
            try:
                try:
                    await routers._persist_document(
                        db, user=user, name="boom.txt", doc_type="Text", text="some words to chunk and embed"
                    )
                    check("ingest_error logged", False)
                except RuntimeError:
                    n_ingest = (
                        await db.execute(
                            select(func.count())
                            .select_from(EventLog)
                            .where(EventLog.user_id == user.id, EventLog.event_type == "ingest_error")
                        )
                    ).scalar_one()
                    check("ingest_error logged", n_ingest >= 1, f"{n_ingest} events")
            finally:
                routers.documents.embed_texts = _orig_embed

            # ---- Download (4A2 signed URL) ----
            web_resp = await routers.download_document(sync["id"], user, db)
            check(
                "download web link -> 302 source",
                getattr(web_resp, "status_code", None) == 302
                and str(getattr(web_resp, "headers", {}).get("location", "")) == "https://example.com",
            )

            if is_b2_enabled():
                file_resp = await routers.download_document(doc["id"], user, db)
                loc = (
                    str(getattr(file_resp, "headers", {}).get("location", ""))
                    if getattr(file_resp, "status_code", 0) == 302
                    else ""
                )
                check(
                    "download file -> 302 signed URL",
                    getattr(file_resp, "status_code", None) == 302
                    and "backblazeb2.com" in loc
                    and doc["storageKey"].split("/")[-1] in loc,
                )
            else:
                check("download file -> 302 signed URL", True, "B2 off")

            try:
                await routers.download_document(metadata_doc["id"], user, db)
                check("download no-storage-key -> 404", False)
            except HTTPException as e:
                check("download no-storage-key -> 404", e.status_code == 404 and "not stored" in e.detail)

            try:
                await routers.download_document(doc["id"], user2, db)
                check("download cross-account -> 404", False)
            except HTTPException as e:
                check("download cross-account -> 404", e.status_code == 404 and "different account" in e.detail)

            # ---- 4B preview + download-url + halted status ----
            prev = await routers.document_preview(doc["id"], user, db)
            check(
                "document_preview file (chunks)",
                prev["name"] == doc["name"] and "BaseMind knowledge" in prev["preview"],
            )
            pub_prev = await routers.document_preview(sync["id"], user, db)
            check("document_preview web link", "Example Domain" in pub_prev["preview"])
            empty_prev = await routers.document_preview(metadata_doc["id"], user, db)
            check("document_preview empty doc", empty_prev["preview"] == "")
            try:
                await routers.document_preview(doc["id"], user2, db)
                check("document_preview cross-account -> 404", False)
            except HTTPException as e:
                check("document_preview cross-account -> 404", e.status_code == 404 and "different account" in e.detail)

            wurl = await routers.download_document_url(sync["id"], user, db)
            check("download-url web link", wurl["url"] == "https://example.com")
            if is_b2_enabled():
                furl = await routers.download_document_url(doc["id"], user, db)
                check(
                    "download-url file signed url",
                    "backblazeb2.com" in furl["url"] and doc["storageKey"].split("/")[-1] in furl["url"],
                )
            else:
                check("download-url file signed url", True, "B2 off")

            halt = await routers.update_conversation(conv["id"], ConversationUpdate(status="halted"), user, db)
            check("update_conversation (halt)", halt["status"] == "halted")
            reopen = await routers.update_conversation(conv["id"], ConversationUpdate(status="active"), user, db)
            check("update_conversation (reopen)", reopen["status"] == "active")

            # ---- Deletes ----
            await routers.delete_document(doc["id"], user, db)
            api = get_blob_api()
            if api:
                objs = list(api.get_bucket_by_name("BaseMind").ls(f"{user.id}/"))
                check("delete_document -> B2 object removed", len(objs) == 0, f"{len(objs)} left")
            check("delete_document", True)
            await routers.delete_agent(agent["id"], user, db)
            check("delete_agent", True)

            # ---- 5C: conversation delete + chat rate limit ----
            conv_b = await routers.create_conversation(ConversationCreate(visitor="DelMe", agent_id=None), user, db)
            await routers.add_message(conv_b["id"], MessageIn(role="user", text="temporary thread"), user, db)
            await routers.delete_conversation(conv_b["id"], user, db)
            gone = (
                await db.execute(
                    select(func.count()).select_from(Message).where(Message.conversation_id == conv_b["id"])
                )
            ).scalar_one()
            check("delete_conversation removed thread rows", gone == 0, f"{gone} rows")
            try:
                await routers.conversation_detail(conv_b["id"], user, db)
                check("delete_conversation -> 404 on detail", False)
            except HTTPException as e:
                check("delete_conversation -> 404 on detail", e.status_code == 404)

            old_max = routers.deps.CHAT_RATE_MAX
            routers.deps.CHAT_RATE_MAX = 3
            routers.deps._chat_hits.pop(user.id, None)
            tries = [routers.deps._allow_chat(user.id) for _ in range(5)]
            check("chat rate limit blocks overflow", tries == [True] * 3 + [False] * 2, str(tries))
            routers.deps.CHAT_RATE_MAX = old_max
            routers.deps._chat_hits.pop(user.id, None)

            # ---- 5B: settings status + delete workspace (/api/me) ----
            stat = await routers.settings_status(user, db)
            check("settings_status", stat["db_configured"] is True and stat["b2_enabled"] is not None)

            # ---- Razorpay billing + free plan gating ----
            from app.config import get_settings as _cfg_get_settings
            from app.routers import billing as billing_mod

            os.environ["RAZORPAY_KEY_ID"] = "rzp_test_C0D3W0RD_K3Y"  # noqa: S105
            os.environ["RAZORPAY_KEY_SECRET"] = "c0d3w0rd_rzp_secret"  # noqa: S105
            os.environ["RAZORPAY_PLAN_ID"] = "plan_c0d3w0rd_monthly"
            os.environ["RAZORPAY_ANNUAL_PLAN_ID"] = "plan_c0d3w0rd_annual"
            os.environ["RAZORPAY_WEBHOOK_SECRET"] = "c0d3w0rd_rzp_webhook"  # noqa: S105
            _cfg_get_settings.cache_clear()
            billing_mod._pro_settings = None

            _created_plan_ids = []

            class _FakeRzpSub:
                def __init__(self, store):
                    self._store = store

                def create(self, body, **kw):
                    self._store.append(body.get("plan_id"))
                    return {"id": "sub_test_" + uuid.uuid4().hex, "short_url": "https://rzp.io/i/test"}

                def cancel(self, sub_id, opts):
                    return {"id": sub_id, "status": "cancelled"}

            class _FakeRzp:
                def __init__(self, store):
                    self.subscription = _FakeRzpSub(store)
                    self.utility = self

                def verify_webhook_signature(self, body, signature, secret):
                    return True

            billing_mod._client = _FakeRzp(_created_plan_ids)

            sub0 = await billing_mod._get_or_create_subscription(db, user.id)
            sub0.status = "active"
            await db.commit()

            bill = await routers.billing_status(user, db)
            check("billing_status returns free plan", bill["plan"] == "free" and bill["status"] == "active")

            limit_a = await routers.create_agent(AgentCreate(name="Limit Bot", instructions="x", color="#111111"), user, db)
            check("free plan allows 1st agent", limit_a["name"] == "Limit Bot")
            try:
                await routers.create_agent(AgentCreate(name="Limit Bot 2", instructions="x", color="#111111"), user, db)
                check("free plan blocks 2nd agent -> 402", False)
            except HTTPException as e:
                check("free plan blocks 2nd agent -> 402", e.status_code == 402 and "Upgrade to Pro" in e.detail)

            checkout = await routers.billing_checkout("monthly", user, db)
            check(
                "checkout monthly returns subscription + key",
                bool(checkout["subscription_id"]) and checkout["key_id"] == "rzp_test_C0D3W0RD_K3Y" and checkout["interval"] == "monthly",
                f"interval={checkout.get('interval')}",
            )
            check(
                "checkout monthly used monthly plan",
                bool(_created_plan_ids) and _created_plan_ids[-1] == "plan_c0d3w0rd_monthly",
                f"plan_id={_created_plan_ids[-1] if _created_plan_ids else None}",
            )

            annual = await routers.billing_checkout("annual", user, db)
            check(
                "checkout annual used annual plan",
                annual["interval"] == "annual" and bool(_created_plan_ids) and _created_plan_ids[-1] == "plan_c0d3w0rd_annual",
                f"plan_id={_created_plan_ids[-1] if _created_plan_ids else None}",
            )

            sub2 = (await db.execute(select(Subscription).where(Subscription.user_id == user.id))).scalar_one()
            webhook_payload = {
                "event": "subscription.activated",
                "payload": {
                    "subscription": {
                        "entity": {
                            "id": sub2.razorpay_subscription_id,
                            "current_end": int(time.time()) + 30 * 86400,
                            "customer_id": "cust_test",
                        }
                    }
                },
            }
            import httpx  # noqa: PLC0415

            from app.main import app as fastapi_app

            _transport = httpx.ASGITransport(app=fastapi_app)
            async with httpx.AsyncClient(transport=_transport, base_url="http://test") as _wc:
                wresp = await _wc.post(
                    "/api/webhooks/razorpay",
                    headers={"x-razorpay-signature": "sig-test"},
                    content=json.dumps(webhook_payload),
                )
            check("razorpay webhook activation accepted", wresp.status_code == 200, f"status={wresp.status_code}")

            await db.refresh(sub2)

            sub3 = (await db.execute(select(Subscription).where(Subscription.user_id == user.id))).scalar_one()
            check(
                "webhook set pro + period end",
                sub3.plan == "pro" and sub3.status == "active" and sub3.current_period_end is not None,
            )
            bill2 = await routers.billing_status(user, db)
            check("billing_status reflects pro", bill2["plan"] == "pro" and bill2["status"] == "active")

            pro_agent = await routers.create_agent(
                AgentCreate(name="Pro Bot", instructions="x", color="#222222"), user, db
            )
            check("pro plan allows 2nd agent", pro_agent["name"] == "Pro Bot")
            await routers.delete_agent(pro_agent["id"], user, db)

            cancel = await routers.billing_cancel(user, db)
            check("cancel clears plan to free", cancel["plan"] == "free" and cancel["status"] == "cancelled")
            bill3 = await routers.billing_status(user, db)
            check("billing_status back to free", bill3["plan"] == "free" and bill3["status"] == "cancelled")

            try:
                await routers.create_agent(AgentCreate(name="Free Bot 2", instructions="x", color="#333333"), user, db)
                check("free plan still blocks 2nd agent after cancel", False)
            except HTTPException as e:
                check("free plan still blocks 2nd agent after cancel", e.status_code == 402)

            await routers.delete_agent(limit_a["id"], user, db)
            await db.execute(update(Subscription).where(Subscription.user_id == user.id).values(plan="free"))
            await db.commit()

            # ---- Admin ops (operator endpoints) ----
            tenants = await routers.op_tenants(user, db)
            mine = next((t for t in tenants if t.get("user_id") == user.id), None)
            check(
                "op_tenants includes admin fields",
                mine is not None
                and "subscription_status" in mine
                and "platform_status" in mine
                and "current_period_end" in mine,
                f"keys={sorted((mine or {}).keys())}",
            )

            victim = User(clerk_id="func-test-victim-" + uuid.uuid4().hex, email="victim@test", name="Victim")
            db.add(victim)
            await db.commit()
            await db.refresh(victim)
            await routers.create_agent(AgentCreate(name="Victim Bot", instructions="x", color="#444444"), victim, db)

            upd = await routers.admin_update_user(victim.id, {"plan": "pro", "status": "suspended"}, user, db)
            v_sub = (
                (await db.execute(select(Subscription).where(Subscription.user_id == victim.id))).scalar_one_or_none()
            )
            v_row = (await db.execute(select(User).where(User.id == victim.id))).scalar_one_or_none()
            check(
                "admin_update_user sets plan + status",
                upd["plan"] == "pro"
                and upd["platform_status"] == "suspended"
                and v_sub is not None
                and v_sub.plan == "pro"
                and v_row is not None
                and v_row.platform_status == "suspended",
            )

            v_tenants = await routers.op_tenants(user, db)
            v_entry = next((t for t in v_tenants if t.get("user_id") == victim.id), None)
            check(
                "op_tenants reflects victim plan",
                v_entry is not None
                and v_entry.get("plan") == "pro"
                and v_entry.get("subscription_status") == "active"
                and v_entry.get("platform_status") == "suspended",
                f"entry={v_entry}",
            )

            try:
                await routers.admin_update_user(victim.id, {"plan": "bogus"}, user, db)
                check("admin_update_user rejects bad plan", False)
            except HTTPException as e:
                check("admin_update_user rejects bad plan", e.status_code == 422)

            try:
                await routers.admin_delete_user(user.id, user, db)
                check("admin_delete_user blocks self-delete", False)
            except HTTPException as e:
                check("admin_delete_user blocks self-delete", e.status_code == 400)

            try:
                await routers.admin_delete_user("no-such-user", user, db)
                check("admin_delete_user 404 for missing", False)
            except HTTPException as e:
                check("admin_delete_user 404 for missing", e.status_code == 404)

            await routers.admin_delete_user(victim.id, user, db)
            v_gone = (await db.execute(select(User).where(User.id == victim.id))).scalar_one_or_none()
            v_agents = (
                (await db.execute(select(func.count()).select_from(Agent).where(Agent.user_id == victim.id))).scalar_one()
            )
            v_subs = (
                (await db.execute(select(func.count()).select_from(Subscription).where(Subscription.user_id == victim.id))).scalar_one()
            )
            check(
                "admin_delete_user removed user + cascade",
                v_gone is None and v_agents == 0 and v_subs == 0,
                f"agents={v_agents} subs={v_subs}",
            )

            billing_mod._client = None
            billing_mod._pro_settings = None
            _cfg_get_settings.cache_clear()
            os.environ.pop("RAZORPAY_ANNUAL_PLAN_ID", None)

            ws_doc = await routers.upload_document(
                UploadFile(filename="ws-cleanup.txt", file=io.BytesIO(b"temp data for workspace purge")),
                None,
                user,
                db,
            )
            if is_b2_enabled():
                check("workspace-delete sees B2 object", bool(ws_doc.get("storageKey")))
            else:
                check("workspace-delete sees B2 object", True, "B2 off")

            # ---- Emails (Brevo) ----
            from app import email as email_mod

            _orig_brevo = email_mod._send_brevo
            _sent = []

            async def _fake_brevo(to, subj, html):
                _sent.append((to, subj))

            async def _count_events(event_type):
                return (
                    await db.execute(
                        select(func.count())
                        .select_from(EventLog)
                        .where(EventLog.user_id == user.id, EventLog.event_type == event_type)
                    )
                ).scalar_one()

            email_mod._send_brevo = _fake_brevo
            os.environ["BREVO_ENABLED"] = "1"
            os.environ["BREVO_API_KEY"] = "test-key"

            n0 = await _count_events("email_digest")
            first = await email_mod.send_email(db, user.id, "digest", user.email, "D", "<p>d</p>")
            n1 = await _count_events("email_digest")
            again = await email_mod.send_email(db, user.id, "digest", user.email, "D2", "<p>d2</p>")
            n2 = await _count_events("email_digest")
            check(
                "email digest sends once (cooldown)",
                first and not again and n1 == n0 + 1 and n2 == n1,
                f"first={first} again={again} markers={n2 - n0}",
            )

            r_first = await email_mod.send_email(db, user.id, "rate_limit", user.email, "R", "<p>r</p>")
            r_again = await email_mod.send_email(db, user.id, "rate_limit", user.email, "R2", "<p>r2</p>")
            check("email rate-limit throttled", r_first and not r_again, f"first={r_first} again={r_again}")

            os.environ["BREVO_ENABLED"] = "0"
            off = await email_mod.send_email(db, user.id, "welcome", user.email, "W", "<p>w</p>")
            off_markers = await _count_events("email_welcome")
            check("email disabled = no-op", off is False and off_markers == 0, f"sent={off}")
            os.environ.pop("BREVO_ENABLED", None)
            os.environ.pop("BREVO_API_KEY", None)
            email_mod._send_brevo = _orig_brevo

            check("email welcome template", "Welcome to BaseMind" in email_mod._welcome_html("Tester"))
            check("email escalation template", "Visitor Escalated to Human Support" in email_mod._escalation_html("Bot", "Visitor 1", "conv-123"))
            check("email new lead template", "New Lead Captured" in email_mod._new_lead_html("Bot", "Alice", "alice@example.com", "+12345", "Acme", "Interested"))
            _dig = email_mod._digest_html(
                "Tester", {"agents": [{"name": "Bot", "queries": 3, "resolved": 2, "halted": 0}]}
            )
            check("email digest template renders agent rows", "Bot" in _dig and "Queries" in _dig)

            await routers.delete_workspace(user, db)
            n_docs = (
                await db.execute(select(func.count()).select_from(Document).where(Document.user_id == user_id))
            ).scalar_one()
            n_convs = (
                await db.execute(select(func.count()).select_from(Conversation).where(Conversation.user_id == user_id))
            ).scalar_one()
            n_users = (await db.execute(select(func.count()).select_from(User).where(User.id == user_id))).scalar_one()
            check("delete /api/me wiped documents", n_docs == 0, f"{n_docs} docs left")
            check("delete /api/me wiped conversations", n_convs == 0, f"{n_convs} convs left")
            check("delete /api/me wiped user row", n_users == 0)
            api = get_blob_api()
            if api:
                objs = list(api.get_bucket_by_name("BaseMind").ls(f"{user_id}/"))
                check("delete /api/me removed B2 objects", len(objs) == 0, f"{len(objs)} left")
            else:
                check("delete /api/me removed B2 objects", True, "B2 off")

        finally:
            # ---- Teardown: remove every test row ----
            with contextlib.suppress(Exception):
                await db.rollback()
            conv_ids = (
                (await db.execute(select(Conversation.id).where(Conversation.user_id == user_id))).scalars().all()
            )
            if conv_ids:
                await db.execute(delete(Message).where(Message.conversation_id.in_(conv_ids)))
            await db.execute(delete(Conversation).where(Conversation.user_id == user_id))
            chunk_ids = (
                (await db.execute(select(DocumentChunk.id).where(DocumentChunk.user_id == user_id))).scalars().all()
            )
            doc_ids = (await db.execute(select(Document.id).where(Document.user_id == user_id))).scalars().all()
            if chunk_ids:
                await db.execute(delete(DocumentChunk).where(DocumentChunk.id.in_(chunk_ids)))
            if doc_ids:
                await db.execute(delete(Document).where(Document.id.in_(doc_ids)))
            await db.execute(delete(KnowledgeGap).where(KnowledgeGap.user_id == user_id))
            await db.execute(delete(Lead).where(Lead.user_id == user_id))
            await db.execute(delete(Integration).where(Integration.user_id == user_id))
            await db.execute(delete(Agent).where(Agent.user_id == user_id))
            await db.execute(delete(EventLog).where(EventLog.user_id == user_id))
            await db.execute(delete(User).where(User.id == user_id))
            await db.execute(delete(User).where(User.clerk_id.like("func-test-%")))
            await db.commit()
            print("teardown: db rows removed for test user")

            # B2 test objects cleanup (uploaded under user.id prefix)
            try:
                api = get_blob_api()
                if api:
                    bucket = api.get_bucket_by_name("BaseMind")
                    for fv, _name in bucket.ls(f"{user_id}/"):
                        api.delete_file_version(fv.id_, fv.file_name)
                    print("teardown: B2 objects removed")
                else:
                    print("teardown: B2 not configured, nothing to clean (upload skipped)")
            except Exception as e:
                print("teardown B2 WARN:", e)

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n=== {passed}/{len(results)} checks passed ===")
    if passed != len(results):
        for name, ok, extra in results:
            if not ok:
                print("  FAILED:", name, extra)
        raise SystemExit(1)


asyncio.run(main())
