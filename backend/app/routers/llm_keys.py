"""Router for customer BYOK (Bring Your Own Key) management.

Allows users to configure, test, store (encrypted at rest), and revoke
API keys for OpenAI, Anthropic, Gemini, and custom inference endpoints.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..db import get_db
from ..llm_gateway import (
    AVAILABLE_MODELS,
    encrypt_api_key,
    verify_llm_key,
)
from ..models import User, UserApiKey
from ..schemas import UserApiKeyCreate, serialize_user_api_key

router = APIRouter(prefix="/api/settings/keys", tags=["llm-keys"])


@router.get("")
async def list_user_api_keys(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """List all configured BYOK provider keys for the authenticated user."""
    res = await db.execute(
        select(UserApiKey)
        .where(UserApiKey.user_id == user.id)
        .order_by(UserApiKey.provider.asc())
    )
    keys = res.scalars().all()
    return {
        "keys": [serialize_user_api_key(k) for k in keys],
        "availableModels": AVAILABLE_MODELS,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def save_user_api_key(
    payload: UserApiKeyCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Validate customer API key via live ping, encrypt at rest, and store in DB."""
    # 1. Live Validation Ping
    is_valid, validation_msg = await verify_llm_key(
        provider=payload.provider,
        api_key=payload.api_key,
        base_url=payload.base_url,
    )
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Key validation failed: {validation_msg}",
        )

    # 2. Encrypt Key and Calculate Mask Suffix
    clean_key = payload.api_key.strip()
    key_suffix = f"...{clean_key[-4:]}" if len(clean_key) >= 4 else "••••"
    encrypted_key = encrypt_api_key(clean_key)

    # 3. Upsert into database
    res = await db.execute(
        select(UserApiKey).where(
            UserApiKey.user_id == user.id,
            UserApiKey.provider == payload.provider,
        )
    )
    existing = res.scalar_one_or_none()

    if existing:
        existing.key_hash_suffix = key_suffix
        existing.api_key_encrypted = encrypted_key
        existing.base_url = payload.base_url.strip() if payload.base_url else None
        existing.is_valid = True
        key_obj = existing
    else:
        key_obj = UserApiKey(
            user_id=user.id,
            provider=payload.provider,
            key_hash_suffix=key_suffix,
            api_key_encrypted=encrypted_key,
            base_url=payload.base_url.strip() if payload.base_url else None,
            is_valid=True,
        )
        db.add(key_obj)

    await db.commit()
    await db.refresh(key_obj)

    return {
        "message": validation_msg,
        "key": serialize_user_api_key(key_obj),
    }


@router.delete("/{provider}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_api_key(
    provider: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a customer BYOK key to revert back to platform default."""
    res = await db.execute(
        select(UserApiKey).where(
            UserApiKey.user_id == user.id,
            UserApiKey.provider == provider,
        )
    )
    existing = res.scalar_one_or_none()
    if existing:
        await db.delete(existing)
        await db.commit()
