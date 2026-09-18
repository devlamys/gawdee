"""
Gawdee FastAPI Backend
Customer-facing account routes:
  - POST /api/auth/register
  - POST /api/auth/login   (password + OTP)
  - GET  /api/auth/me
  - PATCH /api/account/profile
  - PATCH /api/account/password
  - GET  /api/account/orders
  - GET  /api/account/orders/{order_number}
  - GET  /api/storefront        ← CMS/site settings for the frontend
  - GET  /api/banners
  - GET  /api/testimonials
  - GET  /api/blog              (public blog post listing)
  - GET  /api/blog/{slug}       (single post)
"""

import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
import bcrypt

import aiosqlite

from ..database import (
    get_db, migrate, get_setting,
    get_order_by_id, get_order_items, get_order_events,
)
from ..core.config import settings
from ..session import get_session, set_session_value, clear_session

router = APIRouter()


def _hash_password(plain_password: str) -> str:
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        h = hashed_password or ""
        if h.startswith("$2y$"):
            h = "$2b$" + h[4:]
        return bcrypt.checkpw(plain_password.encode("utf-8"), h.encode("utf-8"))
    except Exception:
        return False


# ── Dependency ────────────────────────────────────────────────────────────────

async def db_dep():
    db = await get_db()
    try:
        await migrate(db)
        yield db
    finally:
        await db.close()


async def get_current_customer(request: Request, db: aiosqlite.Connection = Depends(db_dep)):
    session = await get_session(request)
    cid = session.get("customer_user_id")
    if not cid:
        raise HTTPException(status_code=401, detail="Authentication required.")
    async with db.execute(
        "SELECT id, name, email, role, phone, address1, address2, city, state, pincode, whatsapp_marketing_opt_in, created_at, last_login_at FROM users WHERE id=? AND role='customer'",
        (int(cid),),
    ) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Session is no longer valid.")
    return dict(row)


# ── POST /api/auth/register ───────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    phone: str
    password: str
    password_confirmation: str
    whatsapp_marketing_opt_in: bool = False

@router.post("/auth/register")
async def register(payload: RegisterRequest, request: Request, db: aiosqlite.Connection = Depends(db_dep)):
    name = payload.name.strip()
    email = str(payload.email).lower().strip()
    phone = payload.phone.strip()
    password = payload.password

    if len(name) < 2 or len(name) > 80:
        raise HTTPException(status_code=422, detail={"message": "Enter your full name."})
    if not re.match(r"^[0-9+()\s-]{8,18}$", phone):
        raise HTTPException(status_code=422, detail={"message": "Enter a valid phone number."})
    if len(password) < 8 or not re.search(r"[A-Za-z]", password) or not re.search(r"[0-9]", password):
        raise HTTPException(status_code=422, detail={"message": "Use at least 8 characters with a letter and a number."})
    if password != payload.password_confirmation:
        raise HTTPException(status_code=422, detail={"message": "The password confirmation does not match."})

    marketing_opt_in = 1 if payload.whatsapp_marketing_opt_in else 0
    try:
        await db.execute(
            "INSERT INTO users (name, email, password_hash, role, phone, whatsapp_marketing_opt_in, whatsapp_marketing_opt_in_at) VALUES (?, ?, ?, 'customer', ?, ?, CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE NULL END)",
            (name, email, _hash_password(password), phone, marketing_opt_in, marketing_opt_in),
        )
        async with db.execute("SELECT last_insert_rowid()") as cur:
            user_id = (await cur.fetchone())[0]

        # Link any guest order placed just before registration
        session = await get_session(request)
        last_order = str(session.get("last_order_number", "")).strip()
        if last_order:
            await db.execute(
                "UPDATE orders SET user_id=? WHERE user_id IS NULL AND order_number=? AND LOWER(email)=LOWER(?)",
                (user_id, last_order, email),
            )
        await db.commit()
    except Exception as exc:
        msg = str(exc).lower()
        if "unique" in msg:
            raise HTTPException(status_code=422, detail={"message": "An account already exists for this email. Sign in instead."})
        raise HTTPException(status_code=422, detail={"message": "Unable to create your account right now."})

    await set_session_value(request, "customer_user_id", int(user_id))
    return {"ok": True, "user_id": int(user_id), "name": name, "email": email}


# ── POST /api/auth/login (password) ──────────────────────────────────────────

class LoginRequest(BaseModel):
    identity: str      # email or phone
    password: str
    remember: bool = False

@router.post("/auth/login")
async def login(payload: LoginRequest, request: Request, db: aiosqlite.Connection = Depends(db_dep)):
    # Rate limit: max attempts per window stored in session
    session = await get_session(request)
    import time
    attempts = [t for t in (session.get("customer_login_attempts") or []) if t > time.time() - settings.LOGIN_WINDOW_SECONDS]
    if len(attempts) >= settings.LOGIN_MAX_ATTEMPTS:
        raise HTTPException(status_code=422, detail={"message": "Too many sign-in attempts. Please wait 15 minutes and try again."})

    identity = payload.identity.strip()
    email = identity.lower()
    phone = re.sub(r"\D+", "", identity)

    async with db.execute(
        "SELECT * FROM users WHERE (LOWER(email)=? OR (? != '' AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'+',''),'(',''),')','')=?)) AND role='customer'",
        (email, phone, phone),
    ) as cur:
        user = await cur.fetchone()

    if not user or not _verify_password(payload.password, str(user["password_hash"])):
        attempts.append(time.time())
        await set_session_value(request, "customer_login_attempts", attempts)
        raise HTTPException(status_code=422, detail={"message": "The email, phone number or password is incorrect."})

    user = dict(user)
    await db.execute("UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?", (int(user["id"]),))
    await db.commit()
    await set_session_value(request, "customer_user_id", int(user["id"]))
    await set_session_value(request, "customer_login_attempts", [])

    # Merge guest wishlist
    await _merge_guest_wishlist(request, db, int(user["id"]))

    return {
        "ok": True,
        "customer": {
            "id": user["id"], "name": user["name"], "email": user["email"],
            "phone": user["phone"], "role": user["role"],
        },
    }


async def _merge_guest_wishlist(request: Request, db: aiosqlite.Connection, user_id: int) -> None:
    """Mirrors gawdee_wishlist_merge_guest."""
    session = await get_session(request)
    guest_items = session.get("saved_products", {})
    if not guest_items:
        return
    for key, ids in list(guest_items.items())[:60]:
        if not isinstance(ids, list):
            continue
        try:
            await db.execute(
                "INSERT INTO saved_products(user_id, item_key, product_ids) VALUES(?,?,?) ON CONFLICT(user_id, item_key) DO NOTHING",
                (user_id, key, __import__("json").dumps(ids, ensure_ascii=False)),
            )
        except Exception:
            pass
    await db.commit()
    await set_session_value(request, "saved_products", {})


# ── GET /api/auth/me ──────────────────────────────────────────────────────────

@router.get("/auth/me")
async def me(customer=Depends(get_current_customer)):
    return {"ok": True, "customer": customer}


# ── PATCH /api/account/profile ───────────────────────────────────────────────

class ProfileRequest(BaseModel):
    name: str
    phone: Optional[str] = ""
    address1: Optional[str] = ""
    address2: Optional[str] = ""
    city: Optional[str] = ""
    state: Optional[str] = ""
    pincode: Optional[str] = ""
    whatsapp_marketing_opt_in: bool = False

@router.patch("/account/profile")
async def update_profile(payload: ProfileRequest, customer=Depends(get_current_customer), db: aiosqlite.Connection = Depends(db_dep)):
    name = payload.name.strip()
    phone = (payload.phone or "").strip()
    pincode = (payload.pincode or "").strip()

    if len(name) < 2 or len(name) > 80:
        raise HTTPException(status_code=422, detail={"message": "Enter your full name."})
    if phone and not re.match(r"^[0-9+()\s-]{8,18}$", phone):
        raise HTTPException(status_code=422, detail={"message": "Enter a valid phone number."})
    if pincode and not re.match(r"^[1-9][0-9]{5}$", pincode):
        raise HTTPException(status_code=422, detail={"message": "Enter a valid six-digit pincode."})

    opt_in = 1 if payload.whatsapp_marketing_opt_in else 0
    await db.execute(
        "UPDATE users SET name=?, phone=?, address1=?, address2=?, city=?, state=?, pincode=?, whatsapp_marketing_opt_in=?, whatsapp_marketing_opt_in_at=CASE WHEN ?=1 AND whatsapp_marketing_opt_in=0 THEN CURRENT_TIMESTAMP ELSE whatsapp_marketing_opt_in_at END, whatsapp_opt_out_at=CASE WHEN ?=1 THEN NULL ELSE CURRENT_TIMESTAMP END, updated_at=CURRENT_TIMESTAMP WHERE id=? AND role='customer'",
        (name, phone, (payload.address1 or "").strip(), (payload.address2 or "").strip(), (payload.city or "").strip(), (payload.state or "").strip(), pincode, opt_in, opt_in, opt_in, int(customer["id"])),
    )
    await db.commit()
    return {"ok": True, "message": "Your profile and delivery details were updated."}


# ── PATCH /api/account/password ───────────────────────────────────────────────

class PasswordRequest(BaseModel):
    current_password: str
    new_password: str
    new_password_confirmation: str

@router.patch("/account/password")
async def change_password(payload: PasswordRequest, customer=Depends(get_current_customer), db: aiosqlite.Connection = Depends(db_dep)):
    async with db.execute("SELECT password_hash FROM users WHERE id=?", (int(customer["id"]),)) as cur:
        row = await cur.fetchone()
    if not row or not _verify_password(payload.current_password, str(row["password_hash"])):
        raise HTTPException(status_code=422, detail={"message": "Your current password is incorrect."})
    if len(payload.new_password) < 8 or not re.search(r"[A-Za-z]", payload.new_password) or not re.search(r"[0-9]", payload.new_password):
        raise HTTPException(status_code=422, detail={"message": "Use at least 8 characters with a letter and a number."})
    if payload.new_password != payload.new_password_confirmation:
        raise HTTPException(status_code=422, detail={"message": "The new password confirmation does not match."})
    await db.execute(
        "UPDATE users SET password_hash=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (_hash_password(payload.new_password), int(customer["id"])),
    )
    await db.commit()
    return {"ok": True, "message": "Your password was changed securely."}


# ── GET /api/account/orders ───────────────────────────────────────────────────

@router.get("/account/orders")
async def customer_orders(customer=Depends(get_current_customer), db: aiosqlite.Connection = Depends(db_dep)):
    async with db.execute("SELECT * FROM orders WHERE user_id=? ORDER BY id DESC", (int(customer["id"]),)) as cur:
        rows = await cur.fetchall()
    return {"ok": True, "orders": [dict(r) for r in rows]}


# ── GET /api/account/orders/{order_number} ────────────────────────────────────

@router.get("/account/orders/{order_number}")
async def customer_order_detail(order_number: str, customer=Depends(get_current_customer), db: aiosqlite.Connection = Depends(db_dep)):
    async with db.execute("SELECT * FROM orders WHERE user_id=? AND order_number=?", (int(customer["id"]), order_number)) as cur:
        order = await cur.fetchone()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    order = dict(order)
    items = await get_order_items(db, int(order["id"]))
    events = await get_order_events(db, int(order["id"]))
    order["items"] = items
    order["events"] = events
    return {"ok": True, "order": order}


# ── GET /api/storefront ───────────────────────────────────────────────────────
# Returns site-level settings the frontend needs to render (store name, thresholds, social links, etc.)

@router.get("/storefront")
async def storefront_settings(db: aiosqlite.Connection = Depends(db_dep)):
    public_keys = [
        "store_name", "store_email", "store_phone", "currency",
        "free_shipping_threshold", "shipping_fee", "cod_enabled",
        "offer_code", "offer_percent", "offer_popup_enabled", "offer_popup_image",
        "offer_popup_delay_ms", "ai_chat_enabled",
        "announcement_text", "announcement_url", "header_shop_label", "home_hero_slideshow",
        "footer_description", "footer_signup_title", "footer_signup_text",
        "social_instagram", "social_facebook", "social_youtube", "app_apple", "app_google",
        "brand_name", "brand_logo", "brand_color", "brand_accent", "brand_tagline",
        "site_density", "site_show_whatsapp", "site_show_chat",
        "site_body_font", "site_heading_font", "site_base_font_size",
        "whatsapp_otp_enabled", "whatsapp_cloud_enabled", "whatsapp_order_notifications", "whatsapp_number",
        "page_shipping", "page_returns", "page_contact",
        "site_design_v1", "storefront_collections_v1",
        "use_new_homepage",
    ]
    settings = {}
    for key in public_keys:
        settings[key] = await get_setting(db, key)

    # CMS sections
    async with db.execute("SELECT * FROM cms_sections WHERE is_active=1 ORDER BY sort_order, section_key") as cur:
        rows = await cur.fetchall()
    sections = {r["section_key"]: dict(r) for r in rows}

    # Banners
    async with db.execute("SELECT * FROM banners WHERE is_active=1 ORDER BY sort_order, id") as cur:
        banners = [dict(r) for r in await cur.fetchall()]

    # Razorpay availability (public-safe — key ID only, not secret)
    rp_key_id = await get_setting(db, "razorpay_key_id")
    delhivery_enabled = await get_setting(db, "delhivery_enabled", "0")

    return {
        "ok": True,
        "settings": settings,
        "sections": sections,
        "banners": banners,
        "razorpay_key_id": rp_key_id,
        "razorpay_enabled": bool(rp_key_id and await get_setting(db, "razorpay_key_secret")),
        "delhivery_enabled": delhivery_enabled == "1",
    }


# ── GET /api/hero-slides ────────────────────────────────────────────────────
# Active Animated-hero 3D carousel slides (managed in Admin > Animated hero).
# All columns are display-safe: labels, image paths, cart id/name/price.

@router.get("/hero-slides")
async def hero_slides(db: aiosqlite.Connection = Depends(db_dep)):
    async with db.execute("SELECT * FROM hero_banners_two WHERE is_active=1 ORDER BY sort_order, id") as cur:
        rows = await cur.fetchall()
    return {"ok": True, "slides": [dict(r) for r in rows]}


# ── GET /api/testimonials ─────────────────────────────────────────────────────

@router.get("/testimonials")
async def testimonials(db: aiosqlite.Connection = Depends(db_dep)):
    async with db.execute("SELECT * FROM testimonials WHERE is_active=1 ORDER BY sort_order, id") as cur:
        rows = await cur.fetchall()
    return {"ok": True, "testimonials": [dict(r) for r in rows]}


# ── GET /api/homepage-media ───────────────────────────────────────────────────

@router.get("/homepage-media")
async def homepage_media(section: Optional[str] = None, db: aiosqlite.Connection = Depends(db_dep)):
    if section:
        async with db.execute(
            "SELECT * FROM homepage_media WHERE is_active=1 AND section_key=? ORDER BY sort_order, id", (section,)
        ) as cur:
            rows = await cur.fetchall()
    else:
        async with db.execute("SELECT * FROM homepage_media WHERE is_active=1 ORDER BY section_key, sort_order, id") as cur:
            rows = await cur.fetchall()
    return {"ok": True, "media": [dict(r) for r in rows]}


# ── GET /api/video-testimonials ───────────────────────────────────────────────

@router.get("/video-testimonials")
async def video_testimonials(db: aiosqlite.Connection = Depends(db_dep)):
    async with db.execute("SELECT * FROM video_testimonials WHERE is_active=1 ORDER BY sort_order, id") as cur:
        rows = await cur.fetchall()
    return {"ok": True, "video_testimonials": [dict(r) for r in rows]}


# ── GET /api/blog ─────────────────────────────────────────────────────────────

@router.get("/blog")
async def blog_list(db: aiosqlite.Connection = Depends(db_dep)):
    async with db.execute(
        "SELECT id, title, slug, excerpt, category, author, featured_image, is_featured, published_at, created_at FROM blog_posts WHERE status='published' ORDER BY published_at DESC, id DESC LIMIT ?",
        (settings.BLOG_LIST_LIMIT,),
    ) as cur:
        rows = await cur.fetchall()
    return {"ok": True, "posts": [dict(r) for r in rows]}


# ── GET /api/blog/{slug} ──────────────────────────────────────────────────────

@router.get("/blog/{slug}")
async def blog_post(slug: str, db: aiosqlite.Connection = Depends(db_dep)):
    async with db.execute(
        "SELECT * FROM blog_posts WHERE slug=? AND status='published'", (slug,)
    ) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Post not found.")
    return {"ok": True, "post": dict(row)}
