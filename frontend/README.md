# Gawdee Storefront (Next.js)

Next.js 16 + React 19 storefront for Gawdee. API calls to `/api/*` are proxied to the FastAPI backend via `next.config.ts` rewrites.

## Prerequisites

- Node.js 24+ (`node --version`)
- Backend running at `http://localhost:8001` (see `../backend/README.md`)

## Setup & Run

```bash
cd frontend

# 1. Install dependencies
npm install

# 2. Env (defaults work for local dev)
cp .env.example .env.local

# 3. Dev server
npm run dev
```

Open http://localhost:3000.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server with hot reload (http://localhost:3000) |
| `npm run build` | Production build |
| `npm run start` | Serve production build (run `build` first, backend must be up) |
| `npm run lint` | ESLint |

## Environment

| Variable | Where | Purpose / default |
|---|---|---|
| `BACKEND_ORIGIN` | build (`next.config.ts` only) | Backend for `/api` rewrites (`http://localhost:8001`) |
| `ALLOWED_DEV_ORIGINS` | build | Extra dev origins (`localhost,127.0.0.1`) |
| `INTERNAL_API_URL` | server-only | SSR / route handlers (`http://127.0.0.1:8001/api`) |
| `NEXT_PUBLIC_API_URL` | browser | Browser API base (`/api`, via proxy) |
| `NEXT_PUBLIC_RAZORPAY_CHECKOUT_URL` | browser | Razorpay checkout.js script |
| `NEXT_PUBLIC_LOTTIE_URL` / `NEXT_PUBLIC_CONFETTI_URL` | browser | Animation/effects CDN scripts |
| `NEXT_PUBLIC_CURRENCY` | browser | Currency code (`INR`) |
| `NEXT_PUBLIC_DEFAULT_*` | browser | Fallback brand/shipping display until backend `/storefront` loads |

Rules:
- Runtime code must import env from `@/config/env` (`src/config/env.ts`) — never read `process.env` directly.
- `NEXT_PUBLIC_*` values are inlined at **build time** — rebuild after changing them.

## How it connects to the backend

`next.config.ts` rewrites every `/api/:path*` request to `${BACKEND_ORIGIN}/api/:path*`, so the browser always calls same-origin `/api/...` and Next.js forwards it to FastAPI. Server components / route handlers use `INTERNAL_API_URL` to reach the backend directly.
