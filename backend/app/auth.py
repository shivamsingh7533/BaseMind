from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import jwt as pyjwt

from .config import get_settings
from .db import get_db
from .models import User

_bearer = HTTPBearer(auto_error=False)
_jwks_client: pyjwt.PyJWKClient | None = None


def _get_jwks_client() -> pyjwt.PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        settings = get_settings()
        if not settings.clerk_jwks_url:
            raise HTTPException(
                status_code=503,
                detail="Auth not configured. Set CLERK_JWKS_URL.",
            )
        _jwks_client = pyjwt.PyJWKClient(settings.clerk_jwks_url, cache_keys=True)
    return _jwks_client


def verify_clerk_token(token: str) -> dict:
    settings = get_settings()
    try:
        key = _get_jwks_client().get_signing_key_from_jwt(token)
        return pyjwt.decode(
            token,
            key.key,
            algorithms=["RS256"],
            issuer=settings.clerk_issuer or None,
            options={"verify_aud": False},
        )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def upsert_user(db: AsyncSession, claims: dict) -> User:
    clerk_id = claims.get("sub", "")
    result = await db.execute(select(User).where(User.clerk_id == clerk_id))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(
            clerk_id=clerk_id,
            email=claims.get("email"),
            name=claims.get("name") or claims.get("username"),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    elif claims.get("email") and not user.email:
        user.email = claims["email"]
        await db.commit()
    return user


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    claims = verify_clerk_token(credentials.credentials)
    return await upsert_user(db, claims)
