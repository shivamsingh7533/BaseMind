"""Roundtrip smoke test for the BaseMind MCP server (stdio)."""
import asyncio
import sys
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

MCP_SERVER = sys.executable


async def main() -> None:
    server_path = str(Path(__file__).resolve().parent.parent / "mcp" / "basemind_mcp.py")
    params = StdioServerParameters(command=MCP_SERVER, args=[server_path], env=None)
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            init = await session.initialize()
            print("INIT OK:", init.serverInfo.name, init.serverInfo.version)
            tools = await session.list_tools()
            names = sorted(t.name for t in tools.tools)
            print("TOOLS:", len(names))
            for n in names:
                print("  -", n)
            res = await session.call_tool("health", {})
            out = res.content[0].text if res.content else str(res)
            print("HEALTH:", out)


asyncio.run(main())