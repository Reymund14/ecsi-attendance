# ECSI Attendance System — Deployment Guide (on-prem / Docker)

> **Superseded for cloud deployment.** These steps describe running everything
> on one machine with Docker Compose plus a **Cloudflare Tunnel**, which requires
> a physically connected webcam and RFID reader. For the Vercel + Render +
> Supabase setup, see **[DEPLOYMENT.md](./DEPLOYMENT.md)**.
>
> Keep this file for on-prem deployments where the camera/RFID hardware must
> live next to the backend.

## Prerequisites

- Docker + Docker Compose installed on the host machine
- USB webcam and RFID reader physically connected
- A free [Cloudflare account](https://dash.cloudflare.com/sign-up) (for public access)

---

## Step 1 — Prepare your environment file

```bash
cp .env.production .env
```

Edit `.env` and fill in:

| Variable | What to set |
|---|---|
| `SECRET_KEY` | Run `python3 -c "import secrets; print(secrets.token_hex(32))"` and paste the output |
| `DB_PASSWORD` | Any strong password |
| `PUBLIC_URL` | Your public URL (set this after Step 3 if using Cloudflare Tunnel) |
| `PUBLIC_WS_URL` | Same domain but `wss://` instead of `https://` |

---

## Step 2 — Build and start all services

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

This starts:
- **PostgreSQL** (internal only)
- **FastAPI backend** on internal port 8000
- **Nginx + React frontend** on port **80**

Check logs:
```bash
docker compose logs -f
```

---

## Step 3 — Expose publicly with Cloudflare Tunnel (free)

### One-time setup

1. Install `cloudflared`:
   ```bash
   # Linux (Debian/Ubuntu)
   curl -L https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-archive-keyring.gpg > /dev/null
   echo "deb [signed-by=/usr/share/keyrings/cloudflare-archive-keyring.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
   sudo apt update && sudo apt install cloudflared

   # Windows — download installer from:
   # https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
   ```

2. Log in:
   ```bash
   cloudflared tunnel login
   ```

3. Create a named tunnel:
   ```bash
   cloudflared tunnel create ecsi-tunnel
   ```

4. Create `~/.cloudflared/config.yml`:
   ```yaml
   tunnel: ecsi-tunnel
   credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

   ingress:
     - hostname: ecsi.yourdomain.com   # replace with your domain
       service: http://localhost:80
     - service: http_status:404
   ```

5. Add DNS record (routes your domain to the tunnel):
   ```bash
   cloudflared tunnel route dns ecsi-tunnel ecsi.yourdomain.com
   ```

6. Start the tunnel:
   ```bash
   cloudflared tunnel run ecsi-tunnel
   ```

7. Update `.env`:
   ```
   PUBLIC_URL=https://ecsi.yourdomain.com
   PUBLIC_WS_URL=wss://ecsi.yourdomain.com
   ```
   Then rebuild the frontend:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build frontend
   ```

### Quick test (no domain needed)

For a temporary public URL without a domain:
```bash
cloudflared tunnel --url http://localhost:80
```
You'll get a random `*.trycloudflare.com` URL. Update `PUBLIC_URL` and `PUBLIC_WS_URL` with it and rebuild the frontend.

### Run tunnel as a system service (auto-start on reboot)

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

---

## Useful commands

```bash
# View running containers
docker compose ps

# Restart a single service
docker compose restart backend

# View backend logs
docker compose logs -f backend

# Stop everything
docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# Stop and delete database volume (WARNING: destroys all data)
docker compose down -v
```

---

## Hardware notes

- **Webcam**: must be `/dev/video0` on the host. If it's a different index, update `CAMERA_SOURCE` in `.env`.
- **RFID (Serial)**: if your reader is serial (not USB HID), set `RFID_MODE=SERIAL` and `RFID_PORT=/dev/ttyUSB0`. You may need to add the `devices` entry back to `docker-compose.prod.yml`.
- **Permissions**: if the container can't access `/dev/video0`, run `sudo chmod 666 /dev/video0` on the host.
