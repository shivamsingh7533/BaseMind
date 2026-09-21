"""BaseMind Multi-Page Spider & Continuous Ingestion Crawler.

Extracts clean textual content from websites and documentation sites by traversing
internal same-domain links safely with SSRF protection, loop prevention, and content hashing.
"""

from __future__ import annotations

import hashlib
import ipaddress
import logging
import socket
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urldefrag, urljoin, urlparse

import httpx

from .ai import extract_html, page_title

logger = logging.getLogger("basemind.crawler")

# Disallowed binary and non-HTML extensions
IGNORED_EXTENSIONS = {
    ".pdf", ".zip", ".tar", ".gz", ".exe", ".bin",
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico",
    ".mp3", ".mp4", ".wav", ".avi", ".mov",
    ".css", ".js", ".json", ".xml", ".rss", ".atom",
}


def _is_safe_url(url: str) -> bool:
    """Validate that the target URL is a public, valid http/https address (SSRF guard)."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        hostname = parsed.hostname
        if not hostname:
            return False

        # Block localhost and non-routable domains
        if hostname.lower() in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):  # noqa: S104
            return False

        # Resolve IP and verify it's global
        resolved_ips = socket.getaddrinfo(hostname, None)
        for _, _, _, _, sockaddr in resolved_ips:
            ip_str = sockaddr[0]
            ip_obj = ipaddress.ip_address(ip_str)
            if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_reserved or ip_obj.is_link_local:
                return False
        return True
    except Exception:
        return False


class LinkExtractor(HTMLParser):
    """HTML parser that collects valid, normalized links from <a> tags."""

    def __init__(self, base_url: str) -> None:
        super().__init__()
        self.base_url = base_url
        self.links: set[str] = set()
        self.base_host = urlparse(base_url).hostname or ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        for attr, val in attrs:
            if attr.lower() == "href" and val:
                href = val.strip()
                # Exclude javascript:, mailto:, tel:
                if href.startswith(("javascript:", "mailto:", "tel:", "#")):
                    continue
                # Resolve full URL
                absolute_url = urljoin(self.base_url, href)
                clean_url, _ = urldefrag(absolute_url)

                parsed = urlparse(clean_url)
                if parsed.scheme not in ("http", "https"):
                    continue
                if parsed.hostname != self.base_host:
                    continue

                # Exclude binary media extensions
                path_lower = parsed.path.lower()
                if any(path_lower.endswith(ext) for ext in IGNORED_EXTENSIONS):
                    continue

                # Strip trailing slash for consistency
                if clean_url.endswith("/") and len(clean_url) > 10:
                    clean_url = clean_url[:-1]

                self.links.add(clean_url)


async def crawl_domain(
    start_url: str,
    max_depth: int = 1,
    max_pages: int = 10,
    timeout: float = 12.0,
) -> list[dict[str, Any]]:
    """Traverse same-domain pages up to max_depth and max_pages safely."""
    clean_start, _ = urldefrag(start_url.strip())
    if not _is_safe_url(clean_start):
        logger.warning(f"Unsafe URL rejected by crawler SSRF guard: {clean_start}")
        return []

    visited: set[str] = set()
    queue: list[tuple[str, int]] = [(clean_start, 0)]
    results: list[dict[str, Any]] = []

    headers = {
        "User-Agent": "BaseMind-Crawler/2.0 (+https://base-mind.vercel.app)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
    }

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=headers) as client:
        while queue and len(results) < max_pages:
            current_url, depth = queue.pop(0)
            if current_url in visited:
                continue
            visited.add(current_url)

            if not _is_safe_url(current_url):
                continue

            try:
                resp = await client.get(current_url)
                if resp.status_code != 200:
                    continue

                content_type = resp.headers.get("content-type", "").lower()
                if "text/html" not in content_type and "application/xhtml" not in content_type:
                    continue

                html = resp.text
                text = extract_html(html)
                if not text or len(text.strip()) < 50:
                    continue

                title = page_title(html) or urlparse(current_url).path or current_url
                content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()

                results.append({
                    "url": current_url,
                    "title": title.strip()[:200],
                    "text": text.strip(),
                    "hash": content_hash,
                    "depth": depth,
                })

                # If we haven't reached max depth, find child links
                if depth < max_depth and len(visited) < max_pages:
                    extractor = LinkExtractor(current_url)
                    try:
                        extractor.feed(html)
                        for link in sorted(extractor.links):
                            if link not in visited and not any(q[0] == link for q in queue):
                                queue.append((link, depth + 1))
                                if len(queue) + len(results) >= max_pages * 2:
                                    break
                    except Exception:
                        pass

            except Exception as e:
                logger.debug(f"Crawler failed fetching {current_url}: {e}")
                continue

    return results
