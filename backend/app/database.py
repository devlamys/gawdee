"""
Gawdee FastAPI Backend
Database layer — mirrors includes/platform.php and includes/commerce.php
"""

import aiosqlite
import json
import hashlib
import hmac
import base64
import secrets
import re
from datetime import datetime, timezone
from typing import Optional
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .core.config import settings

# ── Secret key (from GAWDEE_APP_KEY via app.core.config — never os.environ here) ──

def get_secret_key() -> bytes:
    decoded = base64.b64decode(settings.GAWDEE_APP_KEY)
    if len(decoded) < 32:
        raise RuntimeError("Application encryption key is invalid.")
    return decoded[:32]


# ── Encryption (mirrors gawdee_encrypt / gawdee_decrypt) ────────────────────

def encrypt_value(plain_text: str) -> str:
    if not plain_text:
        return ""
    aesgcm = AESGCM(get_secret_key())
    iv = secrets.token_bytes(12)
    cipher = aesgcm.encrypt(iv, plain_text.encode(), None)
    # cipher = ciphertext + 16-byte tag (appended by AESGCM)
    tag = cipher[-16:]
    ciphertext = cipher[:-16]
    payload = json.dumps({
        "iv": base64.b64encode(iv).decode(),
        "tag": base64.b64encode(tag).decode(),
        "data": base64.b64encode(ciphertext).decode(),
    })
    return base64.b64encode(payload.encode()).decode()


def decrypt_value(payload_b64: str) -> str:
    if not payload_b64:
        return ""
    try:
        decoded = json.loads(base64.b64decode(payload_b64).decode())
        iv = base64.b64decode(decoded["iv"])
        tag = base64.b64decode(decoded["tag"])
        data = base64.b64decode(decoded["data"])
        aesgcm = AESGCM(get_secret_key())
        plain = aesgcm.decrypt(iv, data + tag, None)
        return plain.decode()
    except Exception:
        return ""


# ── Database connection ──────────────────────────────────────────────────────

async def get_db() -> aiosqlite.Connection:
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    db = await aiosqlite.connect(str(settings.db_path))
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA foreign_keys = ON")
    await db.execute("PRAGMA journal_mode = WAL")
    await db.execute(f"PRAGMA busy_timeout = {settings.DB_BUSY_TIMEOUT_MS}")
    return db


async def execute(query: str, params: tuple = ()) -> None:
    db = await get_db()
    try:
        await db.execute(query, params)
        await db.commit()
    finally:
        await db.close()


async def fetch_one(query: str, params: tuple = ()) -> Optional[dict]:
    db = await get_db()
    try:
        async with db.execute(query, params) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None
    finally:
        await db.close()


async def fetch_all(query: str, params: tuple = ()) -> list[dict]:
    db = await get_db()
    try:
        async with db.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]
    finally:
        await db.close()


# ── Migration (mirrors gawdee_migrate) ───────────────────────────────────────

CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    phone TEXT NOT NULL DEFAULT '',
    address1 TEXT NOT NULL DEFAULT '',
    address2 TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT '',
    pincode TEXT NOT NULL DEFAULT '',
    whatsapp_marketing_opt_in INTEGER NOT NULL DEFAULT 0,
    whatsapp_marketing_opt_in_at TEXT,
    whatsapp_opt_out_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL DEFAULT '',
    is_secret INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS saved_products (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_key TEXT NOT NULL,
    product_ids TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, item_key)
);

CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    full_name TEXT NOT NULL,
    category TEXT NOT NULL,
    category_key TEXT NOT NULL,
    tag TEXT NOT NULL DEFAULT '',
    price INTEGER NOT NULL,
    original_price INTEGER NOT NULL,
    weight TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    accent TEXT NOT NULL DEFAULT '#0a7540',
    stock INTEGER NOT NULL DEFAULT 100,
    stock_status TEXT NOT NULL DEFAULT 'in_stock',
    sku TEXT NOT NULL DEFAULT '',
    source_id TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    rating REAL NOT NULL DEFAULT 0,
    review_count INTEGER NOT NULL DEFAULT 0,
    gallery_json TEXT NOT NULL DEFAULT '[]',
    details_json TEXT NOT NULL DEFAULT '{}',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    flavor TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    hover_image_url TEXT NOT NULL DEFAULT '',
    customer_review TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    category_key TEXT NOT NULL DEFAULT '',
    category_id INTEGER NULL REFERENCES category(id) ON DELETE SET NULL,
    tag TEXT NOT NULL DEFAULT '',
    accent TEXT NOT NULL DEFAULT '#0a7540',
    rating REAL NOT NULL DEFAULT 0,
    review_count INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS variant (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    variant_name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    sku TEXT NOT NULL DEFAULT '',
    stock INTEGER NOT NULL DEFAULT 0,
    mrp INTEGER NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    selling_price INTEGER NOT NULL DEFAULT 0,
    is_inclusive INTEGER NOT NULL DEFAULT 1,
    is_lab_tested INTEGER NOT NULL DEFAULT 1,
    is_natural INTEGER NOT NULL DEFAULT 1,
    uom TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    legacy_product_id TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS variant_image (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    variant_id INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (variant_id) REFERENCES variant(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS banners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    desktop_image TEXT NOT NULL,
    mobile_image TEXT NOT NULL DEFAULT '',
    link_url TEXT NOT NULL DEFAULT '#shop',
    alt_text TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS category (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    filter TEXT NOT NULL DEFAULT 'all',
    image_url TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT '',
    parent_id INTEGER NULL REFERENCES category(id) ON DELETE SET NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hero_banners_two (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    headline TEXT NOT NULL DEFAULT '',
    eyebrow TEXT NOT NULL DEFAULT '',
    subtitle TEXT NOT NULL DEFAULT '',
    desktop_video TEXT NOT NULL DEFAULT '',
    mobile_video TEXT NOT NULL DEFAULT '',
    duration INTEGER NOT NULL DEFAULT 1,
    link_url TEXT NOT NULL DEFAULT '#shop',
    alt_text TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cat TEXT NOT NULL DEFAULT '',
    title_html TEXT NOT NULL DEFAULT '',
    word TEXT NOT NULL DEFAULT '',
    sub TEXT NOT NULL DEFAULT '',
    price_label TEXT NOT NULL DEFAULT '',
    mrp_label TEXT NOT NULL DEFAULT '',
    off_badge TEXT NOT NULL DEFAULT '',
    reviews_label TEXT NOT NULL DEFAULT '',
    product_image TEXT NOT NULL DEFAULT '',
    cart_id TEXT NOT NULL DEFAULT '',
    cart_name TEXT NOT NULL DEFAULT '',
    cart_price INTEGER NOT NULL DEFAULT 0,
    cart_image TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS cms_sections (
    section_key TEXT PRIMARY KEY,
    eyebrow TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    subtitle TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    mobile_image TEXT NOT NULL DEFAULT '',
    video_url TEXT NOT NULL DEFAULT '',
    button_label TEXT NOT NULL DEFAULT '',
    button_url TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS testimonials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    initials TEXT NOT NULL DEFAULT '',
    avatar TEXT NOT NULL DEFAULT '',
    product_name TEXT NOT NULL DEFAULT '',
    product_slug TEXT NOT NULL DEFAULT '',
    quote TEXT NOT NULL,
    rating INTEGER NOT NULL DEFAULT 5,
    theme TEXT NOT NULL DEFAULT 'ghee',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS homepage_media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_key TEXT NOT NULL DEFAULT 'reels',
    media_type TEXT NOT NULL DEFAULT 'image',
    title TEXT NOT NULL DEFAULT '',
    subtitle TEXT NOT NULL DEFAULT '',
    file_path TEXT NOT NULL DEFAULT '',
    poster_path TEXT NOT NULL DEFAULT '',
    external_url TEXT NOT NULL DEFAULT '',
    link_url TEXT NOT NULL DEFAULT '',
    alt_text TEXT NOT NULL DEFAULT '',
    product_slug TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS video_testimonials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role_location TEXT NOT NULL DEFAULT '',
    quote TEXT NOT NULL DEFAULT '',
    rating INTEGER NOT NULL DEFAULT 5,
    video_type TEXT NOT NULL DEFAULT 'upload',
    video_path TEXT NOT NULL DEFAULT '',
    poster_path TEXT NOT NULL DEFAULT '',
    external_url TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cms_section_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_key TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'ph-leaf',
    title TEXT NOT NULL,
    subtitle TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    link_url TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blog_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    excerpt TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    source TEXT NOT NULL DEFAULT 'manual',
    ai_provider TEXT NOT NULL DEFAULT '',
    meta_description TEXT NOT NULL DEFAULT '',
    featured_image TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'Wellness',
    author TEXT NOT NULL DEFAULT 'Gawdee editorial',
    is_featured INTEGER NOT NULL DEFAULT 0,
    published_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    order_number TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    payment_method TEXT NOT NULL DEFAULT 'razorpay',
    payment_status TEXT NOT NULL DEFAULT 'pending',
    shipment_status TEXT NOT NULL DEFAULT 'not_created',
    currency TEXT NOT NULL DEFAULT 'INR',
    subtotal INTEGER NOT NULL,
    shipping INTEGER NOT NULL DEFAULT 0,
    discount INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL,
    coupon_code TEXT NOT NULL DEFAULT '',
    checkout_token TEXT NOT NULL DEFAULT '',
    customer_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    address1 TEXT NOT NULL,
    address2 TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    pincode TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    razorpay_order_id TEXT NOT NULL DEFAULT '',
    razorpay_payment_id TEXT NOT NULL DEFAULT '',
    razorpay_signature TEXT NOT NULL DEFAULT '',
    delhivery_waybill TEXT NOT NULL DEFAULT '',
    delhivery_tracking_url TEXT NOT NULL DEFAULT '',
    delhivery_label_url TEXT NOT NULL DEFAULT '',
    delhivery_last_status TEXT NOT NULL DEFAULT '',
    delhivery_last_sync_at TEXT,
    dtdc_reference TEXT NOT NULL DEFAULT '',
    dtdc_tracking_url TEXT NOT NULL DEFAULT '',
    fulfillment_mode TEXT NOT NULL DEFAULT 'manual',
    courier_name TEXT NOT NULL DEFAULT '',
    tracking_number TEXT NOT NULL DEFAULT '',
    tracking_url TEXT NOT NULL DEFAULT '',
    inventory_status TEXT NOT NULL DEFAULT 'not_deducted',
    source TEXT NOT NULL DEFAULT 'storefront',
    admin_note TEXT NOT NULL DEFAULT '',
    payment_error TEXT NOT NULL DEFAULT '',
    paid_at TEXT,
    fulfilled_at TEXT,
    cancelled_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price INTEGER NOT NULL,
    image TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    order_id INTEGER,
    adjustment INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS integration_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    integration TEXT NOT NULL,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    reference TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    rating INTEGER NOT NULL,
    review TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'approved',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS order_status_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customer_otps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    phone TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'login',
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    requested_ip_hash TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    consumed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notification_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    user_id INTEGER,
    channel TEXT NOT NULL DEFAULT 'whatsapp',
    notification_type TEXT NOT NULL,
    recipient TEXT NOT NULL,
    template_name TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'en_US',
    variables_json TEXT NOT NULL DEFAULT '[]',
    dedupe_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'queued',
    attempts INTEGER NOT NULL DEFAULT 0,
    provider_message_id TEXT NOT NULL DEFAULT '',
    error_message TEXT NOT NULL DEFAULT '',
    scheduled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    event_key TEXT NOT NULL,
    event_type TEXT NOT NULL DEFAULT '',
    payload_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'received',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TEXT,
    UNIQUE(provider, event_key)
);
"""

CREATE_INDEXES_SQL = [
    "CREATE INDEX IF NOT EXISTS idx_products_category_key ON products(category_key)",
    "CREATE INDEX IF NOT EXISTS idx_testimonials_active ON testimonials(is_active, sort_order, id)",
    "CREATE INDEX IF NOT EXISTS idx_homepage_media_section ON homepage_media(section_key, is_active, sort_order, id)",
    "CREATE INDEX IF NOT EXISTS idx_video_testimonials_active ON video_testimonials(is_active, sort_order, id)",
    "CREATE INDEX IF NOT EXISTS idx_cms_section_items_section ON cms_section_items(section_key, is_active, sort_order, id)",
    "CREATE INDEX IF NOT EXISTS idx_product_reviews_status ON product_reviews(status, product_id, id)",
    "CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status, published_at, id)",
    "CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_checkout_token ON orders(checkout_token) WHERE checkout_token != ''",
    "CREATE INDEX IF NOT EXISTS idx_orders_workflow ON orders(status, payment_status, shipment_status, id)",
    "CREATE INDEX IF NOT EXISTS idx_order_status_events_order_id ON order_status_events(order_id, id)",
    "CREATE INDEX IF NOT EXISTS idx_inventory_events_product_id ON inventory_events(product_id, id)",
    "CREATE INDEX IF NOT EXISTS idx_inventory_events_order_id ON inventory_events(order_id, id)",
    "CREATE INDEX IF NOT EXISTS idx_customer_otps_lookup ON customer_otps(phone, purpose, status, id)",
    "CREATE INDEX IF NOT EXISTS idx_customer_otps_rate ON customer_otps(requested_ip_hash, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_notification_queue_delivery ON notification_queue(status, scheduled_at, id)",
    "CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON webhook_events(provider, created_at)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_items_slug ON items(slug)",
    "CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_key, is_active, id)",
    "CREATE INDEX IF NOT EXISTS idx_items_category_id ON items(category_id)",
    "CREATE INDEX IF NOT EXISTS idx_category_parent_id ON category(parent_id)",
    "CREATE INDEX IF NOT EXISTS idx_variants_item ON variant(item_id, is_active, id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_variants_slug ON variant(slug)",
    "CREATE INDEX IF NOT EXISTS idx_variants_sku ON variant(sku)",
    "CREATE INDEX IF NOT EXISTS idx_variants_legacy ON variant(legacy_product_id)",
    "CREATE INDEX IF NOT EXISTS idx_images_variant ON variant_image(variant_id, is_active, sort_order, id)",
]

DEFAULT_SETTINGS = {
    "store_name": "Gawdee",
    "store_email": "info@gawdee.com",
    "store_phone": "+91 70552 07030",
    "currency": "INR",
    "free_shipping_threshold": "999",
    "shipping_fee": "99",
    "cod_enabled": "1",
    "dtdc_enabled": "0",
    "delhivery_enabled": "0",
    "delhivery_environment": "staging",
    "delhivery_pickup_location": "",
    "delhivery_client_name": "",
    "delhivery_origin_name": "Gawdee Warehouse",
    "delhivery_origin_phone": "",
    "delhivery_origin_address": "",
    "delhivery_origin_city": "",
    "delhivery_origin_state": "",
    "delhivery_origin_pincode": "",
    "delhivery_default_weight_grams": "500",
    "delhivery_default_length_cm": "20",
    "delhivery_default_width_cm": "15",
    "delhivery_default_height_cm": "10",
    "whatsapp_cloud_enabled": "0",
    "whatsapp_graph_version": "v23.0",
    "whatsapp_phone_number_id": "",
    "whatsapp_business_account_id": "",
    "whatsapp_language": "en_US",
    "whatsapp_otp_enabled": "0",
    "whatsapp_order_notifications": "1",
    "whatsapp_marketing_enabled": "0",
    "whatsapp_template_otp": "gawdee_login_otp",
    "whatsapp_template_order_confirmed": "gawdee_order_confirmed",
    "whatsapp_template_payment_confirmed": "gawdee_payment_confirmed",
    "whatsapp_template_order_packed": "gawdee_order_packed",
    "whatsapp_template_order_shipped": "gawdee_order_shipped",
    "whatsapp_template_order_delivered": "gawdee_order_delivered",
    "whatsapp_template_order_cancelled": "gawdee_order_cancelled",
    "whatsapp_template_marketing": "gawdee_marketing_update",
    "offer_code": "FREEDOM10",
    "offer_percent": "10",
    "offer_popup_enabled": "1",
    "offer_popup_image": "assets/images/independence-offer-popup-v1.webp",
    "offer_popup_delay_ms": "850",
    "ai_provider": "groq",
    "groq_model": "llama-3.3-70b-versatile",
    "openai_model": "gpt-5.6-luna",
    "ai_chat_enabled": "1",
    "ai_auto_blog_enabled": "0",
    "ai_blog_frequency_days": "7",
    "ai_blog_topics": "traditional Indian foods, ingredient transparency, family wellness, mindful nutrition",
    "ai_last_blog_at": "",
    "razorpay_key_id": "",
    "dtdc_booking_endpoint": "",
    "dtdc_tracking_endpoint": "",
    "dtdc_customer_code": "",
    "dtdc_service_type": "EXPRESS",
    "dtdc_pickup_pincode": "",
    "site_body_font": "system",
    "site_heading_font": "system",
    "site_base_font_size": "16",
}


DOMAIN_SCHEMA_VERSION = 2


async def _table_exists(db: aiosqlite.Connection, name: str) -> bool:
    async with db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1", (name,)) as cur:
        return await cur.fetchone() is not None


async def _column_exists(db: aiosqlite.Connection, table: str, column: str) -> bool:
    async with db.execute(f"PRAGMA table_info({table})") as cur:
        return any(r["name"] == column for r in await cur.fetchall())


async def _parse_uom(variant_name: str) -> str:
    """Derive a unit-of-measure token from a variant name like '500 ml'."""
    m = re.search(r"([A-Za-z]{1,10})\s*$", (variant_name or "").strip())
    return m.group(1) if m else ""


async def migrate_domain_v2(db: aiosqlite.Connection) -> None:
    """Phase 2 domain migration: category / variant / variant_image (+ parent_id,
    category_id, uom, selling_price/stock/is_inclusive renames).

    Idempotent and safe to run on every boot: early-returns via PRAGMA
    user_version, and every step checks current schema before acting.
    Legacy data, ids and computed values are preserved; nothing is invented.
    """
    async with db.execute("PRAGMA user_version") as cur:
        row = await cur.fetchone()
    if row and int(row[0]) >= DOMAIN_SCHEMA_VERSION:
        return

    # 1. Table renames (data, ids, indexes and FK references move with them).
    renames = (
        ("item_variants", "variant"),
        ("item_images", "variant_image"),
        ("categories", "category"),
    )
    for old, new in renames:
        if await _table_exists(db, old) and not await _table_exists(db, new):
            await db.execute(f"ALTER TABLE {old} RENAME TO {new}")

    # 1b. Self-heal partial migrations: if the new table exists but is empty
    # while the legacy table still holds the data (e.g. interrupted run),
    # complete the move instead of stranding data in the legacy table.
    for old, new in renames:
        if await _table_exists(db, old) and await _table_exists(db, new):
            async with db.execute(f"SELECT COUNT(*) FROM {new}") as cur:
                new_count = (await cur.fetchone())[0]
            async with db.execute(f"SELECT COUNT(*) FROM {old}") as cur:
                old_count = (await cur.fetchone())[0]
            if new_count == 0 and old_count > 0:
                await db.execute(f"DROP TABLE {new}")
                await db.execute(f"ALTER TABLE {old} RENAME TO {new}")

    # 2. Column renames (only when old exists and new does not).
    col_renames = (
        ("variant", "price", "selling_price"),
        ("variant", "stock_quantity", "stock"),
        ("variant", "is_inclusive_tax", "is_inclusive"),
        ("variant_image", "image", "image_url"),
        ("category", "image", "image_url"),
    )
    for table, old, new in col_renames:
        if await _table_exists(db, table) and await _column_exists(db, table, old) and not await _column_exists(db, table, new):
            await db.execute(f"ALTER TABLE {table} RENAME COLUMN {old} TO {new}")

    # 3. New columns (nullable / defaulted — no backfill of fake data).
    additions = (
        ("variant", "uom", "TEXT NOT NULL DEFAULT ''"),
        ("variant_image", "name", "TEXT NOT NULL DEFAULT ''"),
        ("items", "category_id", "INTEGER NULL REFERENCES category(id) ON DELETE SET NULL"),
    )
    for table, column, ddl in additions:
        if await _table_exists(db, table) and not await _column_exists(db, table, column):
            await db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")

    # 4. Backfill uom from real variant names (parse only, never invent).
    if await _table_exists(db, "variant"):
        async with db.execute("SELECT id, variant_name, uom FROM variant") as cur:
            for r in await cur.fetchall():
                if not (r["uom"] or "").strip():
                    uom = await _parse_uom(str(r["variant_name"] or ""))
                    if uom:
                        await db.execute("UPDATE variant SET uom = ? WHERE id = ?", (uom, r["id"]))

    # 5. Backfill category taxonomy from real item data (no fake categories).
    if await _table_exists(db, "items") and await _table_exists(db, "category"):
        async with db.execute("SELECT DISTINCT category, category_key FROM items") as cur:
            distinct = [(str(r["category"] or "").strip(), str(r["category_key"] or "").strip()) for r in await cur.fetchall()]
        for cat_name, cat_key in distinct:
            if not cat_name and not cat_key:
                continue
            async with db.execute(
                "SELECT id FROM category WHERE (filter = ? AND ? != '') OR (LOWER(name) = LOWER(?) AND ? != '') LIMIT 1",
                (cat_key, cat_key, cat_name, cat_name),
            ) as cur:
                hit = await cur.fetchone()
            if hit:
                cat_id = int(hit["id"])
            else:
                async with db.execute(
                    "INSERT INTO category (name, filter, image_url) VALUES (?, ?, ?)",
                    (cat_name or cat_key, cat_key or "all", ""),
                ) as cur:
                    cat_id = cur.lastrowid
            await db.execute(
                "UPDATE items SET category_id = ? WHERE category_id IS NULL AND category = ? AND category_key = ?",
                (cat_id, cat_name, cat_key),
            )

    await db.execute(f"PRAGMA user_version = {DOMAIN_SCHEMA_VERSION}")
    await db.commit()


DOMAIN_SCHEMA_VERSION_V3 = 3


async def migrate_domain_v3(db: aiosqlite.Connection) -> None:
    """Phase 7 domain migration: items.image_url / hover_image_url renames +
    variant.is_lab_tested / is_natural flags (DEFAULT 1, brand-standard).

    Idempotent and safe to run on every boot: early-returns via PRAGMA
    user_version, and every step checks current schema before acting.
    Existing records keep their values; new columns take schema defaults.
    """
    async with db.execute("PRAGMA user_version") as cur:
        row = await cur.fetchone()
    if row and int(row[0]) >= DOMAIN_SCHEMA_VERSION_V3:
        return

    # 1. Item image column renames (only when old exists and new does not).
    item_renames = (
        ("items", "image", "image_url"),
        ("items", "hover_image", "hover_image_url"),
    )
    for table, old, new in item_renames:
        if await _table_exists(db, table) and await _column_exists(db, table, old) and not await _column_exists(db, table, new):
            await db.execute(f"ALTER TABLE {table} RENAME COLUMN {old} TO {new}")

    # 2. Variant purity flags (defaulted — existing rows take the default).
    flag_additions = (
        ("variant", "is_lab_tested", "INTEGER NOT NULL DEFAULT 1"),
        ("variant", "is_natural", "INTEGER NOT NULL DEFAULT 1"),
    )
    for table, column, ddl in flag_additions:
        if await _table_exists(db, table) and not await _column_exists(db, table, column):
            await db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")

    await db.execute(f"PRAGMA user_version = {DOMAIN_SCHEMA_VERSION_V3}")
    await db.commit()


DOMAIN_SCHEMA_VERSION_V4 = 4


async def migrate_domain_v4(db: aiosqlite.Connection) -> None:
    """Parent-category migration: the parent concept moves from Item (self
    reference) to Category (self reference).

    - Adds category.parent_id (nullable, ON DELETE SET NULL).
    - Drops items.parent_id (all production rows verified NULL; the column
      carries no meaning under the new model).
    Idempotent and safe to run on every boot: early-returns via PRAGMA
    user_version, and every step checks current schema before acting.
    """
    async with db.execute("PRAGMA user_version") as cur:
        row = await cur.fetchone()
    if row and int(row[0]) >= DOMAIN_SCHEMA_VERSION_V4:
        return

    if await _table_exists(db, "category") and not await _column_exists(db, "category", "parent_id"):
        await db.execute("ALTER TABLE category ADD COLUMN parent_id INTEGER NULL REFERENCES category(id) ON DELETE SET NULL")

    if await _table_exists(db, "items") and await _column_exists(db, "items", "parent_id"):
        # The v2 index on the old self-reference must go before the column can drop.
        await db.execute("DROP INDEX IF EXISTS idx_items_parent_id")
        await db.execute("ALTER TABLE items DROP COLUMN parent_id")

    await db.execute(f"PRAGMA user_version = {DOMAIN_SCHEMA_VERSION_V4}")
    await db.commit()


async def migrate(db: aiosqlite.Connection) -> None:
    """Run migrations — mirrors gawdee_migrate."""
    await migrate_domain_v2(db)
    await migrate_domain_v3(db)
    await migrate_domain_v4(db)
    await db.executescript(CREATE_TABLES_SQL)
    for sql in CREATE_INDEXES_SQL:
        await db.execute(sql)
    await db.execute("PRAGMA optimize")
    await seed_defaults(db)
    await ensure_items_migrated(db)
    await db.commit()


async def seed_defaults(db: aiosqlite.Connection) -> None:
    """Seed default settings and CMS content."""
    for key, value in DEFAULT_SETTINGS.items():
        await db.execute(
            "INSERT OR IGNORE INTO settings (setting_key, setting_value, is_secret) VALUES (?, ?, 0)",
            (key, value),
        )

    sections = [
        ("hero", "100% pure • natural • tested", "Pure by Nature. Trusted for Generations.",
         "Made from the milk of free-grazed Gir cows. Our A2 Ghee is bilona-churned in small batches to bring you pure nutrition that your family deserves.",
         "", 1, 10),
        ("benefits", "Everyday assurance", "Pure nutrition, made simply",
         "Five reasons families choose Gawdee for their daily pantry.", "", 1, 15),
        ("shop", "Everyday favourites", "Bestsellers",
         "Handpicked products for everyday family routines.", "", 1, 20),
        ("categories", "Browse the pantry", "Shop by category",
         "Find the right products for your daily rituals.", "", 1, 30),
        ("process", "From farm to family", "From Our Farms to Your Family",
         "A slow, transparent process from free-grazed Gir cows to every jar.", "", 1, 35),
        ("offer", "Independence Day offer", "Flat 10% OFF",
         "On all products. Use code FREEDOM10 at checkout.", "Celebrate with better everyday wellness.", 1, 40),
        ("combos", "Thoughtful bundles", "Healthy combos. Greater savings.",
         "Pairs designed to make everyday wellness simpler.", "", 1, 50),
        ("assurance", "Our promise", "Goodness without shortcuts",
         "Natural ingredients, careful testing and traditional preparation.", "", 1, 55),
        ("about", "Rooted in purity", "Inspired by nature", "A wholesome journey from earth to plate.",
         "We bring pure A2 Gir Cow Ghee, natural honey, grain foods and wellness products made with care, authenticity and village-inspired goodness.",
         1, 60),
        ("why", "The Gawdee difference", "Why choose Gawdee",
         "Purity, tradition and nutrition for a healthier lifestyle.", "", 1, 70),
        ("reviews", "Customer stories", "Loved by families who choose purity daily",
         "Real words from customers who value authentic taste and thoughtful quality.", "", 1, 80),
        ("video_testimonials", "Watch their stories", "Real families. Real Gawdee experiences.",
         "Hear directly from customers who have made Gawdee part of their everyday routine.", "", 1, 85),
        ("stories", "Gawdee journal", "Stories for a more thoughtful table",
         "Ideas, traditions and ingredient knowledge for everyday wellness.", "", 1, 90),
        ("reels", "Made with care", "From nature to your plate",
         "A closer look at the products and people behind Gawdee.", "", 1, 100),
        ("newsletter", "Stay close to goodness", "Be the first to know!",
         "Subscribe for special offers, health tips and updates.", "", 1, 110),
    ]
    for sec in sections:
        await db.execute(
            "INSERT OR IGNORE INTO cms_sections (section_key, eyebrow, title, subtitle, body, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
            sec,
        )


async def get_setting(db: aiosqlite.Connection, key: str, default: str = "") -> str:
    """Mirrors gawdee_setting."""
    async with db.execute(
        "SELECT setting_value, is_secret FROM settings WHERE setting_key = ?", (key,)
    ) as cursor:
        row = await cursor.fetchone()
    if not row:
        return default
    value = decrypt_value(row["setting_value"]) if int(row["is_secret"]) == 1 else row["setting_value"]
    return value


async def set_setting(db: aiosqlite.Connection, key: str, value: str, secret: bool = False) -> None:
    """Mirrors gawdee_set_setting."""
    stored = encrypt_value(value) if secret else value
    await db.execute(
        """INSERT INTO settings (setting_key, setting_value, is_secret, updated_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(setting_key) DO UPDATE SET
               setting_value = excluded.setting_value,
               is_secret = excluded.is_secret,
               updated_at = CURRENT_TIMESTAMP""",
        (key, stored, 1 if secret else 0),
    )
    await db.commit()


# ── Product helpers ──────────────────────────────────────────────────────────

def _cast_product(row) -> dict:
    d = dict(row)
    d["price"] = int(d["price"])
    d["original_price"] = int(d["original_price"])
    d["stock"] = int(d["stock"])
    d["rating"] = float(d.get("rating") or 0)
    d["review_count"] = int(d.get("review_count") or 0)
    d["is_active"] = int(d["is_active"])
    return d


async def get_products(db: aiosqlite.Connection, include_inactive: bool = False) -> list[dict]:
    sql = "SELECT * FROM products" + ("" if include_inactive else " WHERE is_active = 1") + " ORDER BY created_at, name"
    async with db.execute(sql) as cursor:
        rows = await cursor.fetchall()
    return [_cast_product(r) for r in rows]


async def get_product_by_id(db: aiosqlite.Connection, product_id: str) -> Optional[dict]:
    async with db.execute(
        "SELECT * FROM products WHERE id = ? AND is_active = 1", (product_id,)
    ) as cursor:
        row = await cursor.fetchone()
    return _cast_product(row) if row else None


async def get_product_by_slug(db: aiosqlite.Connection, slug: str) -> Optional[dict]:
    async with db.execute(
        "SELECT * FROM products WHERE slug = ? AND is_active = 1", (slug,)
    ) as cursor:
        row = await cursor.fetchone()
    return _cast_product(row) if row else None


async def get_product_reviews(db: aiosqlite.Connection, product_id: str) -> list[dict]:
    async with db.execute(
        "SELECT id, product_id, rating, review, name, created_at FROM product_reviews WHERE product_id = ? AND status = 'approved' ORDER BY id DESC",
        (product_id,),
    ) as cursor:
        rows = await cursor.fetchall()
    return [{"id": int(r["id"]), "product_id": r["product_id"], "rating": int(r["rating"]), "review": r["review"], "name": r["name"], "created_at": r["created_at"]} for r in rows]


# ── Order helpers ────────────────────────────────────────────────────────────

async def get_order_by_id(db: aiosqlite.Connection, order_id: int) -> Optional[dict]:
    async with db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)) as cursor:
        row = await cursor.fetchone()
    return dict(row) if row else None


async def get_order_by_number(db: aiosqlite.Connection, order_number: str) -> Optional[dict]:
    async with db.execute("SELECT * FROM orders WHERE order_number = ?", (order_number,)) as cursor:
        row = await cursor.fetchone()
    return dict(row) if row else None


async def get_order_items(db: aiosqlite.Connection, order_id: int) -> list[dict]:
    async with db.execute(
        "SELECT * FROM order_items WHERE order_id = ? ORDER BY id", (order_id,)
    ) as cursor:
        rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def get_order_events(db: aiosqlite.Connection, order_id: int) -> list[dict]:
    async with db.execute(
        "SELECT * FROM order_status_events WHERE order_id = ? ORDER BY id DESC", (order_id,)
    ) as cursor:
        rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def record_order_event(db: aiosqlite.Connection, order_id: int, status: str, title: str, description: str = "") -> None:
    await db.execute(
        "INSERT INTO order_status_events (order_id, status, title, description) VALUES (?, ?, ?, ?)",
        (order_id, status, title, description),
    )


async def record_inventory_event(
    db: aiosqlite.Connection,
    product_id: str,
    adjustment: int,
    balance_after: int,
    reason: str,
    order_id: Optional[int] = None,
    created_by: Optional[int] = None,
) -> None:
    await db.execute(
        "INSERT INTO inventory_events (product_id, order_id, adjustment, balance_after, reason, created_by) VALUES (?, ?, ?, ?, ?, ?)",
        (product_id, order_id, adjustment, balance_after, reason[:240], created_by),
    )


async def log_integration(db: aiosqlite.Connection, integration: str, action: str, status: str, message: str = "", reference: str = "") -> None:
    await db.execute(
        "INSERT INTO integration_logs (integration, action, status, reference, message) VALUES (?, ?, ?, ?, ?)",
        (integration, action, status, reference, message[:1500]),
    )
    await db.commit()


async def record_webhook_event(db: aiosqlite.Connection, provider: str, event_key: str, event_type: str, raw_body: str) -> bool:
    """Returns True if newly inserted (not a duplicate)."""
    async with db.execute(
        "INSERT OR IGNORE INTO webhook_events (provider, event_key, event_type, payload_hash) VALUES (?, ?, ?, ?)",
        (provider, event_key[:255], event_type[:120], hashlib.sha256(raw_body.encode()).hexdigest()),
    ) as cursor:
        inserted = cursor.rowcount == 1
    await db.commit()
    return inserted


async def complete_webhook_event(db: aiosqlite.Connection, provider: str, event_key: str, status: str = "processed") -> None:
    await db.execute(
        "UPDATE webhook_events SET status=?, processed_at=CURRENT_TIMESTAMP WHERE provider=? AND event_key=?",
        (status, provider, event_key),
    )
    await db.commit()


# ── Slug helper ──────────────────────────────────────────────────────────────

def make_slug(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or f"post-{datetime.now().strftime('%Y%m%d-%H%M%S')}"


# ── Items & Variants Catalog ────────────────────────────────────────────────

def gawdee_variant_price(mrp: int, discount_percent: float) -> int:
    mrp = max(0, int(mrp))
    discount = min(100.0, max(0.0, float(discount_percent)))
    return int(round(mrp * (1.0 - (discount / 100.0))))


def gawdee_variant_discount(mrp: int, price: int) -> float:
    if mrp <= 0:
        return 0.0
    price = min(mrp, max(0, price))
    return round((1.0 - (price / mrp)) * 100.0, 2)


def calc_discount_percent(mrp: int, selling_price: int) -> float:
    """Canonical backend discount truth: ((MRP - SellingPrice) / MRP) * 100.

    Handles MRP = 0 (→ 0.0, no division by zero), SellingPrice > MRP
    (clamped to MRP → 0.0), negatives (clamped to 0) and rounds to 2dp.
    """
    return gawdee_variant_discount(
        max(0, int(mrp or 0)), max(0, int(selling_price or 0))
    )


def validate_image_url(url: str, field: str = "Image") -> str:
    """Shared ImageUrl validation: required, bounded, scheme-safe, no markup."""
    clean = str(url or "").strip()
    if not clean:
        raise ValueError(f"{field} URL is required.")
    if len(clean) > 500:
        raise ValueError(f"{field} URL must be 500 characters or fewer.")
    if re.search(r"[<>\x00-\x1f\x7f]|javascript:|vbscript:|^data:", clean, flags=re.IGNORECASE):
        raise ValueError(f"{field} URL is not a valid image location.")
    if "://" in clean and not re.match(r"^https?://", clean, flags=re.IGNORECASE):
        raise ValueError(f"{field} URL must use http(s) or be a site-relative path.")
    if re.search(r"\s", clean) and not clean.startswith(("http://", "https://", "/")):
        raise ValueError(f"{field} URL must not contain spaces.")
    return clean


async def assert_no_category_cycle(db: aiosqlite.Connection, category_id: int, parent_id: Optional[int]) -> None:
    """Validate Category ParentId: nullable, must exist, never self, never circular."""
    if not parent_id:
        return
    if int(parent_id) == int(category_id or 0):
        raise ValueError("A category cannot be its own parent.")
    seen = {int(category_id or 0)}
    current: Optional[int] = int(parent_id)
    depth = 0
    while current:
        if current in seen:
            raise ValueError("Parent relationship would create a circular reference.")
        seen.add(current)
        async with db.execute("SELECT parent_id FROM category WHERE id = ? LIMIT 1", (current,)) as cur:
            row = await cur.fetchone()
        if not row:
            raise ValueError("Parent category does not exist.")
        current = int(row["parent_id"]) if row["parent_id"] else None
        depth += 1
        if depth > 100:
            raise ValueError("Parent relationship chain is too deep.")


def gawdee_item_family_key(name: str) -> str:
    name = name.lower()
    name = re.sub(r"^gawdee\s+", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\b\d+(?:\.\d+)?\s*(?:kg|g|gm|gms|gram|grams|ml|l|ltr|litre|litres|liter|liters)\b", "", name, flags=re.IGNORECASE)
    name = name.replace("—", " ")
    name = re.sub(r"[^a-z0-9]+", "-", name)
    return name.strip("-")


def map_variant_row(item: dict, variant: dict) -> dict:
    mrp = max(0, int(variant.get("mrp") or 0))
    # Canonical selling_price with legacy price fallback (response keeps both).
    price = max(0, int(variant.get("selling_price", variant.get("price", 0)) or 0))
    if mrp <= 0 and price > 0:
        mrp = price
    if price > mrp and mrp > 0:
        price = mrp
    discount = float(variant.get("discount") or calc_discount_percent(mrp, price))
    computed = gawdee_variant_price(mrp, discount)
    if mrp > 0 and abs(computed - price) > 1 and discount > 0:
        price = computed
    discount_pct = int(round((1.0 - (price / mrp)) * 100)) if mrp > 0 else 0
    discount_pct = min(100, max(0, discount_pct))

    item_image = str(item.get("image_url", item.get("image", "")) or "")
    variant_image = str(variant.get("image") or "").strip()
    gallery_images = variant.get("images") or []
    primary_image = ""
    for g in gallery_images:
        candidate = g.get("image", "").strip() if isinstance(g, dict) else str(g).strip()
        if candidate:
            primary_image = candidate
            break
    image = primary_image or variant_image or item_image

    variant_name = str(variant.get("variant_name") or "Standard").strip() or "Standard"
    item_name = str(item.get("name") or "Gawdee Product").strip() or "Gawdee Product"
    flavor = str(item.get("flavor") or "").strip()
    full_name = f"{item_name} {variant_name}"
    if flavor and flavor.lower() not in item_name.lower():
        full_name = f"{item_name} — {flavor} {variant_name}"

    stock_qty = max(0, int(variant.get("stock", variant.get("stock_quantity", 0)) or 0))
    is_inclusive = variant.get("is_inclusive", variant.get("is_inclusive_tax", 1))
    is_inclusive = 1 if is_inclusive else 0
    uom = str(variant.get("uom") or "").strip()[:10]
    images_list = [
        {
            "id": int(g.get("id", 0)),
            "name": str(g.get("name", "")),
            "image": str(g.get("image", g.get("image_url", ""))),
            "image_url": str(g.get("image_url", g.get("image", ""))),
            "sort_order": int(g.get("sort_order", 0)),
            "is_active": int(g.get("is_active", 1)),
        } if isinstance(g, dict) else {
            "id": 0, "name": "", "image": str(g), "image_url": str(g), "sort_order": 0, "is_active": 1
        }
        for g in gallery_images
    ]

    return {
        "item_id": int(item.get("id") or 0),
        "variant_id": int(variant.get("id") or 0),
        "variant_name": variant_name,
        "sku": str(variant.get("sku") or ""),
        "stock_quantity": stock_qty,
        "stock": stock_qty,
        "mrp": mrp,
        "discount": discount,
        "discount_percent": discount_pct,
        "is_inclusive_tax": is_inclusive,
        "is_inclusive": is_inclusive,
        "is_lab_tested": 1 if variant.get("is_lab_tested", 1) else 0,
        "is_natural": 1 if variant.get("is_natural", 1) else 0,
        "uom": uom,
        "hover_image": str(item.get("hover_image_url", item.get("hover_image", "")) or ""),
        "item_image": item_image,
        "flavor": flavor,
        "customer_review": str(item.get("customer_review") or ""),
        "legacy_product_id": str(variant.get("legacy_product_id") or ""),
        # Legacy compatibility keys
        "id": str(variant.get("id") or ""),
        "slug": str(variant.get("slug") or ""),
        "name": item_name,
        "full_name": full_name,
        "category": str(item.get("category") or ""),
        "category_key": str(item.get("category_key") or ""),
        "tag": str(item.get("tag") or ""),
        "price": price,
        "selling_price": price,
        "original_price": mrp,
        "weight": variant_name,
        "image": image,
        "primary_image": primary_image or image,
        "images": images_list,
        "image_count": len(images_list),
        "description": str(item.get("description") or ""),
        "accent": str(item.get("accent") or "#0a7540") or "#0a7540",
        "stock": stock_qty,
        "stock_status": "in_stock" if stock_qty > 0 else "out_of_stock",
        "rating": float(item.get("rating") or 0),
        "review_count": int(item.get("review_count") or 0),
        "is_active": int(variant.get("is_active", 1)),
        "item_is_active": int(item.get("is_active", 1)),
        "family_key": str(item.get("slug") or f"item-{item.get('id', 0)}"),
        "item_slug": str(item.get("slug") or ""),
        "variant_slug": str(variant.get("slug") or ""),
        "category_id": item.get("category_id"),
        "created_at": str(variant.get("created_at") or item.get("created_at") or ""),
        "updated_at": str(variant.get("updated_at") or ""),
    }


async def get_items(db: aiosqlite.Connection, include_inactive: bool = False, with_variants: bool = False) -> list[dict]:
    sql = "SELECT * FROM items" + ("" if include_inactive else " WHERE is_active = 1") + " ORDER BY name, id"
    async with db.execute(sql) as cursor:
        rows = [dict(r) for r in await cursor.fetchall()]
    for r in rows:
        r["id"] = int(r["id"])
        r["rating"] = float(r.get("rating") or 0)
        r["review_count"] = int(r.get("review_count") or 0)
        r["is_active"] = int(r.get("is_active", 1))
        if with_variants:
            r["variants"] = await get_variants_for_item(db, r["id"], include_inactive)
    return rows


async def get_item_by_id(db: aiosqlite.Connection, item_id: int) -> Optional[dict]:
    if item_id <= 0:
        return None
    async with db.execute("SELECT * FROM items WHERE id = ? LIMIT 1", (item_id,)) as cursor:
        row = await cursor.fetchone()
    if not row:
        return None
    d = dict(row)
    d["id"] = int(d["id"])
    d["rating"] = float(d.get("rating") or 0)
    d["review_count"] = int(d.get("review_count") or 0)
    d["is_active"] = int(d.get("is_active", 1))
    return d


async def get_item_by_slug(db: aiosqlite.Connection, slug: str) -> Optional[dict]:
    slug = slug.strip()
    if not slug:
        return None
    async with db.execute("SELECT * FROM items WHERE slug = ? LIMIT 1", (slug,)) as cursor:
        row = await cursor.fetchone()
    if not row:
        return None
    d = dict(row)
    d["id"] = int(d["id"])
    d["rating"] = float(d.get("rating") or 0)
    d["review_count"] = int(d.get("review_count") or 0)
    d["is_active"] = int(d.get("is_active", 1))
    return d


async def get_variants_for_item(db: aiosqlite.Connection, item_id: int, include_inactive: bool = False) -> list[dict]:
    if item_id <= 0:
        return []
    sql = "SELECT * FROM variant WHERE item_id = ?" + ("" if include_inactive else " AND is_active = 1") + " ORDER BY mrp, id"
    async with db.execute(sql, (item_id,)) as cursor:
        rows = [dict(r) for r in await cursor.fetchall()]
    for r in rows:
        r["id"] = int(r["id"])
        r["item_id"] = int(r["item_id"])
        r["stock_quantity"] = int(r.get("stock", r.get("stock_quantity", 0)) or 0)
        r["stock"] = r["stock_quantity"]
        r["mrp"] = int(r.get("mrp") or 0)
        r["price"] = int(r.get("selling_price", r.get("price", 0)) or 0)
        r["selling_price"] = r["price"]
        r["discount"] = float(r.get("discount") or 0)
        r["discount_percent"] = r["discount"]
        r["is_inclusive_tax"] = int(r.get("is_inclusive", r.get("is_inclusive_tax", 1)))
        r["is_inclusive"] = r["is_inclusive_tax"]
        r["is_lab_tested"] = int(r.get("is_lab_tested", 1))
        r["is_natural"] = int(r.get("is_natural", 1))
        r["uom"] = str(r.get("uom") or "")
        r["is_active"] = int(r.get("is_active", 1))
        r["images"] = await get_variant_images(db, r["id"], include_inactive)
    return rows


async def get_item_with_variants(db: aiosqlite.Connection, ref: str | int, include_inactive: bool = False) -> Optional[dict]:
    item = None
    if isinstance(ref, int) or (isinstance(ref, str) and ref.isdigit()):
        item = await get_item_by_id(db, int(ref))
    if not item and isinstance(ref, str):
        item = await get_item_by_slug(db, ref)
    if not item:
        variant = await get_variant_by_ref(db, ref, True)
        if variant:
            item = await get_item_by_id(db, int(variant.get("item_id", 0)))
    if not item:
        return None
    item["variants"] = await get_variants_for_item(db, item["id"], include_inactive)
    # NOTE: stored under `category_obj` — never overwrite the legacy `category`
    # text column, which map_variant_row and other text consumers still read.
    item["category_obj"] = await get_category_for_item(db, item)
    return item


# ── Category helpers ───────────────────────────────────────────────────────

def _cast_category(row: dict) -> dict:
    d = dict(row)
    d["id"] = int(d["id"])
    d["name"] = str(d.get("name") or "")
    d["filter"] = str(d.get("filter") or "all")
    d["image_url"] = str(d.get("image_url", d.get("image", "")) or "")
    d["image"] = d["image_url"]  # legacy alias (admin UI reads `image`)
    d["icon"] = str(d.get("icon") or "")
    pid = d.get("parent_id")
    d["parent_id"] = int(pid) if pid else None
    d["sort_order"] = int(d.get("sort_order") or 0)
    d["is_active"] = int(d.get("is_active", 1))
    d["created_at"] = str(d.get("created_at") or "")
    d["updated_at"] = str(d.get("updated_at") or "")
    return d


async def get_category_by_id(db: aiosqlite.Connection, category_id: int) -> Optional[dict]:
    if not category_id or int(category_id) <= 0:
        return None
    async with db.execute("SELECT * FROM category WHERE id = ? LIMIT 1", (int(category_id),)) as cur:
        row = await cur.fetchone()
    return _cast_category(dict(row)) if row else None


async def get_categories(db: aiosqlite.Connection, include_inactive: bool = False) -> list[dict]:
    sql = "SELECT * FROM category" + ("" if include_inactive else " WHERE is_active = 1") + " ORDER BY sort_order ASC, id ASC"
    async with db.execute(sql) as cur:
        return [_cast_category(dict(r)) for r in await cur.fetchall()]


async def get_category_parent(db: aiosqlite.Connection, category: dict) -> Optional[dict]:
    """Shallow parent navigation (one level only — no circular serialization)."""
    parent_id = category.get("parent_id")
    if not parent_id:
        return None
    parent = await get_category_by_id(db, int(parent_id))
    if not parent:
        return None
    return {"id": parent["id"], "name": parent.get("name", "")}


async def get_category_child_ids(db: aiosqlite.Connection, category_id: int, include_inactive: bool = False) -> list[int]:
    sql = "SELECT id FROM category WHERE parent_id = ?" + ("" if include_inactive else " AND is_active = 1") + " ORDER BY sort_order ASC, id ASC"
    async with db.execute(sql, (category_id,)) as cur:
        return [int(r["id"]) for r in await cur.fetchall()]


async def get_category_for_item(db: aiosqlite.Connection, item: dict) -> Optional[dict]:
    """Category navigation for an item (None when unlinked)."""
    category_id = item.get("category_id")
    if not category_id:
        return None
    async with db.execute("SELECT * FROM category WHERE id = ? LIMIT 1", (int(category_id),)) as cur:
        row = await cur.fetchone()
    if not row:
        return None
    return _cast_category(dict(row))


async def get_variant_by_ref(db: aiosqlite.Connection, ref: str | int, include_inactive: bool = False) -> Optional[dict]:
    ref_str = str(ref).strip()
    if not ref_str:
        return None
    active_sql = "" if include_inactive else " AND v.is_active = 1 AND i.is_active = 1"
    queries = []
    if ref_str.isdigit():
        queries.append(("SELECT v.*, i.slug AS item_slug, i.is_active AS item_is_active FROM variant v JOIN items i ON i.id = v.item_id WHERE v.id = ?" + active_sql + " LIMIT 1", (ref_str,)))
    queries.append(("SELECT v.*, i.slug AS item_slug, i.is_active AS item_is_active FROM variant v JOIN items i ON i.id = v.item_id WHERE v.slug = ?" + active_sql + " LIMIT 1", (ref_str,)))
    queries.append(("SELECT v.*, i.slug AS item_slug, i.is_active AS item_is_active FROM variant v JOIN items i ON i.id = v.item_id WHERE v.legacy_product_id = ?" + active_sql + " LIMIT 1", (ref_str,)))
    queries.append(("SELECT v.*, i.slug AS item_slug, i.is_active AS item_is_active FROM variant v JOIN items i ON i.id = v.item_id WHERE v.sku = ?" + active_sql + " LIMIT 1", (ref_str,)))

    for sql, params in queries:
        async with db.execute(sql, params) as cursor:
            row = await cursor.fetchone()
        if row:
            r = dict(row)
            r["id"] = int(r["id"])
            r["item_id"] = int(r["item_id"])
            r["stock_quantity"] = int(r.get("stock", r.get("stock_quantity", 0)) or 0)
            r["stock"] = r["stock_quantity"]
            r["mrp"] = int(r.get("mrp") or 0)
            r["price"] = int(r.get("selling_price", r.get("price", 0)) or 0)
            r["selling_price"] = r["price"]
            r["discount"] = float(r.get("discount") or 0)
            r["discount_percent"] = r["discount"]
            r["is_inclusive_tax"] = int(r.get("is_inclusive", r.get("is_inclusive_tax", 1)))
            r["is_inclusive"] = r["is_inclusive_tax"]
            r["is_lab_tested"] = int(r.get("is_lab_tested", 1))
            r["is_natural"] = int(r.get("is_natural", 1))
            r["uom"] = str(r.get("uom") or "")
            r["is_active"] = int(r.get("is_active", 1))
            r["images"] = await get_variant_images(db, r["id"], include_inactive)
            return r
    return None


async def get_catalog_rows(db: aiosqlite.Connection, include_inactive: bool = False) -> list[dict]:
    sql = (
        "SELECT v.*, i.slug AS item_slug_col, i.name AS item_name, i.flavor AS item_flavor, "
        "i.description AS item_description, i.image_url AS item_image, i.hover_image_url AS item_hover, "
        "i.customer_review AS item_review, i.category AS item_category, i.category_key AS item_catkey, "
        "i.category_id AS item_category_id, "
        "i.tag AS item_tag, i.accent AS item_accent, i.rating AS item_rating, "
        "i.review_count AS item_reviews, i.is_active AS item_active, i.created_at AS item_created "
        "FROM variant v JOIN items i ON i.id = v.item_id"
    )
    if not include_inactive:
        sql += " WHERE v.is_active = 1 AND i.is_active = 1"
    sql += " ORDER BY i.name, v.mrp, v.id"

    async with db.execute(sql) as cursor:
        rows = [dict(r) for r in await cursor.fetchall()]
    if not rows:
        return []

    out = []
    for r in rows:
        item = {
            "id": int(r.get("item_id", 0)),
            "slug": str(r.get("item_slug_col", "")),
            "name": str(r.get("item_name", "")),
            "flavor": str(r.get("item_flavor", "")),
            "description": str(r.get("item_description", "")),
            "image": str(r.get("item_image", "")),
            "hover_image": str(r.get("item_hover", "")),
            "customer_review": str(r.get("item_review", "")),
            "category": str(r.get("item_category", "")),
            "category_key": str(r.get("item_catkey", "")),
            "category_id": r.get("item_category_id"),
            "tag": str(r.get("item_tag", "")),
            "accent": str(r.get("item_accent", "#0a7540")),
            "rating": float(r.get("item_rating", 0)),
            "review_count": int(r.get("item_reviews", 0)),
            "is_active": int(r.get("item_active", 1)),
            "created_at": str(r.get("item_created", "")),
        }
        variant = {
            "id": int(r.get("id", 0)),
            "item_id": int(r.get("item_id", 0)),
            "variant_name": str(r.get("variant_name", "")),
            "slug": str(r.get("slug", "")),
            "sku": str(r.get("sku", "")),
            "stock_quantity": int(r.get("stock", r.get("stock_quantity", 0)) or 0),
            "mrp": int(r.get("mrp", 0)),
            "discount": float(r.get("discount", 0)),
            "price": int(r.get("selling_price", r.get("price", 0)) or 0),
            "is_inclusive_tax": int(r.get("is_inclusive", r.get("is_inclusive_tax", 1))),
            "is_lab_tested": int(r.get("is_lab_tested", 1)),
            "is_natural": int(r.get("is_natural", 1)),
            "uom": str(r.get("uom") or ""),
            "image": str(r.get("image", "")),
            "legacy_product_id": str(r.get("legacy_product_id", "")),
            "is_active": int(r.get("is_active", 1)),
            "created_at": str(r.get("created_at", "")),
            "updated_at": str(r.get("updated_at", "")),
            "images": await get_variant_images(db, int(r.get("id", 0)), include_inactive),
        }
        out.append(map_variant_row(item, variant))
    return out


def validate_item_fields(fields: dict) -> dict:
    name = str(fields.get("name") or "").strip()
    slug = str(fields.get("slug") or "").strip()
    if not slug and name:
        slug = make_slug(name)
    if not name:
        raise ValueError("Item name is required.")
    if not slug:
        raise ValueError("Item slug could not be generated.")
    if not re.match(r"^[a-z0-9-]{2,191}$", slug):
        raise ValueError("Item slug must be 2–191 chars of lowercase letters, numbers and hyphens.")
    accent = str(fields.get("accent") or "#0a7540").strip()
    if not re.match(r"^#[0-9a-fA-F]{6}$", accent):
        accent = "#0a7540"
    category_id = fields.get("category_id")
    category_id = int(category_id) if category_id else None
    if category_id is not None and category_id <= 0:
        category_id = None
    image_url = str(fields.get("image_url", fields.get("image", "")) or "").strip()
    if image_url:
        image_url = validate_image_url(image_url, "Item image")[:255]
    hover_image_url = str(fields.get("hover_image_url", fields.get("hover_image", "")) or "").strip()
    if hover_image_url:
        hover_image_url = validate_image_url(hover_image_url, "Item hover image")[:255]
    return {
        "slug": slug,
        "name": name,
        "flavor": str(fields.get("flavor") or "").strip()[:100],
        "description": str(fields.get("description") or "").strip(),
        "image_url": image_url,
        "hover_image_url": hover_image_url,
        "customer_review": str(fields.get("customer_review") or "").strip(),
        "category": str(fields.get("category") or "").strip()[:100],
        "category_key": str(fields.get("category_key") or "").strip()[:100],
        "category_id": category_id,
        "tag": str(fields.get("tag") or "").strip()[:100],
        "accent": accent,
        "is_active": 1 if fields.get("is_active", 1) else 0,
    }


def validate_category_fields(fields: dict) -> dict:
    name = str(fields.get("name") or "").strip()
    if len(name) < 2 or len(name) > 100:
        raise ValueError("Category name must be 2–100 characters.")
    image_url = str(fields.get("image_url", fields.get("image", "")) or "").strip()
    if image_url:
        image_url = validate_image_url(image_url, "Category image")[:255]
    parent_id = fields.get("parent_id")
    parent_id = int(parent_id) if parent_id else None
    if parent_id is not None and parent_id <= 0:
        parent_id = None
    return {
        "name": name,
        "filter": str(fields.get("filter") or "all").strip()[:100],
        "image_url": image_url,
        "parent_id": parent_id,
        "icon": str(fields.get("icon") or "").strip()[:100],
        "sort_order": max(0, int(fields.get("sort_order") or 0)),
        "is_active": 1 if fields.get("is_active", 1) else 0,
    }


async def validate_variant_fields(db: aiosqlite.Connection, fields: dict, item_id: int, ignore_variant_id: Optional[int] = None) -> dict:
    # ItemId must reference a real item.
    async with db.execute("SELECT id FROM items WHERE id = ? LIMIT 1", (item_id,)) as cur:
        if item_id <= 0 or not await cur.fetchone():
            raise ValueError("Valid item_id referencing an existing item is required for a variant.")
    variant_name = str(fields.get("variant_name") or fields.get("weight") or "").strip()
    if not variant_name:
        raise ValueError("Variant name (e.g. 250g, 500ml, 1kg) is required.")
    variant_name = variant_name[:100]
    sku = str(fields.get("sku") or "").strip()
    if not sku:
        v_clean = re.sub(r"[^A-Za-z0-9]+", "", variant_name).upper()[:6] or "STD"
        sku = f"GWD-{v_clean}-{secrets.token_hex(2).upper()}"
    if not re.match(r"^[A-Za-z0-9][A-Za-z0-9._-]{1,98}$", sku):
        raise ValueError("SKU must be 2–99 chars: letters, numbers, dot, underscore or hyphen.")

    q = "SELECT id FROM variant WHERE LOWER(sku) = LOWER(?)"
    params = [sku]
    if ignore_variant_id:
        q += " AND id != ?"
        params.append(ignore_variant_id)
    async with db.execute(q, tuple(params)) as cur:
        if await cur.fetchone():
            raise ValueError(f'SKU "{sku}" is already used by another variant.')

    stock = int(fields.get("stock", fields.get("stock_quantity", 0)) or 0)
    stock = max(0, min(1000000, stock))
    mrp = int(round(float(fields.get("mrp", fields.get("original_price", 0)) or 0)))
    mrp = max(0, min(10000000, mrp))

    # Backend is the discount truth: explicit SellingPrice wins (clamped to a
    # sane range); otherwise fall back to the legacy discount input for
    # compatibility with older admin payloads.
    if fields.get("selling_price", fields.get("price", None)) not in (None, ""):
        selling_price = int(round(float(fields.get("selling_price", fields.get("price", 0)) or 0)))
        selling_price = max(0, min(10000000, selling_price))
        if mrp <= 0 and selling_price > 0:
            mrp = selling_price
        if selling_price > mrp and mrp > 0:
            selling_price = mrp
        discount = calc_discount_percent(mrp, selling_price)
    else:
        discount = float(fields.get("discount", fields.get("discount_percent", 0)) or 0)
        discount = max(0.0, min(90.0, round(discount, 2)))
        selling_price = gawdee_variant_price(mrp, discount)

    slug = str(fields.get("slug") or "").strip()
    if not slug:
        async with db.execute("SELECT slug FROM items WHERE id = ?", (item_id,)) as cur:
            item_row = await cur.fetchone()
        item_slug = item_row["slug"] if item_row else "item"
        v_suffix = re.sub(r"[^a-z0-9]+", "-", variant_name.lower()).strip("-") or "std"
        slug = f"{item_slug}-{v_suffix}"

    is_inclusive = 1
    if "is_inclusive" in fields:
        is_inclusive = 1 if fields["is_inclusive"] else 0
    elif "is_inclusive_tax" in fields:
        is_inclusive = 1 if fields["is_inclusive_tax"] else 0

    uom = str(fields.get("uom") or "").strip()
    if not uom:
        uom = await _parse_uom(variant_name)
    if uom and not re.match(r"^[A-Za-z]{1,10}$", uom):
        raise ValueError("UOM must be 1–10 letters (e.g. g, kg, ml, L).")

    def _as_flag(*keys: str) -> int:
        for key in keys:
            if key in fields:
                return 1 if fields[key] else 0
        return 1

    return {
        "variant_name": variant_name,
        "slug": slug,
        "sku": sku,
        "stock": stock,
        "mrp": mrp,
        "discount": discount,
        "selling_price": selling_price,
        "is_inclusive": is_inclusive,
        "is_lab_tested": _as_flag("is_lab_tested", "isLabTested"),
        "is_natural": _as_flag("is_natural", "isNatural"),
        "uom": uom,
        "image": str(fields.get("image") or "").strip()[:255],
        "is_active": 1 if fields.get("is_active", 1) else 0,
    }


def validate_variant_image_fields(fields: dict, image_url_required: bool = True) -> dict:
    name = str(fields.get("name") or "").strip()[:100]
    raw_url = str(fields.get("image_url", fields.get("image", "")) or "").strip()
    if not raw_url and image_url_required:
        raise ValueError("Variant image URL is required.")
    image_url = validate_image_url(raw_url, "Variant image") if raw_url else ""
    return {
        "name": name,
        "image_url": image_url,
        "sort_order": max(0, int(fields.get("sort_order") or 0)),
        "is_active": 1 if fields.get("is_active", 1) else 0,
    }


async def create_item(db: aiosqlite.Connection, fields: dict) -> int:
    clean = validate_item_fields(fields)
    async with db.execute("SELECT id FROM items WHERE slug = ? LIMIT 1", (clean["slug"],)) as cur:
        if await cur.fetchone():
            raise ValueError("An item with this slug already exists.")
    if clean["category_id"]:
        if not await get_category_by_id(db, clean["category_id"]):
            raise ValueError("Category does not exist.")
    await db.execute(
        "INSERT INTO items (slug, name, flavor, description, image_url, hover_image_url, customer_review, category, category_key, category_id, tag, accent, is_active) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (clean["slug"], clean["name"], clean["flavor"], clean["description"], clean["image_url"], clean["hover_image_url"],
         clean["customer_review"], clean["category"], clean["category_key"], clean["category_id"],
         clean["tag"], clean["accent"], clean["is_active"]),
    )
    async with db.execute("SELECT last_insert_rowid()") as cur:
        item_id = (await cur.fetchone())[0]
    await db.commit()
    return item_id


async def update_item(db: aiosqlite.Connection, item_id: int, fields: dict) -> None:
    existing = await get_item_by_id(db, item_id)
    if not existing:
        raise ValueError("Item not found.")
    merged = {**existing, **fields}
    clean = validate_item_fields(merged)
    async with db.execute("SELECT id FROM items WHERE slug = ? AND id != ? LIMIT 1", (clean["slug"], item_id)) as cur:
        if await cur.fetchone():
            raise ValueError("Another item already uses this slug.")
    if clean["category_id"]:
        if not await get_category_by_id(db, clean["category_id"]):
            raise ValueError("Category does not exist.")
    await db.execute(
        "UPDATE items SET slug=?, name=?, flavor=?, description=?, image_url=?, hover_image_url=?, customer_review=?, "
        "category=?, category_key=?, category_id=?, tag=?, accent=?, is_active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (clean["slug"], clean["name"], clean["flavor"], clean["description"], clean["image_url"], clean["hover_image_url"],
         clean["customer_review"], clean["category"], clean["category_key"], clean["category_id"],
         clean["tag"], clean["accent"], clean["is_active"], item_id),
    )
    await db.commit()


async def delete_item(db: aiosqlite.Connection, item_id: int) -> None:
    existing = await get_item_by_id(db, item_id)
    if not existing:
        raise ValueError("Item not found.")
    variants = await get_variants_for_item(db, item_id, True)
    await db.execute("DELETE FROM variant WHERE item_id = ?", (item_id,))
    await db.execute("DELETE FROM items WHERE id = ?", (item_id,))
    for v in variants:
        vid = v["id"]
        legacy = v.get("legacy_product_id") or ""
        await delete_variant_images(db, vid)
        await db.execute("DELETE FROM products WHERE id = ? AND source_id = 'variant-mirror'", (str(vid),))
        if legacy:
            await db.execute("UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (legacy,))
    await db.commit()


async def create_variant(db: aiosqlite.Connection, item_id: int, fields: dict) -> int:
    clean = await validate_variant_fields(db, fields, item_id)
    await db.execute(
        "INSERT INTO variant (item_id, variant_name, slug, sku, stock, mrp, discount, selling_price, is_inclusive, is_lab_tested, is_natural, uom, image, is_active) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (item_id, clean["variant_name"], clean["slug"], clean["sku"], clean["stock"], clean["mrp"],
         clean["discount"], clean["selling_price"], clean["is_inclusive"], clean["is_lab_tested"], clean["is_natural"], clean["uom"], clean["image"], clean["is_active"]),
    )
    async with db.execute("SELECT last_insert_rowid()") as cur:
        new_id = (await cur.fetchone())[0]
    await db.commit()
    await sync_variant_mirror(db, new_id)
    return new_id


async def update_variant(db: aiosqlite.Connection, variant_id: int, fields: dict) -> None:
    async with db.execute("SELECT * FROM variant WHERE id = ? LIMIT 1", (variant_id,)) as cur:
        existing = await cur.fetchone()
    if not existing:
        raise ValueError("Variant not found.")
    existing_dict = dict(existing)
    item_id = int(fields.get("item_id") or existing_dict["item_id"])
    # Backend discount truth (spec): an explicitly supplied SellingPrice always
    # wins and the discount is recomputed. A legacy discount-only payload still
    # works; when both are supplied, the frontend-calculated discount echo is
    # dropped in favour of MRP + SellingPrice.
    raw_has_price = str(fields.get("selling_price", fields.get("price", "")) or "").strip() != ""
    raw_has_discount = str(fields.get("discount", fields.get("discount_percent", "")) or "").strip() != ""
    merged = {**existing_dict, **fields}
    if raw_has_price and raw_has_discount:
        merged.pop("discount", None)
        merged.pop("discount_percent", None)
    elif not raw_has_price and raw_has_discount:
        merged.pop("selling_price", None)
        merged.pop("price", None)
    clean = await validate_variant_fields(db, merged, item_id, variant_id)
    await db.execute(
        "UPDATE variant SET item_id=?, variant_name=?, slug=?, sku=?, stock=?, mrp=?, discount=?, selling_price=?, "
        "is_inclusive=?, is_lab_tested=?, is_natural=?, uom=?, image=?, is_active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (item_id, clean["variant_name"], clean["slug"], clean["sku"], clean["stock"], clean["mrp"],
         clean["discount"], clean["selling_price"], clean["is_inclusive"], clean["is_lab_tested"], clean["is_natural"], clean["uom"], clean["image"], clean["is_active"], variant_id),
    )
    await db.commit()
    await sync_variant_mirror(db, variant_id)


async def delete_variant(db: aiosqlite.Connection, variant_id: int) -> None:
    async with db.execute("SELECT item_id, legacy_product_id FROM variant WHERE id = ? LIMIT 1", (variant_id,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise ValueError("Variant not found.")
    item_id = row["item_id"]
    legacy = row["legacy_product_id"] or ""
    async with db.execute("SELECT COUNT(*) FROM variant WHERE item_id = ?", (item_id,)) as cur:
        count = (await cur.fetchone())[0]
    if count <= 1:
        raise ValueError("An item must keep at least one variant. Delete the item instead.")
    await db.execute("DELETE FROM variant WHERE id = ?", (variant_id,))
    await delete_variant_images(db, variant_id)
    await db.execute("DELETE FROM products WHERE id = ? AND source_id = 'variant-mirror'", (str(variant_id),))
    if legacy:
        await db.execute("UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (legacy,))
    await db.commit()


async def save_item_with_variants(db: aiosqlite.Connection, item_fields: dict, variants: list[dict], item_id: Optional[int] = None) -> int:
    if not variants:
        raise ValueError("An item must have at least one variant.")
    if item_id and item_id > 0:
        await update_item(db, item_id, item_fields)
    else:
        item_id = await create_item(db, item_fields)

    kept_ids = []
    for v in variants:
        vid = int(v["id"]) if v.get("id") else None
        if vid:
            await update_variant(db, vid, {**v, "item_id": item_id})
            kept_ids.append(vid)
        else:
            new_vid = await create_variant(db, item_id, {**v, "item_id": item_id})
            kept_ids.append(new_vid)

    # Remove variants not present in submitted list
    async with db.execute("SELECT id, legacy_product_id FROM variant WHERE item_id = ?", (item_id,)) as cur:
        existing_vars = [dict(r) for r in await cur.fetchall()]
    for ev in existing_vars:
        eid = int(ev["id"])
        elegacy = str(ev.get("legacy_product_id") or "")
        if eid not in kept_ids:
            async with db.execute("SELECT COUNT(*) FROM variant WHERE item_id = ?", (item_id,)) as cur:
                count = (await cur.fetchone())[0]
            if count <= 1:
                break
            await db.execute("DELETE FROM variant WHERE id = ?", (eid,))
            await delete_variant_images(db, eid)
            await db.execute("DELETE FROM products WHERE id = ? AND source_id = 'variant-mirror'", (str(eid),))
            if elegacy:
                await db.execute("UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (elegacy,))

    await db.commit()
    await sync_item_mirrors(db, item_id)
    return item_id


def resolve_variant_identity(product: dict) -> dict:
    variant_id = 0
    if product.get("variant_id"):
        variant_id = int(product["variant_id"])
    elif str(product.get("id", "")).isdigit() and product.get("item_id"):
        variant_id = int(product["id"])
    return {
        "variant_id": variant_id,
        "legacy_id": str(product.get("legacy_product_id") or ""),
        "product_id": str(product.get("id") or ""),
    }


async def deduct_variant_stock(db: aiosqlite.Connection, ref: str | int, qty: int) -> bool:
    qty = max(1, qty)
    variant = await get_variant_by_ref(db, ref, True)
    if not variant:
        return False
    async with db.execute(
        "UPDATE variant SET stock = stock - ? WHERE id = ? AND stock >= ?",
        (qty, variant["id"], qty),
    ) as cur:
        if cur.rowcount != 1:
            return False
    if variant.get("legacy_product_id"):
        try:
            await db.execute(
                "UPDATE products SET stock = MAX(0, stock - ?), stock_status = CASE WHEN stock - ? <= 0 THEN 'out_of_stock' ELSE 'in_stock' END WHERE id = ?",
                (qty, qty, variant["legacy_product_id"]),
            )
        except Exception:
            pass
    await sync_variant_mirror(db, variant["id"])
    return True


async def restore_variant_stock(db: aiosqlite.Connection, ref: str | int, qty: int) -> None:
    qty = max(1, qty)
    variant = await get_variant_by_ref(db, ref, True)
    if not variant:
        return
    await db.execute(
        "UPDATE variant SET stock = stock + ? WHERE id = ?",
        (qty, variant["id"]),
    )
    if variant.get("legacy_product_id"):
        try:
            await db.execute(
                "UPDATE products SET stock = stock + ?, stock_status = 'in_stock' WHERE id = ?",
                (qty, variant["legacy_product_id"]),
            )
        except Exception:
            pass
    await sync_variant_mirror(db, variant["id"])


async def get_variant_stock(db: aiosqlite.Connection, ref: str | int) -> Optional[int]:
    variant = await get_variant_by_ref(db, ref, True)
    if not variant:
        return None
    return max(0, int(variant.get("stock", variant.get("stock_quantity", 0)) or 0))


async def sync_variant_mirror(db: aiosqlite.Connection, variant_id: int) -> None:
    try:
        async with db.execute(
            "SELECT v.*, i.name AS iname, i.slug AS islug, i.category AS icat, i.category_key AS ikey, "
            "i.tag AS itag, i.description AS idesc, i.image_url AS iimg, i.accent AS iaccent "
            "FROM variant v JOIN items i ON i.id = v.item_id WHERE v.id = ? LIMIT 1",
            (variant_id,),
        ) as cur:
            row = await cur.fetchone()
        if not row:
            return
        r = dict(row)
        if r.get("legacy_product_id"):
            await db.execute(
                "UPDATE products SET stock=?, price=?, original_price=?, stock_status=CASE WHEN ? > 0 THEN 'in_stock' ELSE 'out_of_stock' END WHERE id=?",
                (int(r["stock"]), int(r["selling_price"]), int(r["mrp"]), int(r["stock"]), r["legacy_product_id"]),
            )
            await db.commit()
            return

        mirror_id = str(r["id"])
        variant_name = str(r.get("variant_name") or "Standard").strip() or "Standard"
        full_name = f"{r.get('iname', '')} {variant_name}".strip()
        gallery = await get_variant_images(db, variant_id, False)
        primary_image = gallery[0]["image"] if gallery else ""
        image = primary_image or str(r.get("image") or "").strip() or str(r.get("iimg") or "")

        async with db.execute("SELECT id FROM products WHERE id = ? LIMIT 1", (mirror_id,)) as cur:
            exists = await cur.fetchone()

        stock_status = "in_stock" if int(r["stock"]) > 0 else "out_of_stock"
        if exists:
            await db.execute(
                "UPDATE products SET slug=?, name=?, full_name=?, category=?, category_key=?, tag=?, price=?, original_price=?, "
                "weight=?, image=?, description=?, accent=?, stock=?, stock_status=?, sku=?, is_active=?, source_id='variant-mirror', "
                "updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (str(r["slug"]), str(r["iname"]), full_name, str(r["icat"]), str(r["ikey"]), str(r["itag"]),
                 int(r["selling_price"]), int(r["mrp"]), variant_name, image, str(r["idesc"]), str(r["iaccent"]),
                 int(r["stock"]), stock_status, str(r["sku"]), int(r["is_active"]), mirror_id),
            )
        else:
            await db.execute(
                "INSERT INTO products (id, slug, name, full_name, category, category_key, tag, price, original_price, weight, "
                "image, description, accent, stock, stock_status, sku, source_id, is_active) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'variant-mirror', ?)",
                (mirror_id, str(r["slug"]), str(r["iname"]), full_name, str(r["icat"]), str(r["ikey"]), str(r["itag"]),
                 int(r["selling_price"]), int(r["mrp"]), variant_name, image, str(r["idesc"]), str(r["iaccent"]),
                 int(r["stock"]), stock_status, str(r["sku"]), int(r["is_active"])),
            )
        await db.commit()
    except Exception:
        pass


async def sync_item_mirrors(db: aiosqlite.Connection, item_id: int) -> None:
    try:
        variants = await get_variants_for_item(db, item_id, True)
        for v in variants:
            await sync_variant_mirror(db, v["id"])
    except Exception:
        pass


# ── Variant Images ───────────────────────────────────────────────────────────

async def get_variant_images(db: aiosqlite.Connection, variant_id: int, include_inactive: bool = False) -> list[dict]:
    if variant_id <= 0:
        return []
    sql = "SELECT * FROM variant_image WHERE variant_id = ?" + ("" if include_inactive else " AND is_active = 1") + " ORDER BY sort_order, id"
    try:
        async with db.execute(sql, (variant_id,)) as cur:
            rows = [dict(r) for r in await cur.fetchall()]
        return [
            {
                "id": int(r["id"]),
                "name": str(r.get("name", "")),
                "variant_id": int(r["variant_id"]),
                "image": str(r.get("image_url", r.get("image", ""))),
                "image_url": str(r.get("image_url", r.get("image", ""))),
                "sort_order": int(r.get("sort_order", 0)),
                "is_active": int(r.get("is_active", 1)),
                "created_at": str(r.get("created_at", "")),
                "updated_at": str(r.get("updated_at", "")),
            }
            for r in rows
        ]
    except Exception:
        return []


async def add_variant_image(db: aiosqlite.Connection, variant_id: int, image_path: str, sort_order: int = -1, is_active: int = 1, name: str = "") -> int:
    async with db.execute("SELECT id FROM variant WHERE id = ? LIMIT 1", (variant_id,)) as cur:
        if not await cur.fetchone():
            raise ValueError("Variant not found.")
    clean = validate_variant_image_fields({"name": name, "image_url": image_path, "sort_order": sort_order, "is_active": is_active})
    if sort_order < 0:
        async with db.execute("SELECT COALESCE(MAX(sort_order), -1) FROM variant_image WHERE variant_id = ?", (variant_id,)) as cur:
            max_so = (await cur.fetchone())[0]
            clean["sort_order"] = max_so + 1
    await db.execute(
        "INSERT INTO variant_image (name, variant_id, image_url, sort_order, is_active) VALUES (?, ?, ?, ?, ?)",
        (clean["name"], variant_id, clean["image_url"], clean["sort_order"], clean["is_active"]),
    )
    async with db.execute("SELECT last_insert_rowid()") as cur:
        img_id = (await cur.fetchone())[0]
    await db.commit()
    return img_id


async def update_variant_image(db: aiosqlite.Connection, image_id: int, fields: dict) -> None:
    async with db.execute("SELECT * FROM variant_image WHERE id = ? LIMIT 1", (image_id,)) as cur:
        existing = await cur.fetchone()
    if not existing:
        raise ValueError("Image not found.")
    d = dict(existing)
    merged = {
        "name": fields.get("name", d.get("name", "")),
        "image_url": fields.get("image_url", fields.get("image", d.get("image_url", d.get("image", "")))),
        "sort_order": fields.get("sort_order", d.get("sort_order", 0)),
        "is_active": fields.get("is_active", d.get("is_active", 1)),
    }
    clean = validate_variant_image_fields(merged)
    await db.execute(
        "UPDATE variant_image SET name=?, image_url=?, sort_order=?, is_active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (clean["name"], clean["image_url"], clean["sort_order"], clean["is_active"], image_id),
    )
    await db.commit()


async def delete_variant_image(db: aiosqlite.Connection, image_id: int) -> None:
    await db.execute("DELETE FROM variant_image WHERE id = ?", (image_id,))
    await db.commit()


async def delete_variant_images(db: aiosqlite.Connection, variant_id: int) -> None:
    await db.execute("DELETE FROM variant_image WHERE variant_id = ?", (variant_id,))
    await db.commit()


# ── Items Catalog Migration from Legacy Products ────────────────────────────

async def ensure_items_migrated(db: aiosqlite.Connection) -> None:
    try:
        async with db.execute("SELECT COUNT(*) FROM items") as cur:
            item_count = (await cur.fetchone())[0]
        async with db.execute("SELECT COUNT(*) FROM products") as cur:
            product_count = (await cur.fetchone())[0]
        if item_count > 0 or product_count == 0:
            return

        async with db.execute("SELECT * FROM products ORDER BY created_at, full_name") as cur:
            rows = [dict(r) for r in await cur.fetchall()]
        if not rows:
            return

        groups: dict[str, list[dict]] = {}
        for r in rows:
            fk = gawdee_item_family_key(str(r.get("full_name") or r.get("name") or ""))
            if not fk:
                fk = f"item-{str(r.get('id', '')).lower()}"
            groups.setdefault(fk, []).append(r)

        used_item_slugs = set()
        used_variant_slugs = set()

        def make_unique(base: str, used: set) -> str:
            b = re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-") or "item"
            candidate = b
            i = 2
            while candidate in used:
                candidate = f"{b}-{i}"
                i += 1
            used.add(candidate)
            return candidate

        for family_key, members in groups.items():
            members.sort(key=lambda x: len(str(x.get("id", ""))))
            main = members[0]

            def parse_weight(w: str) -> float:
                w = str(w).lower().strip()
                if m := re.match(r"^([\d.]+)\s*(kg|l|litre|litres|liter|liters)$", w):
                    return float(m.group(1)) * 1000.0
                if m := re.match(r"^([\d.]+)\s*(g|gm|gms|gram|grams|ml)$", w):
                    return float(m.group(1))
                return 999999.0

            members.sort(key=lambda x: parse_weight(x.get("weight", "")))
            item_slug = make_unique(family_key, used_item_slugs)

            gallery = []
            try:
                gallery = json.loads(str(main.get("gallery_json") or "[]"))
            except Exception:
                pass
            hover = gallery[1].get("src", "") if len(gallery) > 1 and isinstance(gallery[1], dict) else ""

            any_active = 1 if any(m.get("is_active") for m in members) else 0

            await db.execute(
                "INSERT INTO items (slug, name, flavor, description, image_url, hover_image_url, customer_review, category, category_key, tag, accent, rating, review_count, is_active) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (item_slug, str(main.get("name") or "Gawdee Product"), "", str(main.get("description") or ""),
                 str(main.get("image") or ""), hover, "", str(main.get("category") or ""), str(main.get("category_key") or ""),
                 str(main.get("tag") or ""), str(main.get("accent") or "#0a7540"), float(main.get("rating") or 0),
                 int(main.get("review_count") or 0), any_active),
            )
            async with db.execute("SELECT last_insert_rowid()") as cur:
                item_id = (await cur.fetchone())[0]

            for m in members:
                mrp = max(0, int(m.get("original_price") or 0))
                price = max(0, int(m.get("price") or 0))
                if mrp <= 0 and price > 0:
                    mrp = price
                if price > mrp:
                    price = mrp
                discount = gawdee_variant_discount(mrp, price)
                v_slug_base = str(m.get("slug") or "")
                if not v_slug_base:
                    w_slug = re.sub(r"[^a-z0-9]+", "-", str(m.get("weight") or "pack").lower())
                    v_slug_base = f"{item_slug}-{w_slug}"
                v_slug = make_unique(v_slug_base, used_variant_slugs)
                sku = str(m.get("sku") or "").strip()
                if not sku:
                    clean_name = re.sub(r"[^A-Z0-9]", "", f"{item_slug}-{m.get('weight', '')}".upper())[:8] or "ITEM"
                    hash_part = hashlib.md5(str(m.get("id") or v_slug).encode()).hexdigest()[:4].upper()
                    sku = f"GWD-{clean_name}-{hash_part}"

                v_img = str(m.get("image") or "")
                v_img_stored = v_img if v_img != str(main.get("image") or "") else ""

                try:
                    uom = await _parse_uom(str(m.get("weight") or ""))
                    await db.execute(
                        "INSERT INTO variant (item_id, variant_name, slug, sku, stock, mrp, discount, selling_price, is_inclusive, uom, image, legacy_product_id, is_active) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)",
                        (item_id, str(m.get("weight") or "Standard").strip() or "Standard", v_slug, sku,
                         max(0, int(m.get("stock") or 0)), mrp, discount, price, uom, v_img_stored,
                         str(m.get("id") or ""), 1 if m.get("is_active") else 0),
                    )
                except Exception:
                    continue

        await db.commit()
    except Exception:
        pass


# ── Canonical hierarchy DTOs (Phase 3) ───────────────────────────────────────
# camelCase, bounded, acyclic. Legacy snake_case surfaces are untouched;
# these serializers feed the /api/catalog/* endpoints only.

def to_category_dto(row: dict) -> dict:
    c = _cast_category(dict(row))
    par = c.get("parent")
    if isinstance(par, dict) and "parentId" not in par:
        par = {"id": int(par.get("id", 0)), "name": str(par.get("name", ""))} if par else None
    return {
        "id": c["id"],
        "name": c["name"],
        "filter": c["filter"],
        "imageUrl": c["image_url"],
        "icon": c["icon"],
        "sortOrder": c["sort_order"],
        "isActive": c["is_active"],
        "parentId": c.get("parent_id"),
        "parent": par,
        "childIds": [int(x) for x in (c.get("child_ids", []) or [])],
    }


async def get_category_dto(
    db: aiosqlite.Connection,
    category_id: int,
    include_inactive: bool = False,
) -> Optional[dict]:
    """Single category with shallow parent + child id list (acyclic)."""
    cat = await get_category_by_id(db, int(category_id)) if category_id else None
    if not cat:
        return None
    if not include_inactive and not cat.get("is_active", 1):
        return None
    cat["parent"] = await get_category_parent(db, cat)
    cat["child_ids"] = await get_category_child_ids(db, cat["id"], include_inactive)
    return to_category_dto(cat)


def to_variant_image_dto(row: dict) -> dict:
    return {
        "id": int(row.get("id", 0)),
        "name": str(row.get("name", "")),
        "variantId": int(row.get("variant_id", 0)),
        "imageUrl": str(row.get("image_url", row.get("image", ""))),
        "sortOrder": int(row.get("sort_order", 0)),
        "isActive": int(row.get("is_active", 1)),
    }


def to_variant_dto(variant: dict, images: Optional[list[dict]] = None, include_images: bool = True) -> dict:
    v = dict(variant)
    selling = int(v.get("selling_price", v.get("price", 0)) or 0)
    mrp = int(v.get("mrp") or 0)
    stock = int(v.get("stock", v.get("stock_quantity", 0)) or 0)
    imgs = images if images is not None else (v.get("images") or [])
    precise_discount = float(v.get("discount", calc_discount_percent(mrp, selling)) or 0)
    # Round (not truncate) so badges match the legacy surface: 16.95 → 17.
    display_percent = int(round(precise_discount)) if mrp > selling else 0
    display_percent = min(100, max(0, display_percent))
    dto = {
        "id": int(v.get("id", 0)),
        "itemId": int(v.get("item_id", 0)),
        "variantName": str(v.get("variant_name") or ""),
        "slug": str(v.get("slug") or ""),
        "sku": str(v.get("sku") or ""),
        "mrp": mrp,
        "sellingPrice": selling,
        "discount": precise_discount,
        "discountPercent": display_percent,
        "uom": str(v.get("uom") or ""),
        "stock": stock,
        "stockStatus": "in_stock" if stock > 0 else "out_of_stock",
        "isInclusive": bool(int(v.get("is_inclusive", v.get("is_inclusive_tax", 1)))),
        "isLabTested": bool(int(v.get("is_lab_tested", 1))),
        "isNatural": bool(int(v.get("is_natural", 1))),
        "image": str(v.get("image") or ""),
        "isActive": int(v.get("is_active", 1)),
        "createdAt": str(v.get("created_at") or ""),
        "updatedAt": str(v.get("updated_at") or ""),
    }
    if include_images:
        dto["images"] = [to_variant_image_dto(g) for g in imgs if isinstance(g, dict)]
    else:
        dto["imageCount"] = len([g for g in imgs if isinstance(g, dict)])
    return dto


def to_item_dto(
    item: dict,
    variants: Optional[list[dict]] = None,
    category: Optional[dict] = None,
    include_variant_images: bool = True,
) -> dict:
    i = dict(item)
    vs = variants if variants is not None else (i.get("variants") or [])
    cat = category if category is not None else i.get("category_obj", i.get("category"))
    if isinstance(cat, dict) and "imageUrl" not in cat:
        cat = to_category_dto(cat)
    return {
        "id": int(i.get("id", 0)),
        "slug": str(i.get("slug") or ""),
        "name": str(i.get("name") or ""),
        "flavor": str(i.get("flavor") or ""),
        "description": str(i.get("description") or ""),
        "image": str(i.get("image_url", i.get("image", "")) or ""),
        "imageUrl": str(i.get("image_url", i.get("image", "")) or ""),
        "hoverImage": str(i.get("hover_image_url", i.get("hover_image", "")) or ""),
        "hoverImageUrl": str(i.get("hover_image_url", i.get("hover_image", "")) or ""),
        "category": str(i.get("category") or ""),
        "categoryKey": str(i.get("category_key") or ""),
        "categoryId": i.get("category_id"),
        "categoryObj": cat,
        "tag": str(i.get("tag") or ""),
        "accent": str(i.get("accent") or ""),
        "rating": float(i.get("rating") or 0),
        "reviewCount": int(i.get("review_count") or 0),
        "isActive": int(i.get("is_active", 1)),
        "createdAt": str(i.get("created_at") or ""),
        "updatedAt": str(i.get("updated_at") or ""),
        "variants": [
            to_variant_dto(v, include_images=include_variant_images)
            for v in vs if isinstance(v, dict)
        ],
    }


async def get_item_dto(
    db: aiosqlite.Connection,
    ref: str | int,
    include_inactive: bool = False,
    include_variant_images: bool = True,
) -> Optional[dict]:
    """Full Category → Item → Variants → VariantImages hierarchy, one query set,
    acyclic by construction (parent is shallow, children are id lists)."""
    item = await get_item_with_variants(db, ref, include_inactive)
    if not item:
        return None
    return to_item_dto(item, include_variant_images=include_variant_images)


async def get_variants_dto(
    db: aiosqlite.Connection,
    item_id: Optional[int] = None,
    include_inactive: bool = True,
) -> list[dict]:
    """Flat variant list (each with its images). When item_id is given, only
    that item's variants are returned. Defaults to including inactive rows —
    callers filter for storefront use."""
    if item_id:
        rows = await get_variants_for_item(db, int(item_id), include_inactive)
    else:
        sql = "SELECT * FROM variant" + ("" if include_inactive else " WHERE is_active = 1") + " ORDER BY item_id, mrp, id"
        async with db.execute(sql) as cur:
            rows = [dict(r) for r in await cur.fetchall()]
        for r in rows:
            r["id"] = int(r["id"])
            r["item_id"] = int(r["item_id"])
            r["images"] = await get_variant_images(db, r["id"], include_inactive)
    return [to_variant_dto(r) for r in rows]


async def get_category_subtree_ids(db: aiosqlite.Connection, category_id: int) -> set[int]:
    """Category id plus all descendant ids (cycle-safe). Used so filtering by
    a parent category also returns items in its subcategories."""
    seen: set[int] = set()
    stack = [int(category_id)]
    depth = 0
    while stack and depth <= 100:
        depth += 1
        current = stack.pop()
        if current in seen or current <= 0:
            continue
        seen.add(current)
        async with db.execute("SELECT id FROM category WHERE parent_id = ?", (current,)) as cur:
            stack.extend(int(r["id"]) for r in await cur.fetchall())
    return seen


async def get_items_dto(
    db: aiosqlite.Connection,
    category_id: Optional[int] = None,
    include_inactive: bool = False,
) -> list[dict]:
    """Bounded list surface: full variant pricing/stock, images omitted
    (imageCount only) to keep list payloads small. A category_id filter
    includes that category's whole subtree."""
    allowed: Optional[set[int]] = None
    if category_id:
        allowed = await get_category_subtree_ids(db, category_id)
    items = await get_items(db, include_inactive=include_inactive, with_variants=False)
    out = []
    for item in items:
        if allowed is not None and int(item.get("category_id") or 0) not in allowed:
            continue
        variants = await get_variants_for_item(db, item["id"], include_inactive)
        category = await get_category_for_item(db, item)
        out.append(to_item_dto(item, variants=variants, category=category, include_variant_images=False))
    return out
