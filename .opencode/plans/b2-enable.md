# B2 Enable — Execute Plan

## Goal
Enable Backblaze B2 optional storage for BaseMind (private bucket `BaseMind`, scoped app key).

## Key values (already provided by user — do NOT commit)
- `B2_APPLICATION_KEY_ID=0046561d0183b3a0000000001`
- `B2_APPLICATION_KEY=K004PIF/cWQr1yCL4m0LiIfvLoLomZU`
- `B2_BUCKET_NAME=BaseMind`

## Steps (all behind plan-mode gate — run only after build-mode approved)

### 1. Update `D:\BaseMind\backend\.env`
Append (read first, confirm not already present):
```
B2_APPLICATION_KEY_ID=0046561d0183b3a0000000001
B2_APPLICATION_KEY=K004PIF/cWQr1yCL4m0LiIfvLoLomZU
B2_BUCKET_NAME=BaseMind
```
Verify: `grep B2 /d/BaseMind/backend/.env` shows 3 lines.

### 2. Install b2sdk in venv
```bash
d/BaseMind/backend/.venv/Scripts/pip.exe install b2sdk>=2.0
```
Verify: `d/BaseMind/backend/.venv/Scripts/python.exe -c "import b2sdk; print(b2sdk.__version__)"`.

### 3. Smoke-test storage.upload_original
Run a tiny script (inside backend venv) that:
- calls `storage.upload_original(owner_id="test-owner", filename="test.txt", data=b"hello B2")`
- asserts the return value is not None (key returned)
- asserts the key starts with "test-owner/"
- calls `get_blob_api().delete_file_version(...)` to clean up the test file
- prints a success message
Verify: script prints "B2 upload OK" with the object key.

### 4. Confirm server boots with B2 enabled
Restart `npm start` (port 8000 free first), curl `/api/health` → ok.
Optional: hit `POST /api/documents/sync` with a real token to prove index + upload path (auth needed; may skip if token unavailable).

### 5. Verify nothing broke in venv
Quick import check: `python -c "from app.routers import router; print(len(router.routes), 'routes')"` → still 16 routes.

## Secrets note
- `.env` is gitignored; do not commit these values.
- Scoped key only has Read/Write/Share + List on BaseMind bucket — no `writeKeys`/`deleteBuckets` — safe.
