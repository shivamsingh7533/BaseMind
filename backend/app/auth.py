import jwt as pyjwt
import structlog
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .db import get_db
from .email import dispatch_welcome
from .models import Subscription, User

log = structlog.get_logger("basemind.auth")
_bearer = HTTPBearer(auto_error=False)
_jwks_client: pyjwt.PyJWKClient | None = None


def _get_jwks_client() -> pyjwt.PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        settings = get_settings()
        raw_url = (settings.clerk_jwks_url or "").strip()
        if not raw_url and settings.clerk_issuer:
            raw_url = f"{settings.clerk_issuer.strip().rstrip('/')}/.well-known/jwks.json"
        elif raw_url and not raw_url.endswith("/jwks.json"):
            raw_url = f"{raw_url.rstrip('/')}/.well-known/jwks.json"

        if not raw_url:
            raise HTTPException(
                status_code=503,
                detail="Auth not configured. Set CLERK_JWKS_URL or CLERK_ISSUER.",
            )
        _jwks_client = pyjwt.PyJWKClient(raw_url, cache_keys=True)
    return _jwks_client


def verify_clerk_token(token: str) -> dict:
    settings = get_settings()
    try:
        key = _get_jwks_client().get_signing_key_from_jwt(token)
    except Exception as exc:
        raise HTTPException(
            status_code=401,
            detail=f"Cannot fetch signing key from CLERK_JWKS_URL: {exc}",
        ) from None
    try:
        exp_iss = settings.clerk_issuer.strip().rstrip("/") if settings.clerk_issuer else None
        valid_issuers = [exp_iss, f"{exp_iss}/"] if exp_iss else None
        return pyjwt.decode(
            token,
            key.key,
            algorithms=["RS256"],
            issuer=valid_issuers,
            leeway=60,
            options={"verify_aud": False},
        )
    except pyjwt.InvalidIssuerError:
        actual = ""
        try:
            unverified = pyjwt.decode(token, options={"verify_signature": False})
            actual = unverified.get("iss", "")
        except Exception:
            pass
        raise HTTPException(
            status_code=401,
            detail=(
                "Issuer mismatch: token iss="
                f"'{actual}' but CLERK_ISSUER='{settings.clerk_issuer or '(not set)'}'. "
                "Fix the env var to match your Clerk instance."
            ),
        ) from None
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired — refresh the page") from None
    except pyjwt.ImmatureSignatureError:
        raise HTTPException(status_code=401, detail="Token not yet valid — refresh the page") from None
    except pyjwt.InvalidSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Signature invalid — token is from a different Clerk instance than CLERK_JWKS_URL",
        ) from None
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}") from None


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
        db.add(Subscription(user_id=user.id, plan="free", status="active"))
        await db.commit()
        await dispatch_welcome(user)
    elif claims.get("email") and not user.email:
        user.email = claims["email"]
        await db.commit()
    return user


def _set_sentry_user(user: "User | None", claims: dict | None = None) -> None:
    try:
        from .config import get_settings as _gs  # local import to avoid cycle

        if not _gs().sentry_dsn:
            return
        import sentry_sdk  # noqa: E402

        if user is not None:
            sentry_sdk.set_user(
                {
                    "id": user.id,
                    "email": getattr(user, "email", None),
                    "username": getattr(user, "clerk_id", None),
                }
            )
            sentry_sdk.set_tag("clerk_id", getattr(user, "clerk_id", "") or "")
        elif claims is not None:
            sentry_sdk.set_user({"id": claims.get("sub", ""), "email": claims.get("email")})
    except Exception:
        pass

async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        log.warning("auth_missing_bearer_token", path=request.url.path)
        raise HTTPException(status_code=401, detail="Missing bearer token")
    try:
        claims = verify_clerk_token(credentials.credentials)
    except HTTPException as exc:
        log.warning("auth_token_rejected", path=request.url.path, detail=exc.detail)
        raise
    user = await upsert_user(db, claims)

    email_hdr = request.headers.get("x-user-email")
    name_hdr = request.headers.get("x-user-name")
    updated = False
    if email_hdr and email_hdr.strip() and user.email != email_hdr.strip().lower():
        user.email = email_hdr.strip().lower()
        updated = True
    if name_hdr and name_hdr.strip() and not user.name:
        user.name = name_hdr.strip()
        updated = True
    if updated:
        await db.commit()

    _set_sentry_user(user, claims)
    try:
        import sentry_sdk  # noqa: E402

        sentry_sdk.set_tag("user_id", user.id)
        sentry_sdk.add_breadcrumb(
            category="auth",
            message="authenticated",
            level="info",
            data={"clerk_id": claims.get("sub", ""), "user_id": user.id},
        )
    except Exception:
        pass
    return user
