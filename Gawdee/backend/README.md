# Gawdee FastAPI Backend

A complete Python **FastAPI** rewrite of the existing PHP backend — same database (SQLite), same logic, no new features or modifications.

## Environment configuration

All configuration lives in `app/core/config.py` (Pydantic `BaseSettings`).
Routes, services and models must import `settings` from there — never read
environment variables directly.

Every variable is **required**: startup aborts immediately if any is missing.

```bash
cp .env.example .env   # then fill in per-environment values
uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Relative paths in `.env` (`GAWDEE_STORAGE`, `GAWDEE_PUBLIC_DIR`) resolve
against the `backend/` directory. Set `SESSION_COOKIE_SECURE=true` and
`ADMIN_COOKIE_SECURE=true` in production behind HTTPS.

## Structure

```
backend/
├── requirements.txt        # Python dependencies
└── app/
    ├── main.py             # FastAPI app, CORS, session middleware, startup
    ├── database.py         # SQLite schema, migration, data access helpers
    ├── commerce.py         # Order creation, pricing, status management, inventory
    ├── integrations.py     # Razorpay, Delhivery, WhatsApp Cloud API, AI (Groq/OpenAI), OTP
    ├── session.py          # Signed-cookie session (replaces PHP sessions)
    └── routers/
        ├── storefront.py   # Public API endpoints (catalog, orders, reviews, wishlist, auth…)
        ├── webhooks.py     # Razorpay & Delhivery webhook handlers
        ├── account.py      # Customer account endpoints
        ├── admin.py        # Admin endpoints (mounted at /api/admin)
        ├── items.py        # Item endpoints
        └── catalog.py      # Catalog endpoints
```

## PHP → Python mapping

| PHP file | Python equivalent |
|---|---|
| `includes/platform.php` | `app/database.py` |
| `includes/commerce.php` | `app/commerce.py` |
| `includes/integrations.php` | `app/integrations.py` |
| `api/catalog.php` | `GET /api/catalog` |
| `api/create-order.php` | `POST /api/create-order` |
| `api/verify-payment.php` | `POST /api/verify-payment` |
| `api/subscribe.php` | `POST /api/subscribe` |
| `api/product-review.php` | `POST /api/product-review` |
| `api/wishlist.php` | `GET/POST /api/wishlist` |
| `api/ai-chat.php` | `POST /api/ai-chat` |
| `api/razorpay-webhook.php` | `POST /api/webhooks/razorpay` |
| `api/delhivery-webhook.php` | `POST /api/webhooks/delhivery` |

## Setup & Run

```bash
cd backend

# Create a virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the dev server
uvicorn app.main:app --reload --port 8001
```

The API will be available at `http://localhost:8001`.  
Interactive docs: `http://localhost:8001/docs`

## Environment variables

| Variable | Purpose |
|---|---|
| `GAWDEE_APP_KEY` | Secret key for encryption (optional — auto-generated if absent) |

> The backend shares the **same SQLite database** at `storage/gawdee.sqlite` as the PHP app. Both can run side-by-side.
