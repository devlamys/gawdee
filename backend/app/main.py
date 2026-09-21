"""
Gawdee FastAPI Backend
Main application entry point
"""

import asyncio

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .database import get_db, migrate
from .loyalty_jobs import loyalty_release_worker
from .session import get_session, save_session
from .routers.storefront import router as storefront_router
from .routers.webhooks import router as webhooks_router
from .routers.account import router as account_router
from .routers.admin import router as admin_router
from .routers.items import router as items_router
from .routers.catalog import router as catalog_router

app = FastAPI(
    title=settings.APP_TITLE,
    description=settings.APP_DESCRIPTION,
    version=settings.APP_VERSION,
)

# ── CORS (origins managed via .env) ─────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Session middleware: flush mutations back to the cookie ────────────────────

@app.middleware("http")
async def session_middleware(request: Request, call_next):
    response: Response = await call_next(request)
    mutations = getattr(request.state, "session_mutations", {})
    if mutations:
        if mutations.pop("_clear", False):
            response.delete_cookie(settings.SESSION_COOKIE_NAME, path=settings.SESSION_COOKIE_PATH)
        else:
            current = await get_session(request)
            current.update(mutations)
            await save_session(response, current)
    return response


# ── Startup: validate config (already loaded — aborts on missing .env) + migrate ──

@app.on_event("startup")
async def startup():
    assert settings.ENVIRONMENT, "ENVIRONMENT is not configured"
    db = await get_db()
    try:
        await migrate(db)
    finally:
        await db.close()
    app.state.loyalty_release_task = asyncio.create_task(loyalty_release_worker())


@app.on_event("shutdown")
async def shutdown():
    task = getattr(app.state, "loyalty_release_task", None)
    if task is not None:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


# ── Mount routers ─────────────────────────────────────────────────────────────

app.include_router(storefront_router, prefix="/api")
app.include_router(webhooks_router, prefix="/api")
app.include_router(account_router, prefix="/api")
app.include_router(items_router, prefix="/api")
app.include_router(catalog_router, prefix="/api")
app.include_router(admin_router, prefix="/api/admin")


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"ok": True, "service": settings.HEALTH_SERVICE_NAME}
