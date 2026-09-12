#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const MCP = "https://stitch.googleapis.com/mcp";
const KEY = process.env.STITCH_API_KEY;
const PROJECT = "351180364097533961";
const ROOT = process.cwd();

if (!KEY) {
  console.error("STITCH_API_KEY env var required");
  process.exit(1);
}

const SCREENS = [
  ["5ea7f7386fd842309f36092d413f8f33", "landing"],
  ["74beb68dead2472db24ddf240a8f423a", "agent-management"],
  ["7c8aa8d06df046cba750e93899b9211c", "knowledge-base"],
  ["8ae7e6fd07284cdb86596a7fe9d501d8", "welcome"],
  ["d2c9679a9da0463ba890c27d891750fa", "conversation-logs"],
  ["e8a8f72457e04b0aaa287b8a1d63daf3", "dashboard"],
  ["abd9a93886c44f4e98edfad3365c400c", "assets/headshot"],
  ["d6700fe671924823bf8f02b06c53bc13", "assets/logo"],
];

let id = 100;

async function mcpCall(name, args) {
  const res = await fetch(MCP, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "X-Goog-Api-Key": KEY,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++id,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const raw = await res.text();
  const parsed = JSON.parse(raw);
  const content = parsed.result?.content;
  const text = content?.find((c) => c.type === "text")?.text;
  if (parsed.result?.isError || !text) {
    throw new Error(`MCP error ${name}: ${raw.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

async function download(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.slice(0, 120)}`);
  return Buffer.from(await res.arrayBuffer());
}

const ASSET_RE = /https?:\/\/[^"')\s]+?\.(?:png|jpe?g|webp|svg|css)(?:\?[^"')\s]*)?/gi;

async function grabScreen(screenId, dir) {
  const dirPath = path.join(ROOT, dir);
  const assetsDir = path.join(dirPath, "assets");
  await fs.mkdir(assetsDir, { recursive: true });

  const data = await mcpCall("get_screen", {
    projectId: PROJECT,
    screenId,
    name: `projects/${PROJECT}/screens/${screenId}`,
  });

  let html = "";
  if (data.htmlCode?.downloadUrl) {
    html = (await download(data.htmlCode.downloadUrl)).toString("utf8");
  }

  const urls = [...new Set(html.match(ASSET_RE) ?? [])];
  await Promise.all(
    urls.map(async (url) => {
      try {
        const buf = await download(url);
        const clean = url.split("?")[0];
        const ext = path.extname(clean).toLowerCase() || ".bin";
        const base = path.basename(clean, ext).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60) || "asset";
        const hash = crypto.createHash("md5").update(url).digest("hex").slice(0, 10);
        const file = `${base}-${hash}${ext}`;
        await fs.writeFile(path.join(assetsDir, file), buf);
        html = html.split(url).join(`assets/${file}`);
      } catch (_) {
        /* keep original url on failure */
      }
    }),
  );

  const results = { html: false, png: false };
  if (data.htmlCode?.downloadUrl || html) {
    await fs.writeFile(path.join(dirPath, "code.html"), html);
    results.html = true;
  }
  if (data.screenshot?.downloadUrl) {
    const png = await download(data.screenshot.downloadUrl);
    await fs.writeFile(path.join(dirPath, "screen.png"), png);
    results.png = true;
  }
  return results;
}

const summary = [];
for (const [sid, dir] of SCREENS) {
  try {
    const r = await grabScreen(sid, dir);
    summary.push([dir, r.html ? "code.html" : "-", r.png ? "screen.png" : "-", "OK"]);
  } catch (e) {
    summary.push([dir, "-", "-", `FAIL: ${e.message.slice(0, 80)}`]);
  }
}

try {
  const ds = await mcpCall("list_design_systems", { projectId: PROJECT });
  const theme = ds.designSystems?.[0]?.designSystem?.theme;
  if (theme?.designMd) {
    await fs.writeFile(path.join(ROOT, "DESIGN.md"), theme.designMd);
    summary.push(["DESIGN.md", "", "", "OK"]);
  } else {
    summary.push(["DESIGN.md", "", "", "no designMd found"]);
  }
} catch (e) {
  summary.push(["DESIGN.md", "", "", "FAIL: " + e.message.slice(0, 80)]);
}

for (const row of summary) console.log(row.join("\t"));