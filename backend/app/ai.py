import io
import json
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

import httpx
from fastapi import HTTPException

from .config import get_settings
from .models import EMBEDDING_DIM

_client = None

EMBED_MODEL = "gemini-embedding-001"
CHAT_MODEL = "gemini-3.6-flash"

CHUNK_SIZE = 1200
CHUNK_OVERLAP = 150

SYSTEM_PROMPT = (
    "You are BaseMind, a professional customer-support agent for the company "
    "whose knowledge base is provided below. Answer ONLY using the knowledge "
    "base context unless the question is generic small talk. If the answer is "
    "not in the context, say you don't have that information yet and suggest "
    "contacting human support. Keep answers concise, friendly and helpful."
)


def get_ai_client():
    global _client
    if _client is None:
        settings = get_settings()
        if not settings.gemini_api_key:
            raise HTTPException(
                status_code=503,
                detail="AI not configured. Set GEMINI_API_KEY.",
            )
        from google import genai

        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


async def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    from google.genai import types

    from .resilience import _check_circuit, _record_failure, _record_success, retrying

    _check_circuit("gemini")
    client = get_ai_client()
    try:
        async for attempt in retrying("gemini", attempts=3):
            with attempt:
                result = await client.aio.models.embed_content(
                    model=EMBED_MODEL,
                    contents=texts,
                    config=types.EmbedContentConfig(output_dimensionality=EMBEDDING_DIM),
                )
                _record_success("gemini")
                return [item.values for item in result.embeddings]
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        _record_failure("gemini")
        raise HTTPException(status_code=502, detail=f"Embedding failed: {exc}") from exc
    return []


def chunk_text(text: str) -> list[str]:
    cleaned = " ".join(text.split())
    if not cleaned:
        return []
    chunks: list[str] = []
    start = 0
    length = len(cleaned)
    while start < length:
        end = min(start + CHUNK_SIZE, length)
        if end < length:
            period = cleaned.rfind(". ", start + CHUNK_SIZE // 2, end)
            if period > start:
                end = period + 1
        chunks.append(cleaned[start:end].strip())
        if end >= length:
            break
        start = end - CHUNK_OVERLAP
    return [c for c in chunks if c]


def extract_text(filename: str, raw: bytes) -> str:
    lower = filename.lower()
    if lower.endswith(".pdf"):
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(raw))
        pages = []
        for page in reader.pages:
            extracted = page.extract_text() or ""
            pages.append(extracted)
        return "\n".join(pages)
    return raw.decode("utf-8", errors="ignore")


IGNORED_TAGS = {"script", "style", "noscript", "svg", "head", "iframe"}
BLOCK_TAGS = {
    "p",
    "div",
    "br",
    "li",
    "tr",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "section",
    "article",
    "header",
    "footer",
    "nav",
    "blockquote",
}


def page_title(html: str) -> str:
    lower = html.lower()
    start = lower.find("<title")
    if start == -1:
        return ""
    start = lower.find(">", start) + 1
    end = lower.find("</title>", start)
    if start == 0 or end == -1:
        return ""
    return " ".join(html[start:end].split())[:200]


def extract_html(raw: str) -> str:
    from html.parser import HTMLParser

    class _Text(HTMLParser):
        def __init__(self):
            super().__init__()
            self.parts: list[str] = []
            self._skip = 0

        def handle_starttag(self, tag, attrs):
            if tag in IGNORED_TAGS:
                self._skip += 1
            elif tag in BLOCK_TAGS and self.parts:
                self.parts.append("\n")

        def handle_endtag(self, tag):
            if tag in IGNORED_TAGS and self._skip:
                self._skip -= 1

        def handle_data(self, data):
            if not self._skip and data.strip():
                self.parts.append(data.strip())

    parser = _Text()
    parser.feed(raw)
    return "\n".join(parser.parts)


def build_gemini_tools(actions: list[Any] | None):
    if not actions:
        return None
    from google.genai import types

    declarations = []
    for action in actions:
        if not getattr(action, "enabled", True):
            continue

        props = {}
        reqs = []
        if getattr(action, "parameters_schema_json", None):
            try:
                params_list = json.loads(action.parameters_schema_json)
                if isinstance(params_list, list):
                    for p in params_list:
                        p_name = p.get("name")
                        if not p_name:
                            continue
                        p_type_str = str(p.get("type", "string")).lower()
                        p_type = types.Type.STRING
                        if p_type_str == "integer":
                            p_type = types.Type.INTEGER
                        elif p_type_str == "number":
                            p_type = types.Type.NUMBER
                        elif p_type_str == "boolean":
                            p_type = types.Type.BOOLEAN

                        props[p_name] = types.Schema(
                            type=p_type,
                            description=p.get("description", ""),
                        )
                        if p.get("required", True):
                            reqs.append(p_name)
            except Exception:
                pass

        declarations.append(
            types.FunctionDeclaration(
                name=action.name,
                description=action.description,
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties=props,
                    required=reqs,
                ),
            )
        )
    if not declarations:
        return None
    return [types.Tool(function_declarations=declarations)]


async def execute_action_webhook(action: Any, args: dict[str, Any]) -> dict[str, Any]:
    headers = {"User-Agent": "BaseMind-AI-Agent/2.0"}
    if getattr(action, "headers_json", None):
        try:
            extra = json.loads(action.headers_json)
            if isinstance(extra, dict):
                headers.update({str(k): str(v) for k, v in extra.items()})
        except Exception:
            pass

    target_url = action.webhook_url
    params = dict(args or {})

    # Replace URL path placeholders if any (e.g. {order_id})
    for k, v in list(params.items()):
        placeholder = f"{{{k}}}"
        if placeholder in target_url:
            target_url = target_url.replace(placeholder, str(v))
            params.pop(k, None)

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            method = action.method.upper()
            if method == "GET":
                resp = await client.get(target_url, params=params, headers=headers)
            elif method == "POST":
                resp = await client.post(target_url, json=params, headers=headers)
            elif method == "PUT":
                resp = await client.put(target_url, json=params, headers=headers)
            elif method == "DELETE":
                resp = await client.delete(target_url, params=params, headers=headers)
            else:
                resp = await client.post(target_url, json=params, headers=headers)

            try:
                data = resp.json()
            except Exception:
                data = resp.text[:1000]

            return {
                "status_code": resp.status_code,
                "data": data,
            }
    except Exception as exc:
        return {
            "status_code": 500,
            "error": str(exc),
        }


async def stream_answer(
    question: str,
    contexts: list[dict],
    history: list[dict],
    extra_instructions: str = "",
    actions: list[Any] | None = None,
    on_action_call: Callable[[str, dict, dict], Awaitable[None]] | None = None,
) -> AsyncIterator[str]:
    from google.genai import types

    from .resilience import _check_circuit, _record_failure, _record_success, retrying

    _check_circuit("gemini")
    client = get_ai_client()
    system_prompt = SYSTEM_PROMPT
    if extra_instructions.strip():
        system_prompt += (
            "\n\nThe operator of this agent added these specific "
            f"instructions — follow them closely:\n{extra_instructions.strip()}"
        )

    context_block = (
        "\n\n".join(f"[Source: {c['source']}, chunk {c['index']}]\n{c['content']}" for c in contexts)
        if contexts
        else "(knowledge base is empty)"
    )
    sanitized_history: list[dict] = []
    last_role = None
    for m in history:
        role = "model" if m.get("role") in ("agent", "model") else "user"
        content = (m.get("content") or "").strip()
        if not content:
            continue
        if role == last_role and sanitized_history:
            sanitized_history[-1]["parts"][0]["text"] += f"\n\n{content}"
        else:
            sanitized_history.append({"role": role, "parts": [{"text": content}]})
            last_role = role

    if sanitized_history and sanitized_history[-1]["role"] == "user":
        sanitized_history.pop()

    contents = [
        *sanitized_history,
        {
            "role": "user",
            "parts": [{"text": f"Knowledge base context:\n{context_block}\n\nCustomer question: {question}"}],
        },
    ]

    tools = build_gemini_tools(actions)
    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        tools=tools,
    )

    # Check for Function Calling if tools are defined
    if tools:
        try:
            initial_resp = await client.aio.models.generate_content(
                model=CHAT_MODEL, contents=contents, config=config
            )
            if initial_resp.function_calls:
                # Add model candidate with the function call to turn history
                contents.append(initial_resp.candidates[0].content)
                for call in initial_resp.function_calls:
                    matched_action = next((a for a in (actions or []) if a.name == call.name), None)
                    if matched_action:
                        call_args = dict(call.args) if call.args else {}
                        action_res = await execute_action_webhook(matched_action, call_args)
                        if on_action_call:
                            await on_action_call(call.name, call_args, action_res)
                        contents.append(
                            {
                                "role": "user",
                                "parts": [
                                    types.Part.from_function_response(
                                        name=call.name,
                                        response={"result": action_res},
                                    )
                                ],
                            }
                        )
        except Exception:
            pass

    try:
        async for attempt in retrying("gemini", attempts=5):
            with attempt:
                async for chunk in await client.aio.models.generate_content_stream(
                    model=CHAT_MODEL, contents=contents, config=config
                ):
                    if chunk.text:
                        yield chunk.text
                _record_success("gemini")
                break
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        _record_failure("gemini")
        raise HTTPException(status_code=502, detail=f"Chat stream failed: {exc}") from exc


async def generate_conversation_summary(messages: list[dict]) -> dict[str, Any]:
    from google.genai import types

    client = get_ai_client()
    transcript = "\n".join(f"{m.get('role', 'user')}: {m.get('content', '')}" for m in messages[-20:])
    prompt = (
        "You are an AI Support Supervisor. Summarize the following customer conversation in exactly 2 clear, "
        "actionable sentences. Identify the customer's core intent or issue, their sentiment (positive, neutral, or negative), "
        "and any specific entities mentioned (order numbers, account IDs, names, product names).\n\n"
        f"Conversation Transcript:\n{transcript}\n\n"
        "Return JSON only with keys: 'summary' (string), 'sentiment' (one of: positive, neutral, negative), and 'key_details' (list of strings)."
    )
    from .resilience import retrying

    config = types.GenerateContentConfig(response_mime_type="application/json")
    try:
        async for attempt in retrying("gemini", attempts=4):
            with attempt:
                resp = await client.aio.models.generate_content(model=CHAT_MODEL, contents=prompt, config=config)
                break
        return json.loads(resp.text)
    except Exception:
        last_msg = messages[-1].get("content", "") if messages else "Inquiry"
        return {
            "summary": f"Visitor is inquiring about: {last_msg[:120]}.",
            "sentiment": "neutral",
            "key_details": [],
        }


async def generate_copilot_suggestions(
    messages: list[dict], contexts: list[dict], tone: str = "friendly"
) -> list[str]:
    from google.genai import types

    from .resilience import retrying

    client = get_ai_client()
    transcript = "\n".join(f"{m.get('role', 'user')}: {m.get('content', '')}" for m in messages[-8:])
    context_block = "\n\n".join(c.get("content", "") for c in contexts[:3])
    prompt = (
        f"You are an AI Co-Pilot assisting a human customer support operator. "
        f"The operator wants to reply to the visitor in a {tone} tone. "
        f"Based on the conversation transcript and the relevant knowledge base context below, "
        f"generate 3 distinct, complete, and professional suggested draft replies the operator can send immediately.\n\n"
        f"Relevant Context:\n{context_block}\n\n"
        f"Conversation Transcript:\n{transcript}\n\n"
        "Return JSON only: an object with key 'suggestions' containing an array of 3 string drafts."
    )
    config = types.GenerateContentConfig(response_mime_type="application/json")
    try:
        async for attempt in retrying("gemini", attempts=4):
            with attempt:
                resp = await client.aio.models.generate_content(model=CHAT_MODEL, contents=prompt, config=config)
                break
        parsed = json.loads(resp.text)
        return parsed.get("suggestions", ["I understand. Let me check that for you right away."])
    except Exception:
        return [
            "I understand your inquiry and am looking into this right now for you.",
            "Thank you for your patience while I check the details for you.",
            "Could you please confirm your account details so I can assist you further?",
        ]
