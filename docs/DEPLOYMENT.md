# Deployment Guide

Production-style deployment of the School Management System on a single Linux VM. **Honesty note:** this exact deployment was *not* executed in the development workspace (no cloud account is available there). Everything below is documented, standard, and verified against the way this codebase is built — but the steps marked ⚠️ still require manual execution with real infrastructure (domain, TLS, secrets).

## 1. Target architecture

```text
Internet
   │ HTTPS (443, TLS)
   ▼
Caddy or nginx (reverse proxy + TLS)
   ├── /        → frontend static files (frontend/dist)
   └── /api/*   → http://127.0.0.1:4000 (Node backend)
                    │
                    ▼
              MongoDB 7.x (localhost or private network, auth enabled)
```

## 2. Prepare the VM

```bash
sudo apt update && sudo apt install -y nodejs npm mongodb-org nginx   # ⚠️ or install via nodesource/tarballs
sudo systemctl enable --now mongod
node -v   # ≥ 18
```

## 3. Deploy the backend

```bash
sudo mkdir -p /opt/sms && sudo chown $USER /opt/sms
cd /opt/sms
# ⚠️ copy the project (git clone / rsync) — the repo must never contain real .env secrets

cd backend
npm ci --omit=dev          # production dependencies only
cp .env.example .env
# ⚠️ edit .env: real MONGODB_URI with auth, strong JWT secrets, NODE_ENV=production,
#    FRONTEND_URL=https://school.example.com, tighter rate limits

# Enable MongoDB authentication and create an application user ⚠️
# (mongosh): db.createUser({user:'sms', pwd:'<strong>', roles:[{role:'readWrite', db:'school_management'}]})

npm run typecheck && npm run build
npm install -g pm2        # process manager
pm2 start dist/server.js --name sms-backend
pm2 save && pm2 startup
```

Do **not** run `npm run seed` on production unless you intend to create the demo dataset.

## 4. Deploy the frontend

```bash
cd /opt/sms/frontend
npm ci
# Build with the production API origin baked in ⚠️
VITE_API_URL=https://api.school.example.com npx tsc --noEmit && npm run build
sudo mkdir -p /var/www/sms && sudo cp -r dist/* /var/www/sms/
```

## 5. Reverse proxy (nginx example) ⚠️

```nginx
server {
  listen 80;
  server_name school.example.com;

  root /var/www/sms;
  index index.html;
  location / { try_files $uri /index.html; }

  location /api/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

TLS via `certbot --nginx -d school.example.com` ⚠️ (Let's Encrypt). The backend trusts exactly one proxy hop (`trust proxy 1`) so rate limiting sees the real client IP.

## 6. MongoDB production checklist ⚠️

- Authentication enabled (required).
- Bind to localhost or a private network — never 0.0.0.0 without firewall rules.
- Storage budget: **512 MB**. Track it with `npm run storage:report` / `GET /api/system/storage`; thresholds 70/80/90 %.
- Nightly backups — see `docs/BACKUP_RESTORE.md`.

## 7. Verify the deployment

```bash
curl -s https://school.example.com/api/health        # { server, database, uptime, environment, timestamp }
curl -s -o /dev/null -w '%{http_code}' https://school.example.com/   # 200
node tests/auth.test.mjs https://school.example.com   # run from a machine with network access (optional)
```

## 8. Updates & rollback

```bash
pm2 stop sms-backend
cd /opt/sms/backend && git pull && npm ci --omit=dev && npm run build
# if schemas changed: review index plan — npm run indexes:audit (dev only)
pm2 start sms-backend
```

Rollback: redeploy the previous commit + `mongorestore` the pre-upgrade dump if data was migrated.

## 9. What was actually performed in the workspace (vs. documented)

| Item | Performed here? |
| --- | --- |
| Backend typecheck + production build (`dist/`) | ✅ yes |
| Frontend typecheck + production build (`frontend/dist/`) | ✅ yes |
| Live MongoDB 7.0 with full dataset | ✅ yes (local dev instance) |
| All nine test suites (505 checks) | ✅ yes, against the live stack |
| Storage report + index audit against live DB | ✅ yes |
| Cloud VM, DNS, TLS, PM2, nginx | ❌ not executed — documented steps only |
