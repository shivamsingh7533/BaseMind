import asyncio
import re
import uuid

from .config import get_settings

_blob_api = None


def _sanitize(name: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    return safe[:80] or "file"


def get_blob_api():
    """Return a lazily-authorized B2 API, or None when B2 is not configured."""
    global _blob_api
    s = get_settings()
    if not (s.b2_application_key_id and s.b2_application_key and s.b2_bucket_name):
        return None
    if _blob_api is None:
        from b2sdk.v2 import B2Api, InMemoryAccountInfo

        info = InMemoryAccountInfo()
        api = B2Api(info)
        api.authorize_account("production", s.b2_application_key_id, s.b2_application_key)
        _blob_api = api
    return _blob_api


def _do_upload(owner_id: str, filename: str, data: bytes) -> str | None:
    api = get_blob_api()
    if api is None:
        return None
    bucket = api.get_bucket_by_name(get_settings().b2_bucket_name)
    key = f"{owner_id}/{uuid.uuid4().hex}-{_sanitize(filename)}"
    bucket.upload_bytes(data, key)
    return key


async def upload_original(owner_id: str, filename: str, data: bytes) -> str | None:
    """Upload original bytes to B2. Returns the object key, or None if disabled."""
    if get_blob_api() is None:
        return None
    return await asyncio.to_thread(_do_upload, owner_id, filename, data)


def is_b2_enabled() -> bool:
    return get_blob_api() is not None


def _wrap_key(key: str) -> str:
    return key.rsplit("/", 1)[0] + "/"


def _download_url(key: str) -> str | None:
    bucket = get_blob_api().get_bucket_by_name(get_settings().b2_bucket_name)
    for fv, _ in bucket.ls(_wrap_key(key)):
        if fv.file_name == key:
            return bucket.get_download_url(key)
    return None


async def download_url(key: str) -> str | None:
    """Signed download URL for a stored object, or None when the object is gone."""
    if get_blob_api() is None:
        return None
    return await asyncio.to_thread(_download_url, key)


def _delete_object(key: str) -> None:
    api = get_blob_api()
    bucket = api.get_bucket_by_name(get_settings().b2_bucket_name)
    for fv, _ in bucket.ls(_wrap_key(key)):
        if fv.file_name == key:
            api.delete_file_version(fv.id_, fv.file_name)
            return


async def delete_original(key: str) -> None:
    """Best-effort delete of a stored object (no-op when B2 is disabled)."""
    if get_blob_api() is None:
        return
    await asyncio.to_thread(_delete_object, key)
