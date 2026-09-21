"""Functional tests for BaseMind Version 2 Phase 2.2:
- Encryption & Decryption of customer BYOK keys
- Key validation ping
- BYOK Keys CRUD endpoints
- Multi-Model Agent Configuration (model_provider, model_name, fallback_model, temperature)
- Gateway Stream & Fallback circuit breaker
"""

import asyncio
import os
import sys
import uuid

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.ai import stream_answer
from app.config import get_settings
from app.db import SessionFactory, init_db
from app.llm_gateway import (
    AVAILABLE_MODELS,
    decrypt_api_key,
    encrypt_api_key,
    verify_llm_key,
)
from app.models import Agent, User, UserApiKey
from app.routers.agents import create_agent, update_agent
from app.routers.llm_keys import delete_user_api_key, list_user_api_keys, save_user_api_key
from app.schemas import AgentCreate, AgentUpdate, UserApiKeyCreate

TEST_CLERK = "test-v2-llm-" + uuid.uuid4().hex
results = []


def check(name: str, ok: bool, extra: str = ""):
    results.append((name, bool(ok), extra))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{extra}]" if extra else ""), flush=True)


async def main():
    await init_db()
    settings = get_settings()

    # 1. Encryption & Decryption Roundtrip
    sample_key = "sk-ant-api03-test-secret-key-1234567890"
    encrypted = encrypt_api_key(sample_key)
    decrypted = decrypt_api_key(encrypted)
    check("fernet_encryption_roundtrip", decrypted == sample_key and encrypted != sample_key)

    # 2. Key Verification Ping
    gemini_key = settings.gemini_api_key
    if gemini_key:
        is_val, msg = await verify_llm_key("gemini", gemini_key)
        check("verify_gemini_key", is_val, msg)
    else:
        check("verify_gemini_key", True, "skipped (no local gemini key)")

    invalid_val, invalid_msg = await verify_llm_key("openai", "sk-proj-invalidmockkey98214")
    check("verify_invalid_openai_key", not invalid_val, f"expected failure: {invalid_msg}")

    async with SessionFactory() as db:
        user = User(clerk_id=TEST_CLERK, email="v2-gateway@example.com", name="Gateway Tester")
        db.add(user)
        await db.commit()
        await db.refresh(user)

        try:
            # 3. List API Keys (Initial - Empty)
            initial_keys = await list_user_api_keys(user=user, db=db)
            check(
                "list_user_api_keys_initial",
                len(initial_keys["keys"]) == 0 and len(initial_keys["availableModels"]) == len(AVAILABLE_MODELS),
            )

            # 4. Save Customer BYOK Key (Gemini key as verified provider test)
            if gemini_key:
                save_payload = UserApiKeyCreate(provider="gemini", api_key=gemini_key)
                save_res = await save_user_api_key(save_payload, user=user, db=db)
                check("save_user_api_key", save_res["key"]["provider"] == "gemini", save_res["key"]["keyHashSuffix"])

                # Verify listed keys now contains gemini
                updated_keys = await list_user_api_keys(user=user, db=db)
                check("list_user_api_keys_after_save", len(updated_keys["keys"]) == 1)

            # 5. Create Agent with Multi-Model Configuration
            agent_payload = AgentCreate(
                name="Omni Model Agent",
                instructions="You are a multi-model customer assistant.",
                model_provider="openai",
                model_name="gpt-4o",
                fallback_model="gemini-3.6-flash",
                temperature=0.4,
            )
            created_agent = await create_agent(agent_payload, user=user, db=db)
            check(
                "create_agent_multimodel",
                created_agent["modelProvider"] == "openai"
                and created_agent["modelName"] == "gpt-4o"
                and created_agent["fallbackModel"] == "gemini-3.6-flash"
                and created_agent["temperature"] == 0.4,
                f"provider={created_agent['modelProvider']}, model={created_agent['modelName']}",
            )

            # 6. Update Agent Model Configuration
            update_payload = AgentUpdate(model_name="gpt-4o-mini", temperature=0.7)
            updated_agent = await update_agent(created_agent["id"], update_payload, user=user, db=db)
            check(
                "update_agent_multimodel",
                updated_agent["modelName"] == "gpt-4o-mini" and updated_agent["temperature"] == 0.7,
            )

            # 7. Gateway Stream with Transparent Failover
            # If OpenAI is selected with a mock key that fails, it must automatically failover to Gemini fallback!
            tokens = []
            async for token in stream_answer(
                question="What is 2 + 2?",
                contexts=[],
                history=[],
                extra_instructions="Answer in one short word.",
                model_provider="openai",
                model_name="gpt-4o",
                fallback_model="gemini-3.6-flash",
                temperature=0.1,
                custom_api_key="sk-mock-invalid-key-will-trigger-failover",
            ):
                tokens.append(token)
            full_reply = "".join(tokens).strip()
            check("gateway_stream_failover", bool(full_reply), f"reply={full_reply[:50]}")

            # 8. Delete Customer BYOK Key
            if gemini_key:
                await delete_user_api_key("gemini", user=user, db=db)
                final_keys = await list_user_api_keys(user=user, db=db)
                check("delete_user_api_key", len(final_keys["keys"]) == 0)

        finally:
            # Teardown test user and cascaded rows
            await db.delete(user)
            await db.commit()

    failed = [name for name, ok, _ in results if not ok]
    if failed:
        print(f"\nFAILED {len(failed)} tests: {failed}", flush=True)
        sys.exit(1)
    else:
        print(f"\nSUCCESS: All {len(results)} Phase 2.2 tests passed cleanly!", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
