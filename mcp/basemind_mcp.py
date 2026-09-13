"""BaseMind MCP server.

Exposes the BaseMind REST API as MCP tools so AI agents can list/create agents,
manage knowledge, run conversations, and get diagnostics.

Environment:
    BASE_MIND_API_URL   BaseMind API base URL (default: https://basemind-api.onrender.com)
    BASE_MIND_TOKEN     Clerk session token / long-lived token used as the Bearer token

Run:
    python basemind_mcp.py                 # stdio (default — use with opencode/Claude/Cursor)
    python basemind_mcp.py --transport http --port 8765   # streamable HTTP
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import httpx
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("basemind")

_DEFAULT_API_URL = "https://basemind-api.onrender.com"


def _api_url() -> str:
    return (os.getenv("BASE_MIND_API_URL") or _DEFAULT_API_URL).rstrip("/")


def _token() -> str:
    return os.getenv("BASE_MIND_TOKEN", "")


def _headers() -> dict:
    headers = {"Accept": "application/json"}
    if _token():
        headers["Authorization"] = f"Bearer {_token()}"
    return headers


def _require_token() -> None:
    if not _token():
        raise RuntimeError(
            "No BASE_MIND_TOKEN set. BaseMind API expects a Bearer token; set "
            "BASE_MIND_TOKEN to a Clerk session token or service token."
        )


def _error_detail(resp: httpx.Response) -> str:
    try:
        import json as _json

        detail = _json.loads(resp.text).get("detail")
        if detail:
            return str(detail)
    except Exception:
        pass
    return resp.text[:500]


async def _request(method: str, path: str, **kwargs) -> object:
    url = f"{_api_url()}{path}"
    kwargs.setdefault("headers", _headers())
    timeout = kwargs.pop("timeout", 60.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.request(method, url, **kwargs)
    if resp.status_code >= 400:
        raise RuntimeError(f"HTTP {resp.status_code}: {_error_detail(resp)}")
    if resp.status_code == 204 or not resp.content:
        return {"deleted": True} if method.upper() == "DELETE" else {}
    try:
        return resp.json()
    except Exception:
        return {"text": resp.text}


async def _ask(conversation_id: str, question: str) -> dict:
    _require_token()
    async with httpx.AsyncClient(timeout=180.0) as client:
        resp = await client.post(
            f"{_api_url()}/api/conversations/{conversation_id}/chat",
            headers=_headers(),
            json={"role": "user", "text": question},
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"HTTP {resp.status_code}: {_error_detail(resp)}")
        answer_parts: list[str] = []
        sources: list[dict] = []
        message_id = None
        async for line in resp.aiter_lines():
            if not line.startswith("data: "):
                continue
            try:
                event = json.loads(line[len("data: "):])
            except Exception:
                continue
            etype = event.get("type")
            if etype == "token":
                answer_parts.append(event.get("token", ""))
            elif etype == "sources":
                sources = event.get("sources", [])
            elif etype == "error":
                raise RuntimeError(event.get("error", "streaming error"))
            elif etype == "done":
                message_id = event.get("messageId")
    return {
        "answer": "".join(answer_parts),
        "sources": sources,
        "messageId": message_id,
        "conversationId": conversation_id,
    }


@mcp.tool()
async def health() -> dict:
    """Check BaseMind API health (public)."""
    return await _request("GET", "/api/health")


@mcp.tool()
async def dashboard() -> dict:
    """Global dashboard metrics: stats, recent activity, per-agent metrics, 7-day trend, vector DB."""
    _require_token()
    return await _request("GET", "/api/dashboard")


@mcp.tool()
async def settings_status() -> dict:
    """Service status: database and storage connectivity."""
    _require_token()
    return await _request("GET", "/api/settings/status")


@mcp.tool()
async def list_agents() -> dict:
    """List your agents with instructions, status, 24h query counts, latency."""
    _require_token()
    return await _request("GET", "/api/agents")


@mcp.tool()
async def create_agent(
    name: str,
    instructions: str = "",
    color: str = "#0d9488",
) -> dict:
    """Create an agent with a name, optional instructions, and a hex color."""
    _require_token()
    return await _request(
        "POST",
        "/api/agents",
        json={"name": name, "instructions": instructions, "color": color},
    )


@mcp.tool()
async def get_agent(agent_id: str) -> dict:
    """Fetch a single agent by id."""
    _require_token()
    agents = await _request("GET", "/api/agents")
    items = agents if isinstance(agents, list) else agents.get("agents", [])
    for agent in items:
        if agent.get("id") == agent_id:
            return agent
    raise RuntimeError(f"Agent {agent_id} not found")


@mcp.tool()
async def set_agent_status(agent_id: str, status: str) -> dict:
    """Set agent status: 'active', 'paused', or 'training'."""
    _require_token()
    return await _request(
        "PATCH", f"/api/agents/{agent_id}", json={"status": status}
    )


@mcp.tool()
async def delete_agent(agent_id: str) -> dict:
    """Delete an agent irreversibly."""
    _require_token()
    return await _request("DELETE", f"/api/agents/{agent_id}")


@mcp.tool()
async def list_documents() -> dict:
    """List your knowledge-base documents."""
    _require_token()
    return await _request("GET", "/api/documents")


@mcp.tool()
async def sync_url(url: str, agent_id: str | None = None) -> dict:
    """Crawl a URL into the knowledge base (optionally scoped to an agent)."""
    _require_token()
    return await _request(
        "POST",
        "/api/documents/sync",
        json={"url": url, "agent_id": agent_id},
    )


@mcp.tool()
async def upload_document(local_path: str, agent_id: str | None = None) -> dict:
    """Upload a PDF/text file from local_path into the knowledge base."""
    _require_token()
    path = Path(local_path).expanduser()
    if not path.is_file():
        raise RuntimeError(f"File not found: {local_path}")
    data = {"agent_id": agent_id} if agent_id else {}
    files = {"file": (path.name, path.read_bytes(), "application/octet-stream")}
    return await _request("POST", "/api/documents/upload", data=data, files=files)


@mcp.tool()
async def delete_document(document_id: str) -> dict:
    """Delete a document irreversibly."""
    _require_token()
    return await _request("DELETE", f"/api/documents/{document_id}")


@mcp.tool()
async def list_conversations() -> dict:
    """List your conversations (newest first)."""
    _require_token()
    return await _request("GET", "/api/conversations")


@mcp.tool()
async def new_conversation(agent_id: str | None = None, visitor: str = "Agent") -> dict:
    """Start a new conversation, optionally pinned to an agent."""
    _require_token()
    return await _request(
        "POST",
        "/api/conversations",
        json={"visitor": visitor, "agent_id": agent_id},
    )


@mcp.tool()
async def get_conversation(conversation_id: str) -> dict:
    """Get a conversation with its full message history."""
    _require_token()
    return await _request("GET", f"/api/conversations/{conversation_id}")


@mcp.tool()
async def ask(
    question: str,
    conversation_id: str | None = None,
    agent_id: str | None = None,
) -> dict:
    """Ask BaseMind a question. Creates a conversation if conversation_id is omitted.

    Returns the answer, cited sources, and the conversation id to continue the thread.
    """
    if not conversation_id:
        conv = await _request(
            "POST",
            "/api/conversations",
            json={"visitor": "Agent", "agent_id": agent_id},
        )
        conversation_id = conv["id"]
    return await _ask(conversation_id, question)


@mcp.tool()
async def resolve_conversation(conversation_id: str) -> dict:
    """Mark a conversation as resolved."""
    _require_token()
    return await _request(
        "PATCH",
        f"/api/conversations/{conversation_id}",
        json={"status": "resolved"},
    )


@mcp.tool()
async def halt_conversation(conversation_id: str) -> dict:
    """Halt a conversation (stop-agent cross-flow, frees the busy state)."""
    _require_token()
    return await _request(
        "PATCH",
        f"/api/conversations/{conversation_id}",
        json={"status": "halted"},
    )


@mcp.tool()
async def delete_conversation(conversation_id: str) -> dict:
    """Delete a conversation and its message thread."""
    _require_token()
    return await _request("DELETE", f"/api/conversations/{conversation_id}")


def main() -> None:
    parser = argparse.ArgumentParser(description="BaseMind MCP server")
    parser.add_argument(
        "--transport", choices=["stdio", "http"], default="stdio"
    )
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if args.transport == "http":
        mcp.run(transport="http", host="127.0.0.1", port=args.port)
    else:
        mcp.run(transport="stdio")


if __name__ == "__main__":
    main()