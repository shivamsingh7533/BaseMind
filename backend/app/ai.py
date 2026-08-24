import io
from typing import AsyncIterator

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
    client = get_ai_client()
    from google.genai import types

    result = await client.aio.models.embed_content(
        model=EMBED_MODEL,
        contents=texts,
        config=types.EmbedContentConfig(output_dimensionality=EMBEDDING_DIM),
    )
    return [item.values for item in result.embeddings]


def chunk_text(text: str) -> list[str]:
    cleaned = " ".join(text.split())
    if not cleaned:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(cleaned):
        end = min(start + CHUNK_SIZE, len(cleaned))
        if end < len(cleaned):
            period = cleaned.rfind(". ", start + CHUNK_SIZE // 2, end)
            if period > start:
                end = period + 1
        chunks.append(cleaned[start:end].strip())
        start = max(end - CHUNK_OVERLAP, start + 1)
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


async def stream_answer(
    question: str, contexts: list[dict], history: list[dict]
) -> AsyncIterator[str]:
    client = get_ai_client()
    from google.genai import types

    context_block = (
        "\n\n".join(
            f"[Source: {c['source']}, chunk {c['index']}]\n{c['content']}"
            for c in contexts
        )
        if contexts
        else "(knowledge base is empty)"
    )
    contents = [
        *[{"role": m["role"], "parts": [{"text": m["content"]}]} for m in history],
        {
            "role": "user",
            "parts": [
                {
                    "text": f"Knowledge base context:\n{context_block}\n\nCustomer question: {question}"
                }
            ],
        },
    ]
    config = types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT)
    stream = await client.aio.models.generate_content_stream(
        model=CHAT_MODEL, contents=contents, config=config
    )
    async for chunk in stream:
        if chunk.text:
            yield chunk.text
