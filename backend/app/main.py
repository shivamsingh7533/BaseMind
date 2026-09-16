import logging
import os
import sys
import time
import uuid
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from .config import get_settings
from .db import engine, init_db
from .routers import router

_use_json = bool(os.getenv("JSON_LOGS") or os.getenv("ENVIRONMENT") == "production")
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer() if _use_json else structlog.dev.ConsoleRenderer(colors=False),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.NOTSET),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
    cache_logger_on_first_use=True,
)
logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)
log = structlog.get_logger("basemind.http")

_sentry_dsn = get_settings().sentry_dsn
if _sentry_dsn:
    import sentry_sdk  # noqa: E402

    _release = (
        os.getenv("RENDER_GIT_COMMIT")
        or os.getenv("VERCEL_GIT_COMMIT_SHA")
        or os.getenv("GIT_COMMIT")
        or os.getenv("APP_VERSION")
        or None
    )
    _env = os.getenv("SENTRY_ENVIRONMENT") or os.getenv("ENVIRONMENT") or "production"
    sentry_sdk.init(
        dsn=_sentry_dsn,
        release=_release,
        environment=_env,
        traces_sample_rate=0.1,
        profiles_sample_rate=0.05,
        send_default_pii=True,
    )
    log.info("sentry_enabled", release=_release, env=_env)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="BaseMind API",
    version="0.2.0",
    description="Backend for the BaseMind AI SaaS platform.",
    lifespan=lifespan,
)

_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
_extra = get_settings().allowed_origins
if _extra:
    _origins.extend(o.strip() for o in _extra.split(",") if o.strip())

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

Instrumentator(
    should_group_status_codes=False,
    should_ignore_untemplated=True,
    excluded_handlers=["/metrics"],
).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    request.state.request_id = request_id
    if _sentry_dsn:
        try:
            import sentry_sdk  # noqa: E402

            sentry_sdk.set_tag("request_id", request_id)
            sentry_sdk.set_tag("route", request.url.path)
            sentry_sdk.set_tag("method", request.method)
            sentry_sdk.add_breadcrumb(
                category="http",
                message=f"{request.method} {request.url.path}",
                level="info",
                data={"request_id": request_id},
            )
        except Exception:
            pass
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    elapsed_ms = (time.perf_counter() - start) * 1000
    if not request.url.path.startswith("/api/conversations/") or not request.url.path.endswith("/chat"):
        log.info(
            "request",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=round(elapsed_ms, 1),
            request_id=request_id,
        )
    if _sentry_dsn:
        try:
            import sentry_sdk  # noqa: E402

            sentry_sdk.set_tag("status_code", str(response.status_code))
        except Exception:
            pass
    return response


@app.get("/api/health")
async def health(request: Request) -> dict:
    from sqlalchemy import text as _text

    from .storage import is_b2_enabled as _is_b2

    checks: dict = {}
    start = time.perf_counter()
    try:
        if engine is None:
            checks["db"] = {"status": "skipped", "reason": "DATABASE_URL not set"}
        else:
            async with engine.connect() as conn:
                await conn.execute(_text("SELECT 1"))
            checks["db"] = {
                "status": "ok",
                "latency_ms": round((time.perf_counter() - start) * 1000, 1),
            }
    except Exception as exc:  # noqa: BLE001
        checks["db"] = {"status": "error", "error": str(exc)[:200]}

    checks["b2"] = {"enabled": _is_b2()}
    checks["sentry"] = {"enabled": bool(_sentry_dsn)}
    checks["release"] = (
        os.getenv("RENDER_GIT_COMMIT")
        or os.getenv("VERCEL_GIT_COMMIT_SHA")
        or os.getenv("GIT_COMMIT")
        or None
    )
    status = "ok" if checks.get("db", {}).get("status") != "error" else "degraded"
    return {
        "status": status,
        "service": "basemind-api",
        "checks": checks,
        "request_id": getattr(request.state, "request_id", None),
    }
