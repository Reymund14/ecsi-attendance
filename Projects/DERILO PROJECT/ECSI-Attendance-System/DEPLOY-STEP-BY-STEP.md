# ECSI Attendance System — Full Deployment Guide
# Supabase (DB) + Cloudflare Tunnel (Backend) + Vercel (Frontend)

---

## Overview

```
[Browser] ──► [Vercel - React Frontend]
                      │
                      │ API calls (https)
                      ▼
         [Cloudflare Tunnel] ──► [Your PC/Server]
                                       │
                          ┌────────────┴────────────┐
                          ▼                         ▼
                   [FastAPI Backend]         [Camera / RFID]
                          │
                          ▼
                  [Supabase PostgreSQL]
```

Do these in order: **Supabase first → Backend second → Vercel last.**

---

## PART 1 — Supabase (Managed Database)

### Step 1 — Create a Supabase account and project

1. Go to https://supabase.com and sign up (free).
2. Click **New Project**.
3. Fill in:
   - **Name**: `ecsi-attendance`
   - **Database Password**: Create a strong password — **save it**, you'll need it.
   - **Region**: Pick the one closest to you.
4. Click **Create new project** and wait ~2 minutes for it to provision.

### Step 2 — Get your database connection string

1. In your Supabase project, go to **Settings** (gear icon, bottom left).
2. Click **Database** in the left sidebar.
3. Scroll down to **Connection string**.
4. Select the **URI** tab.
5. Choose **Transaction pooler** from the dropdown (port 6543).
6. Copy the string — it looks like:
   ```
   postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
   ```
7. Replace `[YOUR-PASSWORD]` with the password you saved in Step 1.

### Step 3 — Update your backend .env

Open `.env` (copy from `.env.production` if you haven't yet) and set:

```env
DATABASE_URL=postgresql+asyncpg://postgres.xxxx:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?prepared_statement_cache_size=0
```

> **Important:** Change `postgresql://` to `postgresql+asyncpg://` and add `?prepared_statement_cache_size=0` at the end.

### Step 4 — Let the backend create the tables

When you start the backend (Part 2), SQLAlchemy will auto-create all tables in Supabase on first run. You can verify by going to **Supabase → Table Editor** after starting.

---

## PART 2 — Local Backend with Cloudflare Tunnel

Your FastAPI backend runs on your local machine (where the camera and RFID are plugged in) and Cloudflare Tunnel gives it a public HTTPS URL.

### Step 1 — Make sure Docker is installed

Download from https://www.docker.com/products/docker-desktop if not installed. Verify:
```bash
docker --version
docker compose version
```

### Step 2 — Prepare your .env file

In the `ECSI-Attendance-System/` folder, copy the template:

```bash
# Windows (PowerShell)
Copy-Item .env.production .env

# Mac/Linux
cp .env.production .env
```

Edit `.env` and fill in these values:

```env
# Generate SECRET_KEY by running this in a terminal:
# python3 -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=paste_your_generated_key_here

# Paste the Supabase connection string from Part 1
DATABASE_URL=postgresql+asyncpg://postgres.xxxx:[PASSWORD]@aws-0-...pooler.supabase.com:6543/postgres?prepared_statement_cache_size=0

# Leave these blank for now — you'll fill in after Step 5
PUBLIC_URL=
PUBLIC_WS_URL=

# Your Vercel URL (fill in after Part 3)
ALLOWED_ORIGINS=["http://localhost:5173"]
```

### Step 3 — Start the backend with Docker

In your terminal, navigate to `ECSI-Attendance-System/` and run:

```bash
docker compose up -d --build backend
```

> We only start `backend` here, not `db` (Supabase is the DB) or `frontend` (Vercel handles that).

Check it started correctly:
```bash
docker compose logs -f backend
```

You should see `Application startup complete` in the logs. Visit http://localhost:8000/docs to confirm the API is live.

### Step 4 — Install Cloudflare Tunnel (cloudflared)

**Windows:**
1. Download the installer from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
2. Run the installer.
3. Open a new terminal and verify: `cloudflared --version`

**Mac:**
```bash
brew install cloudflared
```

**Linux (Ubuntu/Debian):**
```bash
curl -L https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-archive-keyring.gpg > /dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-archive-keyring.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install cloudflared
```

### Step 5 — Start a quick tunnel (no account needed)

Run this to instantly get a public URL for your backend:

```bash
cloudflared tunnel --url http://localhost:8000
```

You'll see output like:
```
Your quick Tunnel has been created! Visit it at:
https://random-words-here.trycloudflare.com
```

**Copy that URL** — this is your backend's public address.

### Step 6 — Update .env with your tunnel URL

Edit `.env`:
```env
PUBLIC_URL=https://random-words-here.trycloudflare.com
PUBLIC_WS_URL=wss://random-words-here.trycloudflare.com
```

Also update ALLOWED_ORIGINS to include your future Vercel URL (you can come back and add it after Part 3):
```env
ALLOWED_ORIGINS=["https://your-app-name.vercel.app","https://random-words-here.trycloudflare.com"]
```

Then restart the backend so it picks up the new CORS settings:
```bash
docker compose restart backend
```

> **Note:** The quick tunnel URL changes every time you restart `cloudflared`. For a permanent URL, see the "Permanent Tunnel" section at the bottom of this guide.

---

## PART 3 — Vercel (React Frontend)

### Step 1 — Push your project to GitHub

If it's not already on GitHub:
```bash
cd "ECSI-Attendance-System"
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/ecsi-attendance.git
git push -u origin main
```

> **Important:** Make sure `.env` is in `.gitignore` so your secrets don't get pushed.

### Step 2 — Create a Vercel account

Go to https://vercel.com and sign up with your GitHub account.

### Step 3 — Import your project

1. On the Vercel dashboard, click **Add New → Project**.
2. Click **Import** next to your `ecsi-attendance` repository.
3. Vercel will auto-detect it as a Vite project.

### Step 4 — Configure the build settings

In the import screen:
- **Framework Preset**: Vite (auto-detected)
- **Root Directory**: Click **Edit** and set it to `frontend`
- **Build Command**: `npm run build` (default)
- **Output Directory**: `dist` (default)

### Step 5 — Set environment variables

Still on the import screen, scroll down to **Environment Variables** and add:

| Name | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://random-words-here.trycloudflare.com/api/v1` |
| `VITE_WS_URL` | `wss://random-words-here.trycloudflare.com/ws/dashboard` |

Replace `random-words-here.trycloudflare.com` with your actual tunnel URL from Part 2, Step 5.

### Step 6 — Deploy

Click **Deploy**. Vercel will build and deploy in ~2 minutes.

When done, you'll get a URL like `https://ecsi-attendance-xyz.vercel.app`. **Copy it.**

### Step 7 — Add Vercel URL to backend CORS

Go back to your `.env` file and update `ALLOWED_ORIGINS`:
```env
ALLOWED_ORIGINS=["https://ecsi-attendance-xyz.vercel.app","https://random-words-here.trycloudflare.com"]
```

Restart the backend:
```bash
docker compose restart backend
```

Then in Vercel, go to your project → **Settings → Environment Variables** and update `VITE_API_BASE_URL` if the tunnel URL changed. Redeploy by going to **Deployments → Redeploy**.

---

## You're live!

| What | URL |
|---|---|
| Frontend | `https://ecsi-attendance-xyz.vercel.app` |
| Backend API | `https://random-words.trycloudflare.com/api/v1` |
| API docs | `https://random-words.trycloudflare.com/docs` |
| Database | Supabase dashboard |

---

## Optional: Permanent Cloudflare Tunnel (free domain)

The quick tunnel URL changes on every restart. For a permanent URL:

1. Sign up at https://dash.cloudflare.com
2. Add your domain (or use a free `*.pages.dev` subdomain).
3. Log in to cloudflared: `cloudflared tunnel login`
4. Create a named tunnel: `cloudflared tunnel create ecsi`
5. Create `~/.cloudflared/config.yml`:
   ```yaml
   tunnel: ecsi
   credentials-file: /root/.cloudflared/<TUNNEL_ID>.json
   ingress:
     - hostname: ecsi.yourdomain.com
       service: http://localhost:8000
     - service: http_status:404
   ```
6. Add DNS: `cloudflared tunnel route dns ecsi ecsi.yourdomain.com`
7. Run: `cloudflared tunnel run ecsi`
8. Make it auto-start: `cloudflared service install`

Then update `.env` and Vercel env vars with the permanent `https://ecsi.yourdomain.com` URL.

---

## Troubleshooting

**CORS error in browser console**
→ Make sure `ALLOWED_ORIGINS` in `.env` includes your exact Vercel URL (with `https://`), then `docker compose restart backend`.

**WebSocket not connecting**
→ Confirm `VITE_WS_URL` starts with `wss://` (not `ws://`) in Vercel env vars.

**Database tables not found**
→ Check backend logs (`docker compose logs backend`). If you see a DB connection error, double-check your Supabase connection string has `postgresql+asyncpg://` and `?prepared_statement_cache_size=0`.

**Tunnel URL expired**
→ Restart `cloudflared tunnel --url http://localhost:8000`, update `VITE_API_BASE_URL` and `VITE_WS_URL` in Vercel, then redeploy.
