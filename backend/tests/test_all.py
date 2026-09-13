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
import io
import os
import uuid

from fastapi import HTTPException, UploadFile
from sqlalchemy import delete, func, select

from app import routers
from app.db import SessionFactory, init_db
from app.models import Agent, Conversation, Document, DocumentChunk, EventLog, Message, User
from app.schemas import (
    AgentCreate,
    AgentUpdate,
    ConversationCreate,
    ConversationUpdate,
    DocumentCreate,
    MessageIn,
    SyncUrlRequest,
)
from app.storage import get_blob_api

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

        try:
            # ---- Agents ----
            agent = await routers.create_agent(
                AgentCreate(name="Test Bot", instructions="Be brief.", color="#123456"), user, db
            )
            check("create_agent", agent["status"] == "active" and agent["name"] == "Test Bot")

            upd = await routers.update_agent(agent["id"], AgentUpdate(status="paused", name="Test Bot 2"), user, db)
            check("update_agent (pause+rename)", upd["status"] == "paused" and upd["name"] == "Test Bot 2")

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
            check("upload_document -> B2 storage_key set", bool(doc.get("storageKey")))

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

            await routers.add_message(conv["id"], MessageIn(role="user", text="hello"), user, db)
            conv2 = await routers.update_conversation(conv["id"], ConversationUpdate(status="resolved"), user, db)
            check("update_conversation (resolve)", conv2["status"] == "resolved")

            # ---- Chat (SSE, real Gemini) ----
            resp = await routers.chat(conv["id"], MessageIn(role="user", text="What is the refund policy?"), user, db)
            frames = []
            async for chunk in resp.body_iterator:
                frames.append(chunk)
            body = "".join(frames)
            check(
                "chat streamed", '"type": "sources"' in body and "refund" in body.lower(), body.replace("\n", " ")[:160]
            )
            check("chat done frame", '"type": "done"' in body)
            check("chat sources carry docId", '"docId"' in body)

            # agent message persisted (user "hello" + chat user + assistant = 3)
            mcount = (await db.execute(select(Message).where(Message.conversation_id == conv["id"]))).scalars().all()
            check("chat persisted 3 messages", len(mcount) == 3, f"{len(mcount)} rows")

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

            # ---- Ops / Admin dashboard ----
            from app.config import get_settings

            os.environ["OPERATOR_EMAILS"] = "func-test@example.com"
            get_settings.cache_clear()
            await routers.update_conversation(conv["id"], ConversationUpdate(status="halted"), user, db)
            ops = await routers.ops_status(user, db)
            check(
                "ops operator 200 + engine",
                ops["engine"] == "3.4" and isinstance(ops["nominal"], bool) and bool(ops["generatedAt"]),
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

            _orig_embed = routers.embed_texts

            async def _embed_boom(chunks):
                raise RuntimeError("embedding down (synthetic)")

            routers.embed_texts = _embed_boom
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
                routers.embed_texts = _orig_embed

            # ---- Download (4A2 signed URL) ----
            web_resp = await routers.download_document(sync["id"], user, db)
            check(
                "download web link -> 302 source",
                getattr(web_resp, "status_code", None) == 302
                and str(getattr(web_resp, "headers", {}).get("location", "")) == "https://example.com",
            )

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
            furl = await routers.download_document_url(doc["id"], user, db)
            check(
                "download-url file signed url",
                "backblazeb2.com" in furl["url"] and doc["storageKey"].split("/")[-1] in furl["url"],
            )

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

            old_max = routers.CHAT_RATE_MAX
            routers.CHAT_RATE_MAX = 3
            routers._chat_hits.pop(user.id, None)
            tries = [routers._allow_chat(user.id) for _ in range(5)]
            check("chat rate limit blocks overflow", tries == [True] * 3 + [False] * 2, str(tries))
            routers.CHAT_RATE_MAX = old_max
            routers._chat_hits.pop(user.id, None)

            # ---- 5B: settings status + delete workspace (/api/me) ----
            stat = await routers.settings_status(user, db)
            check("settings_status", stat["db_configured"] is True and stat["b2_enabled"] is not None)

            ws_doc = await routers.upload_document(
                UploadFile(filename="ws-cleanup.txt", file=io.BytesIO(b"temp data for workspace purge")),
                None,
                user,
                db,
            )
            check("workspace-delete sees B2 object", bool(ws_doc.get("storageKey")))

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
            _dig = email_mod._digest_html(
                "Tester", {"agents": [{"name": "Bot", "queries": 3, "resolved": 2, "halted": 0}]}
            )
            check("email digest template renders agent rows", "Bot" in _dig and "Queries" in _dig)

            await routers.delete_workspace(user, db)
            n_docs = (
                await db.execute(select(func.count()).select_from(Document).where(Document.user_id == user.id))
            ).scalar_one()
            n_convs = (
                await db.execute(select(func.count()).select_from(Conversation).where(Conversation.user_id == user.id))
            ).scalar_one()
            n_users = (await db.execute(select(func.count()).select_from(User).where(User.id == user.id))).scalar_one()
            check("delete /api/me wiped documents", n_docs == 0, f"{n_docs} docs left")
            check("delete /api/me wiped conversations", n_convs == 0, f"{n_convs} convs left")
            check("delete /api/me wiped user row", n_users == 0)
            api = get_blob_api()
            if api:
                objs = list(api.get_bucket_by_name("BaseMind").ls(f"{user.id}/"))
                check("delete /api/me removed B2 objects", len(objs) == 0, f"{len(objs)} left")
            else:
                check("delete /api/me removed B2 objects", True, "B2 off")

        finally:
            # ---- Teardown: remove every test row ----
            conv_ids = (
                (await db.execute(select(Conversation.id).where(Conversation.user_id == user.id))).scalars().all()
            )
            if conv_ids:
                await db.execute(delete(Message).where(Message.conversation_id.in_(conv_ids)))
            await db.execute(delete(Conversation).where(Conversation.user_id == user.id))
            chunk_ids = (
                (await db.execute(select(DocumentChunk.id).where(DocumentChunk.user_id == user.id))).scalars().all()
            )
            doc_ids = (await db.execute(select(Document.id).where(Document.user_id == user.id))).scalars().all()
            if chunk_ids:
                await db.execute(delete(DocumentChunk).where(DocumentChunk.id.in_(chunk_ids)))
            if doc_ids:
                await db.execute(delete(Document).where(Document.id.in_(doc_ids)))
            await db.execute(delete(Agent).where(Agent.user_id == user.id))
            await db.execute(delete(EventLog).where(EventLog.user_id == user.id))
            await db.execute(delete(User).where(User.id == user.id))
            await db.execute(delete(User).where(User.clerk_id.like("func-test-%")))
            await db.commit()
            print("teardown: db rows removed for test user")

            # B2 test objects cleanup (uploaded under user.id prefix)
            try:
                api = get_blob_api()
                if api:
                    bucket = api.get_bucket_by_name("BaseMind")
                    for fv, _name in bucket.ls(f"{user.id}/"):
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
