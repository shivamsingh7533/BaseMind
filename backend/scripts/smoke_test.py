"""Post-deploy smoke test: verifies health, metrics, and basic API contract.

Run after Render/Vercel deploy:
    python scripts/smoke_test.py --base-url https://your-api.onrender.com

Exits 0 on success, 1 on failure. Suitable for Render Pre-Deploy or GitHub Actions.
"""

import argparse
import sys

import httpx

TIMEOUT = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0)


def check(url: str, label: str, predicate) -> bool:
    try:
        r = httpx.get(url, timeout=TIMEOUT, follow_redirects=True)
    except Exception as exc:
        print(f"FAIL {label}: request error {exc}")
        return False
    if not predicate(r):
        body = r.text[:300].replace("\n", " ")
        print(f"FAIL {label}: {r.status_code} body={body!r}")
        return False
    print(f"PASS {label}: {r.status_code}")
    return True


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--base-url", default="http://localhost:8000", help="API base URL")
    args = p.parse_args()
    base = args.base_url.rstrip("/")

    ok = True
    ok &= check(
        f"{base}/api/health",
        "health -> status ok",
        lambda r: r.status_code == 200 and r.json().get("status") in ("ok", "degraded"),
    )
    # latency budget
    try:
        r = httpx.get(f"{base}/api/health", timeout=TIMEOUT)
        latency = r.json().get("checks", {}).get("db", {}).get("latency_ms")
        if isinstance(latency, (int, float)) and latency > 2000:
            print(f"WARN health latency high: {latency}ms")
    except Exception:
        pass
    ok &= check(f"{base}/metrics", "metrics exposed", lambda r: r.status_code == 200 and "http_requests_total" in r.text)
    ok &= check(f"{base}/docs", "openapi docs", lambda r: r.status_code == 200)
    # settings/status requires auth -> expect 401
    ok &= check(
        f"{base}/api/settings/status",
        "settings/status requires auth (401)",
        lambda r: r.status_code in (401, 403),
    )

    if ok:
        print("smoke_test: all checks passed")
        return 0
    print("smoke_test: some checks failed")
    return 1


if __name__ == "__main__":
    sys.exit(main())
