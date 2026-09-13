# BaseMind MCP server

Exposes the BaseMind REST API as MCP tools so AI agents (opencode, Claude Code,
Cursor, Claude Desktop) can drive your BaseMind workspace: create agents, manage
knowledge, run conversations, and check diagnostics.

## What it exposes

| Tool | What it does |
|---|---|
| `health` | API health (public) |
| `dashboard` | Global metrics, activity, 7-day trend, vector DB stats |
| `settings_status` | DB + storage connectivity |
| `list_agents` / `get_agent` / `create_agent` | Agent lifecycle + metrics |
| `set_agent_status` / `delete_agent` | Pause/activate; delete |
| `list_documents` / `sync_url` / `upload_document` / `delete_document` | Knowledge base |
| `list_conversations` / `new_conversation` / `get_conversation` | Conversation threads |
| `ask` | Send a question, get the answer + cited sources (auto-creates a thread) |
| `resolve_conversation` / `halt_conversation` / `delete_conversation` | Conversation control |

## Requirements

- Python 3.11+. Install the SDK (kept out of the backend's own deps):

  ```bash
  pip install -r mcp/requirements.txt
  ```

## Environment

| var | value |
|---|---|
| `BASE_MIND_API_URL` | BaseMind API base URL (default `https://basemind-api.onrender.com`) |
| `BASE_MIND_TOKEN` | Bearer token used for authed tools (required for everything except `health`) |

`BASE_MIND_TOKEN` should be a Clerk session JWT (`pk_test_…` is NOT valid —
the API expects RS256-verified tokens from `CLERK_ISSUER`). Grab one from your
logged-in browser session (`localStorage["clerk-db-jwt"]` or the network tab
`Authorization` header) and put it in your MCP host config. Tokens expire, so
refresh them as sessions turn over.

## Run

```bash
# stdio (default — use from an MCP host)
python mcp/basemind_mcp.py

# streamable HTTP (for remote setups)
python mcp/basemind_mcp.py --transport http --port 8765
```

Smoke test (spawns the server over stdio, calls `health`):

```bash
backend/.venv/Scripts/python.exe mcp/smoke_test.py
```

## opencode

Add to `opencode.json` (restart opencode after editing):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "basemind": {
      "type": "local",
      "command": ["backend/.venv/bin/python", "mcp/basemind_mcp.py"],
      "enabled": true,
      "environment": {
        "BASE_MIND_TOKEN": "{env:BASE_MIND_TOKEN}",
        "BASE_MIND_API_URL": "{env:PROD_APP_URL}"
      }
    }
  }
}
```

Windows path for `command`: `["backend/.venv/Scripts/python.exe", "mcp/basemind_mcp.py"]`.
Set `BASE_MIND_TOKEN` in your shell / opencode env so the `{env:…}` interpolation resolves.

## Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "basemind": {
      "command": "backend/.venv/bin/python",
      "args": ["mcp/basemind_mcp.py"],
      "env": { "BASE_MIND_TOKEN": "<token>" }
    }
  }
}
```

## Notes

- The server reads env vars at call time, so you can rotate `BASE_MIND_TOKEN`
  between sessions.
- The FastAPI backend stays untouched — the MCP server is a pure HTTP proxy, so
  it works against local (`http://localhost:8000`) and prod alike via
  `BASE_MIND_API_URL`.
- `ask` streams the chat SSE and returns the full answer, so tool callers never
  see partial tokens.