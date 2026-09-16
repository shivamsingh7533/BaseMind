import logging
import os
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import init_db
from .routers import router

log = logging.getLogger("basemind.http")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

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
    log.info("Sentry enabled release=%s env=%s", _release, _env)


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
            "%s %s -> %d (%.0fms) [rid=%s]",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
            request_id,
        )
    if _sentry_dsn:
        try:
            import sentry_sdk  # noqa: E402

            sentry_sdk.set_tag("status_code", str(response.status_code))
        except Exception:
            pass
    return response


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "basemind-api"}
