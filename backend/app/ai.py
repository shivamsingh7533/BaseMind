import io
from collections.abc import AsyncIterator

from fastapi import HTTPException

from .config import get_settings

_client = None

EMBEDDING_DIM = 768
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


async def stream_answer(
    question: str,
    contexts: list[dict],
    history: list[dict],
    extra_instructions: str = "",
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
    contents = [
        *[{"role": m["role"], "parts": [{"text": m["content"]}]} for m in history],
        {
            "role": "user",
            "parts": [{"text": f"Knowledge base context:\n{context_block}\n\nCustomer question: {question}"}],
        },
    ]
    config = types.GenerateContentConfig(system_instruction=system_prompt)
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
