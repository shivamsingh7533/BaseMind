"""Retries, circuit breaker, and shared HTTP timeout for external deps."""

import logging
import time

import httpx
from fastapi import HTTPException
from tenacity import AsyncRetrying, before_sleep_log, retry_if_exception, stop_after_attempt, wait_exponential

log = logging.getLogger("basemind.resilience")

# Shared HTTP timeout for all outbound calls (connect 5s, read 30s).
DEFAULT_TIMEOUT = httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0)

# Circuit breaker state per external service.
_CIRCUITS: dict[str, dict] = {}
CIRCUIT_THRESHOLD = 5
CIRCUIT_OPEN_SECONDS = 60


def _circuit(service: str) -> dict:
    if service not in _CIRCUITS:
        _CIRCUITS[service] = {"failures": 0, "opened_at": 0.0}
    return _CIRCUITS[service]


def _check_circuit(service: str) -> None:
    cb = _circuit(service)
    if cb["failures"] >= CIRCUIT_THRESHOLD:
        elapsed = time.time() - cb["opened_at"]
        if elapsed < CIRCUIT_OPEN_SECONDS:
            raise HTTPException(
                status_code=503,
                detail=f"{service} temporarily unavailable — try again in {int(CIRCUIT_OPEN_SECONDS - elapsed)}s",
            )
        cb["failures"] = 0
        cb["opened_at"] = 0.0


def _record_success(service: str) -> None:
    cb = _circuit(service)
    cb["failures"] = 0
    cb["opened_at"] = 0.0


def _record_failure(service: str) -> None:
    cb = _circuit(service)
    cb["failures"] += 1
    if cb["failures"] >= CIRCUIT_THRESHOLD:
        cb["opened_at"] = time.time()
        log.warning("circuit_open service=%s failures=%d", service, cb["failures"])


def _is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, HTTPException):
        # Don't retry auth/config errors; do retry 5xx/429/503
        return exc.status_code >= 500 or exc.status_code == 429
    return True


def retrying(service: str, attempts: int = 3):
    return AsyncRetrying(
        stop=stop_after_attempt(attempts),
        wait=wait_exponential(multiplier=2, min=2, max=30),
        retry=retry_if_exception(_is_retryable),
        before_sleep=before_sleep_log(log, logging.WARNING),
        reraise=True,
    )
