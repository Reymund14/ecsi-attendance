# ECSI Attendance System — Deployment Guide

Production topology. All three services are free-tier friendly.

| Piece | Service | Lives at |
|---|---|---|
| Frontend (static HTML/CSS/JS) | **Vercel** | `Projects/DERILO PROJECT/ECSI-Attendance-System/frontend` |
| Backend API (FastAPI) | **Render** | `Projects/DERILO PROJECT/ECSI-Attendance-System/backend` |
| Database (PostgreSQL) | **Supabase** | managed |

```
Browser ──HTTPS──> Vercel (static page)
   │                    │
   │  REST /api/v1      │  env vars baked in at build time
   ▼                    ▼
                    Render  ──asyncpg──>  Supabase (PostgreSQL)
   ▲                    │
   └──────WSS /ws/dashboard───┘   (live attendance feed)
```

> **Deploy the backend first.** You need Render's URL before you can configure
> Vercel's environment variables.

---

## 1. What changed for the cloud (and why)

* `index.html` reads its endpoints from `%VITE_API_BASE_URL%` / `%VITE_WS_URL%`,
  which Vite substitutes at build time. No more hardcoded `localhost`.
* `backend/requirements-render.txt` includes the CPU OpenCV / DeepFace face
  enrollment stack. The package set and downloaded model weights are large.
* `services/face_service.py` imports `cv2` / `numpy` / `DeepFace` lazily,
  allowing the API to start and report a clear health status if a dependency
  is unavailable.
* `config.py` refuses to boot in production with a placeholder/short
  `SECRET_KEY` or a SQLite `DATABASE_URL`, and accepts `ALLOWED_ORIGINS` as
  either a JSON array or a comma-separated list.
* `main.py` creates its storage directories *before* mounting `StaticFiles`
  (previously a fresh deploy crashed at import time), mounts `/static/profiles`
  (which `routers/users.py` writes to but nothing served), enables
  `CORS_ORIGIN_REGEX`, and adds a `/health/ready` probe that verifies the DB.
* `middleware/rbac.py` now `selectinload`s the RFID/face relationships.
  Without this, every `GET /users/me` died with `MissingGreenlet` (HTTP 500),
  because `UserOut.from_orm_extended` touches `user.rfid_card` and an
  `AsyncSession` cannot lazy-load.
* `HTTPBearer(auto_error=False)` so a *missing* token yields `401` + 
  `WWW-Authenticate: Bearer` (FastAPI's default answers `403`, and `403` is
  reserved for a valid token that lacks permission).
* Profile photos and audit captures moved from the local filesystem to
  **Supabase Storage** (see §2b). Render's disk is ephemeral, so uploads would
  otherwise disappear on every redeploy.

---

## 1b. File storage at a glance

| | Avatars | Audit captures |
|---|---|---|
| Bucket | `profile-photos` | `audit-captures` |
| Visibility | **public** | **private** |
| Stored in DB | full URL (`profile_photo_path`) | object **key** (`captured_frame_path`, `intruder_image_path`) |
| How the client reads it | `<img src="…">` directly | `GET /api/v1/attendance/{record_id}/capture` (or `/intruder`) → short-lived signed URL |
| Who may read it | anyone with the URL | super admins only, URL expires after `SIGNED_URL_TTL_SECONDS` |

The first frame from face enrollment is also saved privately at
`audit-captures/enrollments/<user-id>.<image-extension>`. The enrollment
response includes a short-lived signed URL for the enrolling user; deleting
the face template removes this reference image too.

Avatar uploads are validated by **magic bytes**, not the browser-supplied
`Content-Type`, so an attacker cannot smuggle HTML/SVG into a bucket served
from your own origin. Accepted images: JPEG, PNG, WEBP. Excuse proofs accept
those image types plus PDF, with a 5 MB API limit, in the private bucket.
Keys are validated to block path traversal, and buckets enforce size limits
and an allow-list of MIME types.

Student excuse requests are stored in the `excuse_requests` database table;
proof files go to the private `audit-captures` bucket. Students can list their
own requests, and faculty can list and review requests in their assigned
section. A new backend deployment creates the table automatically.

---

## 2. Supabase (database)

1. Create a project at <https://supabase.com>.
2. **Settings → Database → Connection string → URI**.
3. Switch the connection to the **Transaction pooler** (port `5432`), *not* the
   session pooler (port `5433`) and *not* the direct connection.
4. **URL-encode the password.** Special characters like `@ : / ? # &` break the
   URL otherwise:

   ```powershell
   [uri]::EscapeDataString("your#supabase-password")
   ```

5. Build the value Render needs:

   ```
   postgresql+asyncpg://postgres.PROJECT_REF:<url-encoded-password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```

   Keep the `postgresql+asyncpg://` scheme — `database.py` creates an async
   engine. Optionally append `?prepared_statement_cache_size=0` if you hit
   prepared-statement errors through the pooler.

### Tables — nothing to do manually

There are **no Alembic migrations** in this repo (the `alembic` dependency is
vestigial). `init_db()` runs on every startup and calls
`Base.metadata.create_all()`, so the **first boot against an empty database
creates all five tables itself**:

| Table | Notes |
|---|---|
| `users` | PK is a 36-char UUID **string**. Login uses `id_number` (not `employee_id`). `role` and `status` are PG enums. |
| `rfid_cards` | `user_id` is `UNIQUE` — one card per user. |
| `face_embeddings` | One per user. `embedding_vector` is `FloatListJSON`, i.e. **TEXT holding a JSON float array** (portable across SQLite/PG), *not* a vector/bytea column. |
| `attendance_records` | `status` / `check_type` are PG enums; `timestamp` is `timestamptz`. |
| `proxy_audit_logs` | `attendance_record_id` is `UNIQUE` (1:1 with the record). |

`create_all()` only **creates missing** tables — it never alters existing ones.
If you change a column later you must migrate by hand. SQLAlchemy emits the
`user_role`, `account_status`, `attendance_status` and `check_type` enum types
automatically, so you do not need to declare them.

To start from a clean slate instead, drop them in the Supabase SQL editor:

```sql
DROP TABLE IF EXISTS proxy_audit_logs, attendance_records,
                     face_embeddings, rfid_cards, users CASCADE;
DROP TYPE IF EXISTS user_role, account_status,
                     attendance_status, check_type CASCADE;
```

The authoritative source is `backend/models/user.py` and
`backend/models/attendance.py`.

### Demo data (optional)

`backend/seed.py` populates a realistic demo dataset (21 users, 20 RFID cards,
17 embeddings, ~2 weeks of attendance). Run it **locally against SQLite only**:

```powershell
cd backend
python seed.py
```

Do **not** point it at your production Supabase instance unless you intend to
publish those dummy accounts and their shared passwords to the internet.

With storage configured, the seeder also uploads a small placeholder JPEG for
each seeded intruder capture so the signed-URL endpoints return real images
instead of `410`. `--reset` clears the database and rewrites the placeholders.

### Faculty advisory sections (required)

A faculty member's **advisory section is stored in `users.section`** — the same
column a student's class goes in. The API scopes faculty access by it
(`GET /attendance`, `GET /excuses`, `GET /evaluations/summary`), so **a faculty
account with a NULL advisory section sees an empty dashboard and gets HTTP 400
on Attendance Evaluation** rather than anyone else's students.

Set it under **Users → Add/Edit User → Advisory Section**. When you create
faculty accounts, do not leave that field blank.

### Attendance Evaluation data

`GET /api/v1/evaluations/summary` computes every number on the faculty
Attendance Evaluation page from `attendance_records` and `excuse_requests`, and
`PUT /api/v1/evaluations/{student_id}` persists the adviser's standing and
remarks to the new `attendance_evaluations` table (created automatically at
startup by `init_db`).

Two things worth knowing:

- The attendance-rate divisor is the **count of weekdays in the evaluation
  window** (30 days trailing by default). There is no school-calendar table, so
  public holidays are counted as school days and will read slightly low.
- Only `verified` and `manual_override` check-ins count as present. A
  `proxy_anomaly` is someone else's card, and `pending_review` is unconfirmed,
  so neither counts toward the rate.

---

## 2b. Supabase Storage (profile photos + audit captures)

1. **Settings → API**.
2. Copy **Project URL** → `SUPABASE_URL`
   (e.g. `https://abcdefgh.supabase.co`).
3. Copy the **`service_role`** secret → `SUPABASE_SERVICE_ROLE_KEY`.

   > **Why the service role key and not the anon key?** The audit bucket is
   > private, so minting signed read URLs requires a key that bypasses row-level
   > security. Treat it like a database password: backend environment variable
   > only. **Never** name it `VITE_*`, never commit it, never send it to a
   > browser. Anyone holding it has full read/write access to every object.

### Buckets

You do not have to create them by hand: on startup `main.py` calls
`storage.ensure_buckets()`, which creates missing buckets with the correct
public flag, size limit and MIME allow-list. It is idempotent, so redeploys are
fine. Set `STORAGE_AUTO_CREATE_BUCKETS=false` if you prefer to provision them
yourself (Dashboard → Storage → New bucket), keeping these settings:

| Bucket | Public | Suggested size limit |
|---|---|---|
| `profile-photos` | **yes** | 5 MB |
| `audit-captures` | **no** | 10 MB |

If you create them manually, `public` must match the table above or avatars
will 404 and signed URLs will fail.

### No SQL policies needed

Every upload, delete and signed-URL call goes through the backend with the
service role key, so **no Storage RLS policies or storage.objects grants are
required**. The security boundary is the API: `middleware/rbac.py` restricts the
capture endpoints to super admins. Adding an open `anon` policy to the private
bucket would defeat that.

### How it behaves locally

With no `SUPABASE_*` variables set, `STORAGE_BACKEND=auto` resolves to `local`
and everything is written to disk (`AUDIT_CAPTURE_DIR`,
`PROFILE_PHOTO_DIR`) and served from the existing `/static` mounts — no
credentials, no network calls. `ENVIRONMENT=production` **refuses to start**
with local storage, so a misconfigured deploy fails loudly instead of silently
losing every upload.

To exercise the real buckets on a laptop, put the credentials in
`backend/.env.local` (gitignored — never in `.env`, which *is* meant to be
committed for shared defaults):

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role secret>
STORAGE_BACKEND=supabase
```

Precedence is **real environment variables > `.env.local` > `.env`**, so a shell
or Render value always wins over a file. Values are trimmed of surrounding
whitespace and quotes, so a key pasted with a trailing newline still works.

---

## 3. Render (backend API)

### 3a. Create the service

**Dashboard → New → Blueprint** and select this repository. Render reads the
committed `render.yaml` and pre-fills everything.

If you would rather use the Dashboard: **New → Web Service**, then set

| Field | Value |
|---|---|
| Root Directory | `Projects/DERILO PROJECT/ECSI-Attendance-System/backend` |
| Runtime | Python 3.11 (pinned by `backend/.python-version`) |
| Build Command | `pip install --upgrade pip && pip install -r requirements-render.txt` |
| Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT --workers 1` |
| Health Check Path | `/health` |

### 3b. Environment variables

`SECRET_KEY`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
`ALLOWED_ORIGINS` are `sync: false` in the blueprint, so Render prompts for
them. Set them in **Environment**, or paste from `backend/.env.production`.

| Variable | Value |
|---|---|
| `ENVIRONMENT` | `production` |
| `DEBUG` | `false` |
| `SECRET_KEY` | `python -c "import secrets; print(secrets.token_hex(32))"` |
| `DATABASE_URL` | Supabase transaction-pooler URL (§2) |
| `SUPABASE_URL` | Supabase project URL (§2b) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` secret (§2b) |
| `STORAGE_BACKEND` | `supabase` |
| `SUPABASE_BUCKET_PHOTOS` / `SUPABASE_BUCKET_CAPTURES` | `profile-photos` / `audit-captures` |
| `SIGNED_URL_TTL_SECONDS` | `900` (15 min) |
| `STORAGE_AUTO_CREATE_BUCKETS` | `true` |
| `ALLOWED_ORIGINS` | `["https://<your-app>.vercel.app"]` |
| `CORS_ORIGIN_REGEX` | `^https://[a-z0-9-]+\.vercel\.app$` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `480` (8h shift) |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | `5` / `5` |

Missing or partial Supabase credentials in production raise a `Settings`
validation error at import time — the service will not boot with a broken
storage config.

`RENDER_EXTERNAL_URL` is injected automatically and is used to enable
`TrustedHostMiddleware` (reduced to a bare hostname, since that middleware
compares against the `Host` header).

### 3c. After the first deploy

```powershell
# liveness — does not touch the DB
curl https://<service>.onrender.com/health

# readiness — verifies DB connectivity and reports face-pipeline status
curl https://<service>.onrender.com/health/ready
```

Expected: `{"status":"ok", ...}` then
`{"status":"ready","environment":"production","database":"connected","face_pipeline_available":true}`.

The Render requirements install the CPU face pipeline. DeepFace downloads its
ArcFace model weights the first time a face is enrolled, so that first request
can take longer than later requests. Allow adequate memory and disk for the
TensorFlow/OpenCV dependencies and downloaded model weights. The service still
receives camera frames from the browser; it cannot access a camera physically
attached to your computer.

---

## 4. Vercel (frontend)

1. **Add New → Project**, import this repository.
2. **Root Directory:** `Projects/DERILO PROJECT/ECSI-Attendance-System/frontend`
3. Framework preset: **Other**. `vercel.json` already supplies the build
   (`npm run build`) and output (`dist`) settings.
4. Add environment variables for **Production** *and* **Preview**:

   | Variable | Value |
   |---|---|
   | `VITE_API_BASE_URL` | `https://<service>.onrender.com/api/v1` |
   | `VITE_WS_URL` | `wss://<service>.onrender.com/ws/dashboard` |

   Note `wss://`, not `ws://`, and no trailing slash.

5. Deploy, then add the resulting `https://<app>.vercel.app` origin to Render's
   `ALLOWED_ORIGINS` and redeploy the API.

> `frontend/.env` is committed with `127.0.0.1` defaults so a local
> `npm run build` works with no setup. Vite gives real environment variables
> priority over `.env` files, so the Vercel values always win.

---

## 5. Verify the deployment

```powershell
$api = "https://<service>.onrender.com"

# 1. health
curl "$api/health"

# 2. login — the body field is id_number, NOT employee_id
$body = @{ id_number = "ADMIN001"; password = "Admin@1234" }
$token = (Invoke-RestMethod "$api/api/v1/auth/login" -Method Post `
    -ContentType "application/json" -Body ($body | ConvertTo-Json)).access_token

# 3. authenticated call
Invoke-RestMethod "$api/api/v1/admin/analytics/overview" `
    -Headers @{ Authorization = "Bearer $token" }

# 4. CORS preflight from the Vercel origin must return access-control-allow-origin
curl "$api/api/v1/auth/login" -Method Options `
    -Headers @{ Origin = "https://<app>.vercel.app"; "Access-Control-Request-Method" = "POST" }

# 5. readiness must report the storage backend
curl "$api/health/ready"   # ... "storage":"supabase"

# 6. storage round trip (super admin)
#    - upload an avatar, then read the stored URL
Invoke-RestMethod "$api/api/v1/users/me/photo" -Method Post `
    -Headers @{ Authorization = "Bearer $token" } -Form @{ photo = Get-Item avatar.jpg }
#    - fetch a record id, then mint a signed capture URL (expires in 15 min)
Invoke-RestMethod "$api/api/v1/attendance/<record_id>/capture" `
    -Headers @{ Authorization = "Bearer $token" }
```

A non-super-admin token calling the capture endpoints must get `403`; an
unknown `record_id` returns `404`, and a record whose object is missing from
the bucket returns `410`.

Then in the browser: log in, open the dashboard, and confirm live records
appear over `wss://`. A failed WebSocket shows as a "Live" indicator stuck
offline in the UI.

---

## 6. Known cloud limitations (read before promising hardware features)

| Limitation | Impact | Mitigation |
|---|---|---|
| **No physical camera/RFID on Render** | `services/camera_service.py`, `attendance_service.py` and `rfid_service.py` are unreachable on cloud. They are not imported by `main.py`. | Attendance is produced in the browser and POSTed as base64. Run the full requirements on an on-prem/edge box with a camera to use the real pipeline. |
| **Face enrollment returns 503** | Check Render deploy logs and `/health/ready`; `face_pipeline_available` should be `true`. Confirm the service uses `backend/requirements-render.txt` and redeploy after dependency changes. | Resolve dependency/build failures, then redeploy. |
| **Browser "face verification" is a simulation** | `index.html` matches against local mock hashes — it is not real biometric matching and trivially bypassable. | Replace with server-side ArcFace inference before using this for anything that matters. |
| **Audit captures need a camera path** | The private bucket works, but on Render nothing writes to it: only `attendance_service.py` (camera) produces frames, and it never runs in the cloud. | `/capture` and `/intruder` return `410` until records are written by an edge instance. |
| **Free Render instances sleep** | After ~15 min idle the API sleeps and live `wss://` dashboards disconnect. | Use the `starter` plan for reliable live feeds. |
| **In-memory WebSocket manager** | `websocket/manager.py` holds clients per process, so the service must run as `--workers 1`. | Scale vertically, or move the manager to Redis pub/sub. |
| **No migrations** | `create_all()` never alters existing tables. | Write Alembic migrations (or manual SQL) before schema changes. |
| **`parent` role unsupported** | `models/user.py` allows only `super_admin`, `faculty`, `student`. | Add the role to the enum and to the RBAC dependency. |

---

## 7. Local development (unchanged)

```powershell
# backend — full deps, SQLite, dummy data
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python seed.py
uvicorn main:app --reload --port 8000

# frontend — separate shell
cd ..\frontend
npm install
npm run dev
```

`python -m venv .venv` then `pip install -r requirements.txt` gives you the
camera/face stack. Use `requirements-render.txt` only if you are reproducing
the cloud environment.

Storage auto-detects: with no `SUPABASE_*` variables in `backend/.env` it uses
the local filesystem (no network calls), so nothing above changes. To exercise
the cloud code path locally, put real Supabase credentials in `.env` — but
point the buckets at a scratch project, since dev uploads are as durable as
production ones.

---

## 8. Updating a deployment

Push to `main`. Render and Vercel both redeploy automatically
(`autoDeploy: true`).

Because `frontend/.env` supplies localhost defaults, **a frontend redeploy is
only correct if the Vercel env vars are set** — otherwise the bundle silently
points at `127.0.0.1`. Confirm `VITE_API_BASE_URL` appears in the Vercel
project before you assume the live site works.

---

## 9. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Render build fails on `deepface`/`opencv` | Check Python is set to 3.11 and inspect Render build logs for dependency or resource failures. |
| `RuntimeError: DATABASE_URL must point at PostgreSQL` | `ENVIRONMENT=production` with a SQLite URL. Set the Supabase URL. |
| `STORAGE_BACKEND resolved to 'local'` at boot | Production needs durable storage: set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, or `STORAGE_BACKEND=supabase`. |
| `STORAGE_BACKEND=supabase but SUPABASE_URL ... empty` | One of the two Supabase credentials is missing in Render's Environment tab (§2b). Names are case-sensitive. |
| App refuses to start: `SUPABASE_SERVICE_ROLE_KEY still holds the template placeholder` | You copied `.env.production` without filling it in. `STORAGE_BACKEND=supabase` with an unusable key now fails at boot instead of 400ing later on uploads. |
| Supabase replies `400 headers must have required property 'authorization'` | The request went out **without** an `Authorization` header — it did not come from `services/storage.py`, which sends one on every call. Look for a stray script or `curl` against `/storage/v1/bucket`. |
| Supabase replies `403 Invalid Compact JWS` | The key reached Supabase but is malformed — usually wrapping quotes. Values are now stripped automatically; a rotated key is the other cause. |
| `httpx.LocalProtocolError: Illegal header value` | The key had a trailing newline or space. Now trimmed by `config.py`; if it persists, re-copy the secret. |
| Private capture / proof / enrollment image 404s after upload | Fixed: signed URLs need the `/storage/v1` prefix. Redeploy if the build predates that fix in `services/storage.py`. |
| Avatar upload returns 400 "not a valid JPEG, PNG or WEBP" | Bytes are validated by magic number; make sure the client sends the real image, not a placeholder or base64 data URI string. |
| Avatar 404s after a successful upload | `profile-photos` was created private. It must be a **public** bucket (§2b). |
| `/capture` returns 410 | The record has a key but no object in the bucket — nothing wrote a frame yet (§6). |
| `/capture` returns 403 | The endpoint is super-admin only. |
| Signed URL works in curl but not in `<img>` | The URL expired. `SIGNED_URL_TTL_SECONDS` was set too low, or the image was cached. |
| `SECRET_KEY must be ... at least 32 characters` | Generate a real secret (§3b). |
| `SettingsError: error parsing value for field "ALLOWED_ORIGINS"` | Passed as JSON but the field rejected it — use `["https://a","https://b"]` **or** plain `https://a,https://b`. Both are supported. |
| App won't start, `Directory ... does not exist` | Fixed in `main.py`; make sure the deployed commit includes that change. |
| Frontend loads, every API call fails | `VITE_API_BASE_URL` wrong, or the Vercel origin missing from `ALLOWED_ORIGINS`. |
| Login works, live feed stuck offline | Free instance asleep, or `VITE_WS_URL` uses `ws://` instead of `wss://`. |
| CORS error in console, REST calls fine | Set `CORS_ORIGIN_REGEX=^https://[a-z0-9-]+\.vercel\.app$` for preview deploys. |
| `GET /users/me` returns 500 | Stale build missing the `selectinload` fix in `middleware/rbac.py` (§1). Redeploy. |
| Face enrollment returns 422 "no valid faces" | Stale build. Current code returns `503` with an explicit reason. |
| `bcrypt` `__about__` / 72-byte errors | `bcrypt` must stay pinned to `4.0.1` with `passlib 1.7.4`. |
| `ModuleNotFoundError: aiosqlite` | `pip install -r requirements.txt` (it is declared now). |
