"""
File Storage — one async interface over two backends.

    backend_name -> "supabase" | "local"

* **supabase** — Supabase Storage via its REST API (httpx), used in the cloud
  because the local filesystem on Render is ephemeral. Uploaded objects survive
  redeploys and are shared across instances.
* **local** — the filesystem, kept for development so no credentials are needed.

Supabase's Storage REST API is used instead of the official `supabase` SDK on
purpose: the SDK pulls in gotrue/realtime/websockets and would undo the slim
`requirements-render.txt` used by Render. The REST surface we need is small
(object create/upsert, delete, public URL, signed URL).

Buckets:
    profile-photos  -> public bucket, loaded directly by browsers
    audit-captures  -> PRIVATE, only reachable through short-lived signed URLs
                      (the images contain identifiable faces of flagged proxy
                      attempts, so they must not be publicly listable)

Values returned to the database:
    * public bucket -> a fully-qualified URL that an <img src> can load
    * private bucket -> the object *key*, so a signed URL can be minted later.
      An absolute filesystem path would be useless for signing.
"""

import logging
import mimetypes
import os
import posixpath
from typing import Optional
from urllib.parse import quote

import httpx

from config import settings

logger = logging.getLogger("ecsi.storage")

PHOTOS_BUCKET = "photos"
CAPTURES_BUCKET = "captures"

# Bucket -> public? The service-role key bypasses RLS either way; `public`
# controls whether an unauthenticated /object/public/<bucket>/<key> GET works.
_BUCKET_SPECS = {
    PHOTOS_BUCKET: {
        "id_attr": "SUPABASE_BUCKET_PHOTOS",
        "public": True,
        "allowed_types": {"image/jpeg", "image/png", "image/webp"},
        "max_bytes": 5 * 1024 * 1024,
    },
    CAPTURES_BUCKET: {
        "id_attr": "SUPABASE_BUCKET_CAPTURES",
        "public": False,
        "allowed_types": {"image/jpeg", "image/png", "image/webp", "application/pdf"},
        "max_bytes": 8 * 1024 * 1024,
    },
}


class StorageError(RuntimeError):
    """Raised when an object cannot be stored or retrieved."""


# ── Image sniffing ────────────────────────────────────────────────────────────
# Client-supplied Content-Type is untrusted: an attacker could upload HTML and
# have it served from our own origin. Verify the actual magic bytes instead.
_MAGIC = (
    (b"\xff\xd8\xff", "image/jpeg", ".jpg"),
    (b"\x89PNG\r\n\x1a\n", "image/png", ".png"),
    (b"GIF87a", "image/gif", ".gif"),
    (b"GIF89a", "image/gif", ".gif"),
)


def sniff_image(data: bytes) -> Optional[tuple]:
    """Return (content_type, extension) for a supported image, else None."""
    if not data:
        return None
    for magic, content_type, ext in _MAGIC:
        if data.startswith(magic):
            if content_type == "image/gif":
                return None  # not in the allow-list
            return content_type, ext
    # WEBP: "RIFF" .... "WEBP"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", ".webp"
    return None


def image_extension_for(content_type: str) -> str:
    """Map a content type to the extension we persist it under."""
    return {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }.get(content_type, ".jpg")


def guess_content_type(key: str) -> str:
    return mimetypes.guess_type(key)[0] or "application/octet-stream"


def _safe_key(key: str) -> str:
    """
    Normalise an object key and refuse anything that could escape the bucket.

    Guards against `../` traversal, absolute paths and drive letters, which would
    otherwise let a caller write outside the intended prefix. The input is
    rejected rather than silently rewritten, so a caller cannot believe it wrote
    somewhere it did not.
    """
    raw = (key or "").replace("\\", "/").strip()

    # Reject before normalising: normpath would collapse `a/../../b` into
    # `../b`, and we would lose the original intent.
    if not raw:
        raise StorageError("Refusing empty object key.")
    if raw.startswith("/"):
        raise StorageError(f"Refusing absolute object key: {key!r}")
    if ":" in raw:                     # C:/... and other drive/URL schemes
        raise StorageError(f"Refusing object key with a colon: {key!r}")
    if any(part == ".." for part in raw.split("/")):
        raise StorageError(f"Refusing traversing object key: {key!r}")

    normalised = posixpath.normpath(raw)
    if normalised in (".", "", "..") or normalised.startswith("../"):
        raise StorageError(f"Refusing unsafe object key: {key!r}")
    return normalised


# ── Supabase backend ──────────────────────────────────────────────────────────
class SupabaseStorage:
    """Talks to Supabase Storage's REST API."""

    def __init__(self, url: str, service_role_key: str) -> None:
        self._base = url.rstrip("/")
        self._key = service_role_key
        self._client = httpx.AsyncClient(
            base_url=self._base,
            timeout=httpx.Timeout(30.0, connect=10.0),
            headers={
                "Authorization": f"Bearer {service_role_key}",
                "apikey": service_role_key,
            },
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    # -- buckets ---------------------------------------------------------------
    async def ensure_buckets(self) -> list:
        """Idempotently create the configured buckets. Returns created names."""
        if not settings.STORAGE_AUTO_CREATE_BUCKETS:
            logger.info(
                "STORAGE_AUTO_CREATE_BUCKETS=false: expecting %s and %s to exist already",
                settings.SUPABASE_BUCKET_PHOTOS, settings.SUPABASE_BUCKET_CAPTURES,
            )
            return []
        created = []
        for logical in (PHOTOS_BUCKET, CAPTURES_BUCKET):
            spec = _BUCKET_SPECS[logical]
            bucket_id = getattr(settings, spec["id_attr"])
            if not bucket_id:
                continue
            payload = {
                "id": bucket_id,
                "name": bucket_id,
                "public": spec["public"],
                "file_size_limit": spec["max_bytes"],
                "allowed_mime_types": sorted(spec["allowed_types"]),
            }
            resp = await self._client.post("/storage/v1/bucket", json=payload)
            if resp.status_code in (200, 201):
                created.append(bucket_id)
                logger.info("Created storage bucket %s (public=%s)", bucket_id, spec["public"])
            elif resp.status_code in (400, 409):
                # Already exists, or the name is taken by a bucket we do not own.
                body = resp.text.lower()
                if "already" in body or "exists" in body:
                    logger.debug("Storage bucket %s already exists", bucket_id)
                    updated = await self._client.put(f"/storage/v1/bucket/{bucket_id}", json=payload)
                    if updated.status_code != 200:
                        logger.warning(
                            "Could not update bucket %s (HTTP %s): %s",
                            bucket_id, updated.status_code, updated.text[:200],
                        )
                else:
                    logger.warning(
                        "Could not create bucket %s (HTTP %s): %s",
                        bucket_id, resp.status_code, resp.text[:200],
                    )
            else:
                logger.warning(
                    "Could not create bucket %s (HTTP %s): %s",
                    bucket_id, resp.status_code, resp.text[:200],
                )
        return created

    def _bucket_id(self, logical: str) -> str:
        return getattr(settings, _BUCKET_SPECS[logical]["id_attr"])

    def _spec(self, logical: str) -> dict:
        return _BUCKET_SPECS[logical]

    # -- objects ---------------------------------------------------------------
    async def save(self, logical: str, key: str, data: bytes, content_type: str) -> str:
        spec = self._spec(logical)
        key = _safe_key(key)
        if len(data) > spec["max_bytes"]:
            raise StorageError(
                f"File is {len(data)} bytes, over the {spec['max_bytes']} byte limit "
                f"for {logical}."
            )
        if content_type not in spec["allowed_types"]:
            raise StorageError(
                f"Content type {content_type!r} is not allowed for {logical}."
            )

        bucket = self._bucket_id(logical)
        resp = await self._client.post(
            f"/storage/v1/object/{bucket}/{quote(key)}",
            content=data,
            headers={
                "Content-Type": content_type,
                "x-upsert": "true",       # replace instead of 409 on re-upload
                "Cache-Control": "3600",
            },
        )
        if resp.status_code not in (200, 201):
            raise StorageError(
                f"Supabase upload failed for {bucket}/{key} (HTTP {resp.status_code}): "
                f"{resp.text[:200]}"
            )

        if spec["public"]:
            return self.public_url(logical, key)
        # Private bucket: persist the KEY so a signed URL can be minted later.
        return key

    async def delete(self, logical: str, key: str) -> bool:
        key = _safe_key(key)
        bucket = self._bucket_id(logical)
        resp = await self._client.delete(f"/storage/v1/object/{bucket}/{quote(key)}")
        if resp.status_code in (200, 204):
            return True
        if resp.status_code == 404:
            return False
        logger.warning(
            "Supabase delete failed for %s/%s (HTTP %s): %s",
            bucket, key, resp.status_code, resp.text[:200],
        )
        return False

    def public_url(self, logical: str, key: str) -> str:
        key = _safe_key(key)
        return f"{self._base}/storage/v1/object/public/{self._bucket_id(logical)}/{quote(key)}"

    async def signed_url(self, logical: str, key: str) -> Optional[str]:
        """Mint a temporary read URL for a private object."""
        key = _safe_key(key)
        bucket = self._bucket_id(logical)
        resp = await self._client.post(
            f"/storage/v1/object/sign/{bucket}/{quote(key)}",
            json={"expiresIn": settings.SIGNED_URL_TTL_SECONDS},
        )
        if resp.status_code not in (200, 201):
            logger.warning(
                "Could not sign %s/%s (HTTP %s): %s",
                bucket, key, resp.status_code, resp.text[:200],
            )
            return None
        try:
            payload = resp.json()
        except ValueError:
            return None
        signed = payload.get("signedURL") or payload.get("signedUrl") or payload.get("url")
        if not signed:
            return None
        return f"{self._base}{signed}" if signed.startswith("/") else signed


# ── Local backend ─────────────────────────────────────────────────────────────
class LocalStorage:
    """Filesystem implementation, mirroring the Supabase key semantics."""

    def __init__(self) -> None:
        self._roots = {
            PHOTOS_BUCKET: settings.PROFILE_PHOTO_DIR,
            CAPTURES_BUCKET: settings.AUDIT_CAPTURE_DIR,
        }

    async def ensure_buckets(self) -> list:
        for root in self._roots.values():
            os.makedirs(root, exist_ok=True)
        return []

    async def aclose(self) -> None:
        return None

    def _root(self, logical: str) -> str:
        return self._roots[logical]

    def _abs_path(self, logical: str, key: str) -> str:
        key = _safe_key(key)
        root = os.path.abspath(self._root(logical))
        path = os.path.abspath(os.path.join(root, *key.split("/")))
        # Defence in depth: even after _safe_key, confirm containment.
        if not path.startswith(root + os.sep):
            raise StorageError(f"Refusing to write outside {root}: {key!r}")
        return path

    async def save(self, logical: str, key: str, data: bytes, content_type: str) -> str:
        spec = _BUCKET_SPECS[logical]
        key = _safe_key(key)
        if len(data) > spec["max_bytes"]:
            raise StorageError(
                f"File is {len(data)} bytes, over the {spec['max_bytes']} byte limit "
                f"for {logical}."
            )
        if content_type not in spec["allowed_types"]:
            raise StorageError(
                f"Content type {content_type!r} is not allowed for {logical}."
            )
        path = self._abs_path(logical, key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        # Write to a temp file then rename so a reader never sees a partial image.
        tmp = f"{path}.part"
        with open(tmp, "wb") as fh:
            fh.write(data)
        os.replace(tmp, path)

        if spec["public"]:
            return f"/static/profiles/{key}"
        return key

    async def delete(self, logical: str, key: str) -> bool:
        try:
            path = self._abs_path(logical, key)
        except StorageError:
            return False
        if os.path.isfile(path):
            os.remove(path)
            return True
        return False

    def public_url(self, logical: str, key: str) -> str:
        key = _safe_key(key)
        return f"/static/profiles/{key}"

    async def signed_url(self, logical: str, key: str) -> Optional[str]:
        """Local mode serves captures from the existing StaticFiles mount."""
        try:
            key = _safe_key(key)
        except StorageError:
            return None
        if not os.path.isfile(self._abs_path(logical, key)):
            return None
        return f"/static/audit/{key}"


# ── Module-level singleton ────────────────────────────────────────────────────
_backend = None


def get_storage():
    """Return the process-wide storage backend, choosing it on first use."""
    global _backend
    if _backend is None:
        kind = settings.storage_backend
        if kind == "supabase":
            _backend = SupabaseStorage(
                settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY
            )
            logger.info("File storage: Supabase (%s)", settings.SUPABASE_URL)
        else:
            _backend = LocalStorage()
            logger.info("File storage: local filesystem (development)")
    return _backend


async def ensure_buckets() -> list:
    backend = get_storage()
    return await backend.ensure_buckets()


async def aclose() -> None:
    """Release the HTTP connection pool on shutdown."""
    global _backend
    if _backend is not None:
        await _backend.aclose()
        _backend = None


async def save_photo(user_id: str, data: bytes, content_type: str) -> str:
    """
    Store a profile photo and return a directly loadable URL.
    Raises StorageError if the bytes are not a supported image.
    """
    sniffed = sniff_image(data)
    if sniffed is None:
        raise StorageError(
            "Unsupported or invalid image data. Only JPEG, PNG and WEBP are accepted."
        )
    actual_type, ext = sniffed
    backend = get_storage()
    key = f"{user_id}{ext}"
    return await backend.save(PHOTOS_BUCKET, key, data, actual_type)


async def save_capture(subdir: str, filename: str, data: bytes, content_type: str) -> str:
    """
    Store an audit capture in the PRIVATE bucket and return its object key.
    A key (not a URL) is returned because these images need signed access.
    """
    backend = get_storage()
    # Join without introducing a leading "/" — keys are relative to the bucket
    # root, and callers may pass either "intruders" or "" plus a full key.
    prefix = (subdir or "").strip("/")
    key = _safe_key(f"{prefix}/{filename}" if prefix else filename)
    return await backend.save(CAPTURES_BUCKET, key, data, content_type)


async def save_face_enrollment_photo(user_id: str, data: bytes) -> str:
    """Store one enrollment reference image in the private captures bucket."""
    sniffed = sniff_image(data)
    if sniffed is None:
        raise StorageError("Unsupported or invalid face enrollment image.")
    content_type, ext = sniffed
    return await save_capture("enrollments", f"{user_id}{ext}", data, content_type)


async def face_enrollment_photo_url(user_id: str) -> Optional[str]:
    """Mint a short-lived URL for a user's private enrollment image."""
    for ext in (".jpg", ".png", ".webp"):
        url = await capture_signed_url(f"enrollments/{user_id}{ext}")
        if url:
            return url
    return None


async def delete_face_enrollment_photo(user_id: str) -> bool:
    """Delete the private enrollment image for a user."""
    removed = False
    for ext in (".jpg", ".png", ".webp"):
        try:
            removed = await get_storage().delete(CAPTURES_BUCKET, f"enrollments/{user_id}{ext}") or removed
        except StorageError:
            continue
    return removed


async def save_excuse_proof(student_id: str, request_id: str, filename: str, data: bytes, content_type: str) -> str:
    """Save a private proof attachment and return its object key."""
    safe_name = posixpath.basename(filename.replace("\\", "/"))[:180] or "proof"
    return await save_capture(
        "excuses", f"{student_id}/{request_id}-{safe_name}", data, content_type
    )


async def delete_capture(key: str) -> bool:
    """Delete a private capture object by key."""
    try:
        return await get_storage().delete(CAPTURES_BUCKET, key)
    except StorageError:
        return False


async def capture_signed_url(key: str) -> Optional[str]:
    """Mint a short-lived URL for a stored audit capture key."""
    if not key:
        return None
    return await get_storage().signed_url(CAPTURES_BUCKET, key)


async def delete_photo_key(key: str) -> bool:
    """Delete a single stored photo object by its key/filename."""
    try:
        return await get_storage().delete(PHOTOS_BUCKET, key)
    except StorageError:
        return False


async def delete_photo(user_id: str) -> bool:
    """Remove every stored photo variant for a user, whatever the extension."""
    removed = False
    for ext in (".jpg", ".png", ".webp"):
        if await delete_photo_key(f"{user_id}{ext}"):
            removed = True
    return removed
