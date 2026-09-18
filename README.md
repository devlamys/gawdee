# Gawdee — Natural Foods & Wellness Brand

Full-stack e-commerce app for Gawdee:

- **backend/** — Python FastAPI API (SQLite, same DB/logic as the original PHP backend)
- **frontend/** — Next.js 16 storefront (React 19, proxied `/api` → backend)

## Project structure

```
Gawdee/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app, CORS, session middleware, startup
│   │   ├── database.py       # SQLite schema, migration, data access helpers
│   │   ├── commerce.py       # Orders, pricing, status, inventory
│   │   ├── integrations.py   # Razorpay, Delhivery, WhatsApp, AI (Groq/OpenAI), OTP
│   │   ├── session.py        # Signed-cookie session (replaces PHP sessions)
│   │   ├── core/config.py    # ALL env config (Pydantic BaseSettings)
│   │   └── routers/          # storefront, webhooks, account, admin, items, catalog
│   ├── storage/              # SQLite DB (gawdee.sqlite, gitignored)
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/                  # app/, components/, config/env.ts, context/, lib/
│   ├── public/               # static assets (backend GAWDEE_PUBLIC_DIR points here)
│   ├── next.config.ts        # rewrites /api/:path* → BACKEND_ORIGIN/api/:path*
│   ├── package.json
│   └── .env.example
└── docs/                     # product-variant-image audit / implementation notes
```

## Prerequisites

| Tool | Version used |
|---|---|
| Python | 3.14+ (`python3 --version`) |
| Node.js | 24+ (`node --version`) |
| npm | 11+ (`npm --version`) |

## Quick start (run both)

Open **two terminals**:

**Terminal 1 — backend (http://localhost:8001):**
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then fill in values (all variables are REQUIRED)
uvicorn app.main:app --reload --port 8001
```

**Terminal 2 — frontend (http://localhost:3000):**
```bash
cd frontend
npm install
cp .env.example .env.local   # then adjust if backend is not on localhost:8001
npm run dev
```

Open http://localhost:3000 — API calls to `/api/*` are rewritten to the backend.
Backend interactive docs: http://localhost:8001/docs

## Run — backend (FastAPI)

```bash
cd backend

# 1. Virtual env
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# 2. Dependencies
pip install -r requirements.txt

# 3. Env (REQUIRED — startup aborts if any var is missing)
cp .env.example .env
# Generate GAWDEE_APP_KEY:
python -c "import secrets,base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"

# 4. Dev server with auto-reload
uvicorn app.main:app --reload --port 8001

# Production-style (no reload, explicit host)
uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Notes:
- Relative paths in `.env` (`GAWDEE_STORAGE`, `GAWDEE_PUBLIC_DIR`) resolve against `backend/`.
- Shares the SQLite DB at `storage/gawdee.sqlite`.
- Set `SESSION_COOKIE_SECURE=true` / `ADMIN_COOKIE_SECURE=true` in production behind HTTPS.
- Health check: `GET http://localhost:8001/api/health`

Full backend details: [`backend/README.md`](backend/README.md)

## Run — frontend (Next.js)

```bash
cd frontend

# 1. Dependencies
npm install

# 2. Env
cp .env.example .env.local
# Defaults work for local dev:
#   BACKEND_ORIGIN=http://localhost:8001   (used by next.config.ts rewrites)
#   INTERNAL_API_URL=http://127.0.0.1:8001/api  (server-only, SSR/route handlers)
#   NEXT_PUBLIC_API_URL=/api                (browser, via Next.js proxy)

# 3. Dev server
npm run dev        # http://localhost:3000

# 4. Production build
npm run build
npm run start      # serves optimized build (needs backend running too)

# 5. Lint
npm run lint
```

Notes:
- Browser code must read env only via `@/config/env` (see `src/config/env.ts`) — never `process.env` directly.
- `NEXT_PUBLIC_*` vars are inlined at **build time** — rebuild after changing them.
- `next.config.ts` proxies `/api/:path*` → `${BACKEND_ORIGIN}/api/:path*`, so the browser never calls the backend directly.

Full frontend details: [`frontend/README.md`](frontend/README.md)

## Ports & URLs

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8001 |
| API docs (Swagger) | http://localhost:8001/docs |
| Health check | http://localhost:8001/api/health |

## Environment files

| File | Purpose |
|---|---|
| `backend/.env.example` | All backend vars (copy to `backend/.env`) |
| `frontend/.env.example` | All storefront vars (copy to `frontend/.env.local`) |

Never commit `.env` / `.env.local` / `*.sqlite` (already gitignored).

## Docs

- [`backend/README.md`](backend/README.md) — backend setup, structure, PHP → Python mapping
- [`frontend/README.md`](frontend/README.md) — frontend setup, scripts, env rules
- [`docs/`](docs/) — product-variant-image audit & implementation reports
