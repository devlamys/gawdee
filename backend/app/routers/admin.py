from fastapi import APIRouter, HTTPException, Depends, Header, Request, Response, UploadFile, File, Form
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Any, Dict
import bcrypt
import hmac
import hashlib
import base64
import time
import re
from datetime import datetime, timezone
import json
import secrets
import shutil
from pathlib import Path

from ..database import (
    get_db,
    execute,
    fetch_all,
    fetch_one,
    get_setting,
    set_setting,
    encrypt_value,
    decrypt_value,
    get_secret_key,
    get_items,
    get_item_by_id,
    get_item_with_variants,
    save_item_with_variants,
    delete_item,
    create_variant,
    update_variant,
    delete_variant,
    add_variant_image,
    delete_variant_image,
    sync_item_mirrors,
    sync_variant_mirror,
    get_combos,
    get_combo_by_id,
    create_combo,
    update_combo,
    delete_combo,
)
from ..core.config import settings

router = APIRouter(tags=["admin"])

def _public_upload_base() -> Path:
    """Directory served at /assets/uploads/... (configured via .env, never os.environ here)."""
    return settings.public_upload_base

# ── Password Verification ───────────────────────────────────────────────────

def verify_admin_password(plain_password: str, hashed_password: str) -> bool:
    try:
        h = hashed_password
        if h.startswith("$2y$"):
            h = "$2b$" + h[4:]
        return bcrypt.checkpw(plain_password.encode("utf-8"), h.encode("utf-8"))
    except Exception:
        return False

# ── Admin Auth Tokens (HMAC Signed) ─────────────────────────────────────────

def create_admin_token(user: dict) -> str:
    data = {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "exp": int(time.time()) + settings.ADMIN_TOKEN_TTL_SECONDS,
    }
    payload = base64.b64encode(json.dumps(data).encode()).decode()
    sig = hmac.new(get_secret_key(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"

def verify_admin_token(token: str) -> Optional[dict]:
    try:
        payload, sig = token.rsplit(".", 1)
        expected = hmac.new(get_secret_key(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, sig):
            return None
        data = json.loads(base64.b64decode(payload.encode()).decode())
        if data.get("exp", 0) < int(time.time()):
            return None
        if data.get("role") != "admin":
            return None
        return data
    except Exception:
        return None

async def get_current_admin(
    authorization: Optional[str] = Header(None),
    request: Request = None,
) -> Dict[str, Any]:
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
    elif request and settings.ADMIN_COOKIE_NAME in request.cookies:
        token = request.cookies.get(settings.ADMIN_COOKIE_NAME)
    elif request and "admin_session" in request.cookies:
        token = request.cookies.get("admin_session")

    if token:
        admin_data = verify_admin_token(token)
        if admin_data:
            return admin_data

    raise HTTPException(status_code=401, detail="Administrator authentication required")


# ── Auth Endpoints ──────────────────────────────────────────────────────────

class AdminLoginPayload(BaseModel):
    email: str
    password: str

class AdminSetupPayload(BaseModel):
    name: str
    email: EmailStr
    password: str
    password_confirmation: str

async def _admin_count() -> int:
    row = await fetch_one("SELECT count(*) as c FROM users WHERE role = 'admin'")
    return int(row["c"]) if row else 0

@router.get("/setup-status")
async def admin_setup_status():
    """Public: tells the login page whether first-admin setup is still open."""
    return {"ok": True, "setup_required": await _admin_count() == 0}

@router.post("/setup")
async def admin_setup(payload: AdminSetupPayload, response: Response):
    """Public one-time first-admin registration. Refuses once any admin exists."""
    if await _admin_count() > 0:
        raise HTTPException(status_code=403, detail="An administrator already exists. Please sign in.")
    name = payload.name.strip()
    email = str(payload.email).lower().strip()
    if len(name) < 2 or len(name) > 80:
        raise HTTPException(status_code=422, detail="Enter the administrator's full name.")
    if len(payload.password) < 8 or not re.search(r"[A-Za-z]", payload.password) or not re.search(r"[0-9]", payload.password):
        raise HTTPException(status_code=422, detail="Use at least 8 characters with a letter and a number.")
    if payload.password != payload.password_confirmation:
        raise HTTPException(status_code=422, detail="The password confirmation does not match.")
    try:
        password_hash = bcrypt.hashpw(payload.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        await execute(
            "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')",
            (name, email, password_hash),
        )
    except Exception as exc:
        if "unique" in str(exc).lower():
            raise HTTPException(status_code=422, detail="An account already exists for this email.")
        raise HTTPException(status_code=422, detail="Unable to create the administrator account.")
    user = await fetch_one("SELECT * FROM users WHERE lower(email) = ? AND role = 'admin'", (email,))
    if not user:
        raise HTTPException(status_code=422, detail="Unable to create the administrator account.")
    await execute("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?", (user["id"],))
    admin_data = {"id": user["id"], "name": user["name"], "email": user["email"], "role": user["role"]}
    token = create_admin_token(admin_data)
    response.set_cookie(
        key=settings.ADMIN_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite=settings.ADMIN_COOKIE_SAMESITE,
        secure=settings.ADMIN_COOKIE_SECURE,
        max_age=settings.ADMIN_TOKEN_TTL_SECONDS,
    )
    return {"ok": True, "token": token, "admin": admin_data}

@router.post("/login")
async def admin_login(payload: AdminLoginPayload, response: Response):
    email = payload.email.lower().strip()
    user = await fetch_one("SELECT * FROM users WHERE lower(email) = ? AND role = 'admin'", (email,))
    
    if not user:
        # If user count is 0 or no admin user exists, allow first admin setup or test check
        admin_count = await fetch_one("SELECT count(*) as c FROM users WHERE role = 'admin'")
        if not admin_count or admin_count["c"] == 0:
            raise HTTPException(status_code=401, detail="No admin account found. Please run admin setup.")
        raise HTTPException(status_code=401, detail="Invalid admin email or password")

    password_hash = str(user["password_hash"])
    if not verify_admin_password(payload.password, password_hash):
        raise HTTPException(status_code=401, detail="Invalid admin email or password")

    # Update last login
    await execute("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?", (user["id"],))

    admin_data = {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
    }
    token = create_admin_token(admin_data)

    # Set cookie
    response.set_cookie(
        key=settings.ADMIN_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite=settings.ADMIN_COOKIE_SAMESITE,
        secure=settings.ADMIN_COOKIE_SECURE,
        max_age=settings.ADMIN_TOKEN_TTL_SECONDS,
    )

    return {"ok": True, "token": token, "admin": admin_data}

@router.get("/me")
async def admin_me(admin: Dict[str, Any] = Depends(get_current_admin)):
    return {"ok": True, "admin": admin}

@router.post("/logout")
async def admin_logout(response: Response):
    response.delete_cookie(settings.ADMIN_COOKIE_NAME, path="/")
    return {"ok": True}


# ── Dashboard Stats ─────────────────────────────────────────────────────────

@router.get("/stats")
async def admin_stats(admin: Dict[str, Any] = Depends(get_current_admin)):
    orders_row = await fetch_one("SELECT count(*) as count, coalesce(sum(case when payment_status = 'paid' then total else 0 end), 0) as revenue FROM orders")
    today_row = await fetch_one("SELECT count(*) as count FROM orders WHERE date(created_at) = date('now')")
    attention_row = await fetch_one("SELECT count(*) as count FROM orders WHERE status IN ('pending','on_hold') OR payment_status IN ('initializing','failed')")
    prod_row = await fetch_one("SELECT count(*) as count FROM products WHERE is_active = 1")

    # Top selling products
    top_products = await fetch_all("""
        SELECT p.id, p.name, p.weight, p.price, p.image, coalesce(sum(oi.quantity), 0) as units_sold
        FROM products p
        LEFT JOIN order_items oi ON p.id = oi.product_id
        GROUP BY p.id
        ORDER BY units_sold DESC, p.id ASC
        LIMIT ?
    """, (settings.ADMIN_TOP_PRODUCTS_LIMIT,))

    # Recent orders
    recent_orders = await fetch_all("""
        SELECT id, order_number, customer_name, email as customer_email, phone as customer_phone, total as total_amount, status, payment_status, created_at
        FROM orders
        ORDER BY id DESC
        LIMIT ?
    """, (settings.ADMIN_RECENT_ORDERS_LIMIT,))

    return {
        "ok": True,
        "stats": {
            "orders": orders_row["count"] if orders_row else 0,
            "revenue": int(orders_row["revenue"]) if orders_row else 0,
            "today": today_row["count"] if today_row else 0,
            "attention": attention_row["count"] if attention_row else 0,
            "products": prod_row["count"] if prod_row else 0,
        },
        "top_products": [dict(p) for p in top_products],
        "recent_orders": [dict(o) for o in recent_orders],
    }


# ── Products Endpoints ──────────────────────────────────────────────────────

@router.get("/products")
async def admin_get_products(admin: Dict[str, Any] = Depends(get_current_admin)):
    products = await fetch_all("SELECT * FROM products ORDER BY category ASC, id ASC")
    return {"ok": True, "products": [dict(p) for p in products]}

class ProductVariantItem(BaseModel):
    id: str
    weight: str
    price: int
    original_price: Optional[int] = 0
    stock: Optional[int] = 50
    full_name: Optional[str] = ""
    slug: Optional[str] = ""
    image: Optional[str] = ""
    is_active: Optional[bool] = True

class SaveProductPayload(BaseModel):
    id: Optional[str] = None
    name: str
    full_name: Optional[str] = ""
    category: str
    category_key: str
    tag: Optional[str] = ""
    price: Optional[int] = 0
    original_price: Optional[int] = 0
    weight: Optional[str] = ""
    image: Optional[str] = ""
    description: Optional[str] = ""
    accent: Optional[str] = "#009a84"
    stock: Optional[int] = 50
    is_active: Optional[bool] = True
    variants: Optional[List[ProductVariantItem]] = None

@router.post("/products")
async def admin_save_product(payload: SaveProductPayload, admin: Dict[str, Any] = Depends(get_current_admin)):
    if payload.variants and len(payload.variants) > 0:
        for v in payload.variants:
            v_id = v.id.strip().lower()
            if not v_id:
                continue
            full_name = v.full_name or f"{payload.name} {v.weight}".strip()
            slug = v.slug or v_id
            img = v.image or payload.image or "/assets/images/logo.png"
            
            await execute("""
                INSERT INTO products (id, slug, name, full_name, category, category_key, tag, price, original_price, weight, image, description, accent, stock, is_active, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                    slug=excluded.slug, name=excluded.name, full_name=excluded.full_name,
                    category=excluded.category, category_key=excluded.category_key, tag=excluded.tag,
                    price=excluded.price, original_price=excluded.original_price, weight=excluded.weight,
                    image=excluded.image, description=excluded.description, accent=excluded.accent,
                    stock=excluded.stock, is_active=excluded.is_active, updated_at=CURRENT_TIMESTAMP
            """, (
                v_id, slug, payload.name, full_name, payload.category, payload.category_key,
                payload.tag, v.price, v.original_price or 0, v.weight, img,
                payload.description, payload.accent or "#009a84", v.stock or 0, 1 if v.is_active else 0
            ))
            await execute("UPDATE products SET stock_status = CASE WHEN stock > 0 THEN 'in_stock' ELSE 'out_of_stock' END WHERE id = ?", (v_id,))
    else:
        p_id = payload.id or payload.name.lower().replace(" ", "-")
        full_name = payload.full_name or payload.name
        slug = p_id
        await execute("""
            INSERT INTO products (id, slug, name, full_name, category, category_key, tag, price, original_price, weight, image, description, accent, stock, is_active, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                slug=excluded.slug, name=excluded.name, full_name=excluded.full_name,
                category=excluded.category, category_key=excluded.category_key, tag=excluded.tag,
                price=excluded.price, original_price=excluded.original_price, weight=excluded.weight,
                image=excluded.image, description=excluded.description, accent=excluded.accent,
                stock=excluded.stock, is_active=excluded.is_active, updated_at=CURRENT_TIMESTAMP
        """, (
            p_id, slug, payload.name, full_name, payload.category, payload.category_key,
            payload.tag, payload.price, payload.original_price or 0, payload.weight, payload.image or "/assets/images/logo.png",
            payload.description, payload.accent or "#009a84", payload.stock or 0, 1 if payload.is_active else 0
        ))
        await execute("UPDATE products SET stock_status = CASE WHEN stock > 0 THEN 'in_stock' ELSE 'out_of_stock' END WHERE id = ?", (p_id,))

    return {"ok": True, "message": "Product saved successfully"}

@router.post("/products/{product_id}/toggle")
async def admin_toggle_product(product_id: str, admin: Dict[str, Any] = Depends(get_current_admin)):
    prod = await fetch_one("SELECT is_active FROM products WHERE id = ?", (product_id,))
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found")
    new_status = 0 if prod["is_active"] else 1
    await execute("UPDATE products SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (new_status, product_id))
    return {"ok": True, "is_active": new_status}

@router.delete("/products/{product_id}")
async def admin_delete_product(product_id: str, admin: Dict[str, Any] = Depends(get_current_admin)):
    await execute("DELETE FROM products WHERE id = ?", (product_id,))
    return {"ok": True, "message": "Product deleted"}


# ── Items & Variants Endpoints ──────────────────────────────────────────────

@router.get("/items")
async def admin_get_items(admin: Dict[str, Any] = Depends(get_current_admin)):
    db = await get_db()
    try:
        items = await get_items(db, include_inactive=True, with_variants=True)
        return {"ok": True, "items": items}
    finally:
        await db.close()


@router.post("/items")
async def admin_save_item(payload: Dict[str, Any], admin: Dict[str, Any] = Depends(get_current_admin)):
    db = await get_db()
    try:
        item_data = payload.get("item") or payload
        variants_data = payload.get("variants") or []
        item_id = int(payload.get("item_id") or item_data.get("id") or 0) or None
        new_id = await save_item_with_variants(db, item_data, variants_data, item_id)
        await sync_item_mirrors(db, new_id)
        saved = await get_item_with_variants(db, new_id, True)
        return {"ok": True, "message": "Item saved successfully", "item_id": new_id, "item": saved}
    except ValueError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")
    finally:
        await db.close()


@router.delete("/items/{item_id}")
async def admin_delete_item(item_id: int, admin: Dict[str, Any] = Depends(get_current_admin)):
    db = await get_db()
    try:
        await delete_item(db, item_id)
        return {"ok": True, "message": "Item deleted"}
    finally:
        await db.close()


@router.post("/items/{item_id}/toggle")
async def admin_toggle_item(item_id: int, admin: Dict[str, Any] = Depends(get_current_admin)):
    db = await get_db()
    try:
        item = await get_item_by_id(db, item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")
        new_status = 0 if item["is_active"] else 1
        await db.execute("UPDATE items SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (new_status, item_id))
        await db.commit()
        await sync_item_mirrors(db, item_id)
        return {"ok": True, "is_active": new_status}
    finally:
        await db.close()


# ── Categories Endpoints ────────────────────────────────────────────────────

@router.get("/categories")
async def admin_get_categories(admin: Dict[str, Any] = Depends(get_current_admin)):
    return {"ok": True, "categories": await _admin_category_rows()}


async def _admin_category_rows() -> list[dict]:
    from ..database import get_db, get_categories, get_category_dto
    db = await get_db()
    try:
        rows = await get_categories(db, include_inactive=True)
        out = []
        for r in rows:
            dto = await get_category_dto(db, int(r["id"]), include_inactive=True)
            if dto:
                # Legacy alias (admin UI reads `image`).
                dto["image"] = dto["imageUrl"]
                out.append(dto)
        return out
    finally:
        await db.close()

class SaveCategoryPayload(BaseModel):
    id: Optional[int] = None
    name: str
    filter: str
    image: Optional[str] = ""
    image_url: Optional[str] = None
    icon: Optional[str] = ""
    parent_id: Optional[int] = None
    sort_order: Optional[int] = 0
    is_active: Optional[bool] = True

@router.post("/categories")
async def admin_save_category(payload: SaveCategoryPayload, admin: Dict[str, Any] = Depends(get_current_admin)):
    from ..database import validate_category_fields, assert_no_category_cycle, get_db
    clean = validate_category_fields({
        "name": payload.name,
        "filter": payload.filter,
        "image_url": payload.image_url if payload.image_url is not None else payload.image,
        "icon": payload.icon,
        "parent_id": payload.parent_id,
        "sort_order": payload.sort_order,
        "is_active": payload.is_active,
    })
    db = await get_db()
    try:
        if clean["parent_id"]:
            from ..database import get_category_by_id
            if not await get_category_by_id(db, clean["parent_id"]):
                raise HTTPException(status_code=422, detail="Parent category does not exist.")
            try:
                await assert_no_category_cycle(db, payload.id or 0, clean["parent_id"])
            except ValueError as e:
                raise HTTPException(status_code=422, detail=str(e))
    finally:
        await db.close()
    if payload.id:
        await execute("""
            UPDATE category SET name = ?, filter = ?, image_url = ?, icon = ?, parent_id = ?, sort_order = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (clean["name"], clean["filter"], clean["image_url"], clean["icon"], clean["parent_id"], clean["sort_order"], clean["is_active"], payload.id))
    else:
        await execute("""
            INSERT INTO category (name, filter, image_url, icon, parent_id, sort_order, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (clean["name"], clean["filter"], clean["image_url"], clean["icon"], clean["parent_id"], clean["sort_order"], clean["is_active"]))
    return {"ok": True, "message": "Category saved"}

@router.delete("/categories/{category_id}")
async def admin_delete_category(category_id: int, admin: Dict[str, Any] = Depends(get_current_admin)):
    await execute("DELETE FROM category WHERE id = ?", (category_id,))
    return {"ok": True, "message": "Category deleted"}


# ── Orders Workbench ────────────────────────────────────────────────────────

@router.get("/orders")
async def admin_get_orders(
    status: Optional[str] = None,
    search: Optional[str] = None,
    admin: Dict[str, Any] = Depends(get_current_admin),
):
    query = "SELECT * FROM orders WHERE 1=1"
    params: List[Any] = []
    if status and status != "all":
        query += " AND status = ?"
        params.append(status)
    if search:
        query += " AND (order_number LIKE ? OR customer_name LIKE ? OR email LIKE ? OR phone LIKE ?)"
        term = f"%{search}%"
        params.extend([term, term, term, term])
    query += " ORDER BY id DESC"
    orders = await fetch_all(query, tuple(params))
    return {"ok": True, "orders": [dict(o) for o in orders]}

@router.get("/orders/{order_id}")
async def admin_get_order_detail(order_id: int, admin: Dict[str, Any] = Depends(get_current_admin)):
    order = await fetch_one("SELECT * FROM orders WHERE id = ?", (order_id,))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    items = await fetch_all("SELECT * FROM order_items WHERE order_id = ?", (order_id,))
    events = await fetch_all("SELECT * FROM order_status_events WHERE order_id = ? ORDER BY id ASC", (order_id,))
    return {
        "ok": True,
        "order": dict(order),
        "items": [dict(i) for i in items],
        "events": [dict(e) for e in events],
    }


@router.get("/customer-reviews")
async def admin_customer_reviews(
    search: Optional[str] = None,
    product_id: Optional[int] = None,
    sort: str = "newest",
    admin: Dict[str, Any] = Depends(get_current_admin),
):
    sort_sql = {
        "newest": "r.id DESC",
        "oldest": "r.id ASC",
        "product": "p.name COLLATE NOCASE ASC, r.id DESC",
        "name": "r.name COLLATE NOCASE ASC, r.id DESC",
        "email": "r.email COLLATE NOCASE ASC, r.id DESC",
        "rating_high": "r.rating DESC, r.id DESC",
        "rating_low": "r.rating ASC, r.id DESC",
    }.get(sort, "r.id DESC")
    query = """
        SELECT r.id, r.product_id, p.name AS product_name, p.slug AS product_slug,
               r.rating, r.review, r.name, r.email, r.status, r.created_at,
               EXISTS (
                   SELECT 1 FROM users u
                   JOIN orders o ON o.user_id = u.id
                   JOIN order_items oi ON oi.order_id = o.id
                   JOIN variant v ON CAST(v.id AS TEXT) = oi.product_id
                                     OR (v.legacy_product_id != '' AND v.legacy_product_id = oi.product_id)
                   WHERE lower(u.email) = lower(r.email)
                     AND v.item_id = r.product_id
                     AND (o.payment_status = 'paid' OR o.status = 'delivered')
                     AND o.status NOT IN ('cancelled', 'refunded')
               ) AS verified_purchase
        FROM product_reviews r
        LEFT JOIN items p ON p.id = r.product_id
        WHERE 1=1
    """
    params: List[Any] = []
    if search:
        query += " AND (r.name LIKE ? OR r.email LIKE ? OR r.review LIKE ? OR p.name LIKE ?)"
        term = f"%{search.strip()}%"
        params.extend([term, term, term, term])
    if product_id:
        query += " AND r.product_id = ?"
        params.append(product_id)
    query += f" ORDER BY {sort_sql} LIMIT 500"
    reviews = await fetch_all(query, tuple(params))
    return {"ok": True, "reviews": [dict(row) for row in reviews], "count": len(reviews)}

class UpdateOrderStatusPayload(BaseModel):
    status: str
    note: Optional[str] = ""

@router.post("/orders/{order_id}/status")
async def admin_update_order_status(order_id: int, payload: UpdateOrderStatusPayload, admin: Dict[str, Any] = Depends(get_current_admin)):
    order = await fetch_one("SELECT * FROM orders WHERE id = ?", (order_id,))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    await execute("UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (payload.status, order_id))
    await execute(
        "INSERT INTO order_status_events (order_id, status, title, description) VALUES (?, ?, ?, ?)",
        (order_id, payload.status, "Order updated", payload.note or f"Updated from {order['status']} to {payload.status}"),
    )
    return {"ok": True, "status": payload.status}

class UpdateOrderTrackingPayload(BaseModel):
    tracking_number: str
    courier_name: Optional[str] = ""
    tracking_url: Optional[str] = ""

@router.post("/orders/{order_id}/tracking")
async def admin_update_order_tracking(order_id: int, payload: UpdateOrderTrackingPayload, admin: Dict[str, Any] = Depends(get_current_admin)):
    await execute("""
        UPDATE orders SET
            tracking_number = ?,
            courier_name = ?,
            tracking_url = ?,
            status = CASE WHEN status = 'pending' THEN 'shipped' ELSE status END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (payload.tracking_number, payload.courier_name, payload.tracking_url, order_id))
    return {"ok": True, "message": "Tracking details updated"}


# ── Reels Video Manager ─────────────────────────────────────────────────────

@router.get("/reels")
async def admin_get_reels(admin: Dict[str, Any] = Depends(get_current_admin)):
    reels = await fetch_all("SELECT * FROM homepage_media WHERE section_key = 'reels' ORDER BY sort_order ASC, id DESC")
    return {"ok": True, "reels": [dict(r) for r in reels]}

class SaveReelPayload(BaseModel):
    id: Optional[int] = None
    title: str
    subtitle: Optional[str] = ""
    file_path: Optional[str] = ""
    poster_path: Optional[str] = ""
    external_url: Optional[str] = ""
    link_url: Optional[str] = ""
    alt_text: Optional[str] = ""
    product_slug: Optional[str] = ""
    sort_order: Optional[int] = 0
    is_active: Optional[bool] = True

@router.post("/reels")
async def admin_save_reel(payload: SaveReelPayload, admin: Dict[str, Any] = Depends(get_current_admin)):
    if payload.id:
        await execute("""
            UPDATE homepage_media SET
                title = ?, subtitle = ?, file_path = ?, poster_path = ?, external_url = ?,
                link_url = ?, alt_text = ?, product_slug = ?, sort_order = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND section_key = 'reels'
        """, (
            payload.title, payload.subtitle, payload.file_path, payload.poster_path, payload.external_url,
            payload.link_url, payload.alt_text, payload.product_slug, payload.sort_order, 1 if payload.is_active else 0,
            payload.id
        ))
    else:
        await execute("""
            INSERT INTO homepage_media (section_key, media_type, title, subtitle, file_path, poster_path, external_url, link_url, alt_text, product_slug, sort_order, is_active)
            VALUES ('reels', 'video', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            payload.title, payload.subtitle, payload.file_path, payload.poster_path, payload.external_url,
            payload.link_url, payload.alt_text, payload.product_slug, payload.sort_order, 1 if payload.is_active else 0
        ))
    return {"ok": True, "message": "Reel saved successfully"}

@router.delete("/reels/{reel_id}")
async def admin_delete_reel(reel_id: int, admin: Dict[str, Any] = Depends(get_current_admin)):
    await execute("DELETE FROM homepage_media WHERE id = ? AND section_key = 'reels'", (reel_id,))
    return {"ok": True, "message": "Reel deleted"}


# ── Offers Manager ─────────────────────────────────────────────────────────────

@router.get("/offers")
async def admin_get_offers(admin: Dict[str, Any] = Depends(get_current_admin)):
    offers = await fetch_all("SELECT * FROM offers ORDER BY sort_order ASC, id DESC")
    return {"ok": True, "offers": [dict(r) for r in offers]}

class SaveOfferPayload(BaseModel):
    id: Optional[int] = None
    title: str
    subtitle: Optional[str] = ""
    description: Optional[str] = ""
    badge: Optional[str] = "HOT DEAL"
    image_url: Optional[str] = ""
    link_url: Optional[str] = "#shop"
    cta_label: Optional[str] = "Shop now"
    sort_order: Optional[int] = 0
    is_active: Optional[bool] = True

@router.post("/offers")
async def admin_save_offer(payload: SaveOfferPayload, admin: Dict[str, Any] = Depends(get_current_admin)):
    if payload.id:
        await execute("""
            UPDATE offers SET
                title = ?, subtitle = ?, description = ?, badge = ?, image_url = ?, link_url = ?, cta_label = ?, sort_order = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (
            payload.title, payload.subtitle, payload.description, payload.badge,
            payload.image_url, payload.link_url, payload.cta_label,
            payload.sort_order, 1 if payload.is_active else 0, payload.id,
        ))
        offer = await fetch_one("SELECT * FROM offers WHERE id = ?", (payload.id,))
    else:
        await execute("""
            INSERT INTO offers (title, subtitle, description, badge, image_url, link_url, cta_label, sort_order, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            payload.title, payload.subtitle, payload.description, payload.badge,
            payload.image_url, payload.link_url, payload.cta_label,
            payload.sort_order, 1 if payload.is_active else 0,
        ))
        offer = await fetch_one("SELECT * FROM offers WHERE title = ? AND link_url = ? ORDER BY id DESC LIMIT 1", (payload.title, payload.link_url))
    if offer and int(offer.get("is_active") or 0) == 1:
        try:
            from ..integrations import dispatch_offer_campaigns
            db = await get_db()
            try:
                await dispatch_offer_campaigns(db, {
                    "title": offer.get("title") or payload.title,
                    "description": offer.get("description") or payload.description or "",
                    "url": offer.get("link_url") or payload.link_url,
                    "image_url": offer.get("image_url") or payload.image_url or "",
                })
            finally:
                await db.close()
        except Exception:
            pass
    return {"ok": True, "message": "Offer saved successfully"}

@router.delete("/offers/{offer_id}")
async def admin_delete_offer(offer_id: int, admin: Dict[str, Any] = Depends(get_current_admin)):
    await execute("DELETE FROM offers WHERE id = ?", (offer_id,))
    return {"ok": True, "message": "Offer deleted"}


# ── Combos Manager (curated bundles for `nhp-combos__grid`) ─────────────────

@router.get("/combos")
async def admin_get_combos(admin: Dict[str, Any] = Depends(get_current_admin)):
    db = await get_db()
    try:
        return {"ok": True, "combos": await get_combos(db, include_inactive=True)}
    finally:
        await db.close()

class SaveComboPayload(BaseModel):
    id: Optional[int] = None
    title: str
    slug: Optional[str] = ""
    # `nhp-combo__category` eyebrow label (e.g. EVERYDAY SWEETENING DUO)
    category: Optional[str] = ""
    description: Optional[str] = ""
    details: Optional[str] = None
    image: Optional[str] = ""
    product_one_ref: Optional[str] = None
    productOneRef: Optional[str] = None
    product_two_ref: Optional[str] = None
    productTwoRef: Optional[str] = None
    selling_price: Optional[int] = None
    price: Optional[int] = None
    mrp: Optional[int] = None
    original_price: Optional[int] = None
    discount: Optional[float] = None
    discount_percent: Optional[float] = None
    sort_order: Optional[int] = 0
    sortOrder: Optional[int] = None
    is_active: Optional[bool] = None
    isActive: Optional[bool] = None

@router.post("/combos")
async def admin_save_combo(payload: SaveComboPayload, admin: Dict[str, Any] = Depends(get_current_admin)):
    data = payload.model_dump(exclude_unset=True)
    # camelCase aliases accepted from the admin UI; snake_case wins on conflict.
    if "productOneRef" in data and "product_one_ref" not in data:
        data["product_one_ref"] = data.pop("productOneRef")
    else:
        data.pop("productOneRef", None)
    if "productTwoRef" in data and "product_two_ref" not in data:
        data["product_two_ref"] = data.pop("productTwoRef")
    else:
        data.pop("productTwoRef", None)
    if data.get("details") and not data.get("description"):
        data["description"] = data["details"]
    data.pop("details", None)
    if data.get("price") is not None and data.get("selling_price") is None:
        data["selling_price"] = data["price"]
    data.pop("price", None)
    if data.get("original_price") is not None and data.get("mrp") is None:
        data["mrp"] = data["original_price"]
    data.pop("original_price", None)
    if data.get("discount_percent") is not None and data.get("discount") is None:
        data["discount"] = data["discount_percent"]
    data.pop("discount_percent", None)
    if data.get("sortOrder") is not None and not data.get("sort_order"):
        data["sort_order"] = data["sortOrder"]
    data.pop("sortOrder", None)
    if data.get("isActive") is not None and data.get("is_active") is None:
        data["is_active"] = data["isActive"]
    data.pop("isActive", None)

    db = await get_db()
    try:
        combo_id = data.pop("id", None)
        if combo_id:
            try:
                await update_combo(db, int(combo_id), data)
            except ValueError as e:
                raise HTTPException(status_code=422, detail=str(e))
            saved = await get_combo_by_id(db, int(combo_id), include_inactive=True)
            return {"ok": True, "message": "Combo updated successfully", "combo_id": int(combo_id), "combo": saved}
        try:
            new_id = await create_combo(db, data)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        saved = await get_combo_by_id(db, new_id, include_inactive=True)
        return {"ok": True, "message": "Combo created successfully", "combo_id": new_id, "combo": saved}
    finally:
        await db.close()

@router.post("/combos/{combo_id}/toggle")
async def admin_toggle_combo(combo_id: int, admin: Dict[str, Any] = Depends(get_current_admin)):
    db = await get_db()
    try:
        combo = await get_combo_by_id(db, combo_id, include_inactive=True)
        if not combo:
            raise HTTPException(status_code=404, detail="Combo not found")
        await update_combo(db, combo_id, {"is_active": not bool(combo.get("is_active"))})
        saved = await get_combo_by_id(db, combo_id, include_inactive=True)
        return {"ok": True, "is_active": saved["is_active"] if saved else 0}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    finally:
        await db.close()

@router.delete("/combos/{combo_id}")
async def admin_delete_combo(combo_id: int, admin: Dict[str, Any] = Depends(get_current_admin)):
    db = await get_db()
    try:
        try:
            await delete_combo(db, combo_id)
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        return {"ok": True, "message": "Combo deleted"}
    finally:
        await db.close()


# ── Banners & Banners Two ───────────────────────────────────────────────────

@router.get("/banners")
async def admin_get_banners(admin: Dict[str, Any] = Depends(get_current_admin)):
    banners = await fetch_all("SELECT * FROM banners ORDER BY sort_order ASC, id ASC")
    return {"ok": True, "banners": [dict(b) for b in banners]}

class SaveBannerPayload(BaseModel):
    id: Optional[int] = None
    title: str
    desktop_image: Optional[str] = ""
    mobile_image: Optional[str] = ""
    link_url: Optional[str] = "#shop"
    alt_text: Optional[str] = ""
    sort_order: Optional[int] = 0
    is_active: Optional[bool] = True

@router.post("/banners")
async def admin_save_banner(payload: SaveBannerPayload, admin: Dict[str, Any] = Depends(get_current_admin)):
    if payload.id:
        await execute("""
            UPDATE banners SET
                title = ?, desktop_image = ?, mobile_image = ?, link_url = ?,
                alt_text = ?, sort_order = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (
            payload.title, payload.desktop_image, payload.mobile_image, payload.link_url,
            payload.alt_text, payload.sort_order, 1 if payload.is_active else 0,
            payload.id
        ))
    else:
        await execute("""
            INSERT INTO banners (title, desktop_image, mobile_image, link_url, alt_text, sort_order, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            payload.title, payload.desktop_image, payload.mobile_image, payload.link_url,
            payload.alt_text, payload.sort_order, 1 if payload.is_active else 0
        ))
    return {"ok": True, "message": "Banner saved"}

@router.delete("/banners/{banner_id}")
async def admin_delete_banner(banner_id: int, admin: Dict[str, Any] = Depends(get_current_admin)):
    await execute("DELETE FROM banners WHERE id = ?", (banner_id,))
    return {"ok": True, "message": "Banner deleted"}

@router.get("/banners-two")
async def admin_get_banners_two(admin: Dict[str, Any] = Depends(get_current_admin)):
    banners = await fetch_all("SELECT * FROM hero_banners_two ORDER BY sort_order ASC, id ASC")
    return {"ok": True, "banners": [dict(b) for b in banners]}

class SaveBannerTwoPayload(BaseModel):
    id: Optional[int] = None
    title: str
    cat: Optional[str] = ""
    title_html: Optional[str] = ""
    word: Optional[str] = ""
    sub: Optional[str] = ""
    price_label: Optional[str] = ""
    mrp_label: Optional[str] = ""
    off_badge: Optional[str] = ""
    reviews_label: Optional[str] = ""
    product_image: Optional[str] = ""
    cart_id: Optional[str] = ""
    cart_name: Optional[str] = ""
    cart_price: Optional[int] = 0
    cart_image: Optional[str] = ""
    sort_order: Optional[int] = 0
    is_active: Optional[bool] = True

@router.post("/banners-two")
async def admin_save_banner_two(payload: SaveBannerTwoPayload, admin: Dict[str, Any] = Depends(get_current_admin)):
    if payload.id:
        await execute("""
            UPDATE hero_banners_two SET
                title = ?, cat = ?, title_html = ?, word = ?, sub = ?, price_label = ?, mrp_label = ?,
                off_badge = ?, reviews_label = ?, product_image = ?, cart_id = ?, cart_name = ?,
                cart_price = ?, cart_image = ?, sort_order = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (
            payload.title, payload.cat, payload.title_html, payload.word, payload.sub, payload.price_label,
            payload.mrp_label, payload.off_badge, payload.reviews_label, payload.product_image, payload.cart_id,
            payload.cart_name, payload.cart_price, payload.cart_image, payload.sort_order, 1 if payload.is_active else 0,
            payload.id
        ))
    else:
        await execute("""
            INSERT INTO hero_banners_two (title, cat, title_html, word, sub, price_label, mrp_label, off_badge, reviews_label, product_image, cart_id, cart_name, cart_price, cart_image, sort_order, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            payload.title, payload.cat, payload.title_html, payload.word, payload.sub, payload.price_label,
            payload.mrp_label, payload.off_badge, payload.reviews_label, payload.product_image, payload.cart_id,
            payload.cart_name, payload.cart_price, payload.cart_image, payload.sort_order, 1 if payload.is_active else 0
        ))
    return {"ok": True, "message": "Hero banner slide saved"}

@router.delete("/banners-two/{banner_id}")
async def admin_delete_banner_two(banner_id: int, admin: Dict[str, Any] = Depends(get_current_admin)):
    await execute("DELETE FROM hero_banners_two WHERE id = ?", (banner_id,))
    return {"ok": True, "message": "Banner slide deleted"}


# ── Testimonials ────────────────────────────────────────────────────────────

@router.get("/testimonials")
async def admin_get_testimonials(admin: Dict[str, Any] = Depends(get_current_admin)):
    testimonials = await fetch_all("SELECT * FROM testimonials ORDER BY sort_order ASC, id DESC")
    return {"ok": True, "testimonials": [dict(t) for t in testimonials]}

class SaveTestimonialPayload(BaseModel):
    id: Optional[int] = None
    name: str
    initials: Optional[str] = ""
    avatar: Optional[str] = ""
    product_name: Optional[str] = ""
    product_slug: Optional[str] = ""
    quote: str
    rating: Optional[int] = 5
    theme: Optional[str] = "ghee"
    sort_order: Optional[int] = 0
    is_active: Optional[bool] = True

@router.post("/testimonials")
async def admin_save_testimonial(payload: SaveTestimonialPayload, admin: Dict[str, Any] = Depends(get_current_admin)):
    initials = payload.initials or "".join([part[0].upper() for part in payload.name.split()[:2]])
    if payload.id:
        await execute("""
            UPDATE testimonials SET
                name = ?, initials = ?, avatar = ?, product_name = ?, product_slug = ?,
                quote = ?, rating = ?, theme = ?, sort_order = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (
            payload.name, initials, payload.avatar, payload.product_name, payload.product_slug,
            payload.quote, payload.rating, payload.theme, payload.sort_order, 1 if payload.is_active else 0, payload.id
        ))
    else:
        await execute("""
            INSERT INTO testimonials (name, initials, avatar, product_name, product_slug, quote, rating, theme, sort_order, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            payload.name, initials, payload.avatar, payload.product_name, payload.product_slug,
            payload.quote, payload.rating, payload.theme, payload.sort_order, 1 if payload.is_active else 0
        ))
    return {"ok": True, "message": "Testimonial saved"}

@router.delete("/testimonials/{testimonial_id}")
async def admin_delete_testimonial(testimonial_id: int, admin: Dict[str, Any] = Depends(get_current_admin)):
    await execute("DELETE FROM testimonials WHERE id = ?", (testimonial_id,))
    return {"ok": True, "message": "Testimonial deleted"}


# ── Blog Endpoints ──────────────────────────────────────────────────────────

@router.get("/blog")
async def admin_get_blog(admin: Dict[str, Any] = Depends(get_current_admin)):
    posts = await fetch_all("SELECT * FROM blog_posts ORDER BY id DESC")
    return {"ok": True, "posts": [dict(p) for p in posts]}

class SaveBlogPayload(BaseModel):
    id: Optional[int] = None
    title: str
    slug: Optional[str] = ""
    excerpt: Optional[str] = ""
    content: str
    status: Optional[str] = "published"
    category: Optional[str] = "Wellness"
    author: Optional[str] = "Gawdee editorial"
    featured_image: Optional[str] = ""
    is_featured: Optional[bool] = False

@router.post("/blog")
async def admin_save_blog(payload: SaveBlogPayload, admin: Dict[str, Any] = Depends(get_current_admin)):
    slug = payload.slug or payload.title.lower().replace(" ", "-")
    if payload.id:
        await execute("""
            UPDATE blog_posts SET
                title = ?, slug = ?, excerpt = ?, content = ?, status = ?,
                category = ?, author = ?, featured_image = ?, is_featured = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (
            payload.title, slug, payload.excerpt, payload.content, payload.status,
            payload.category, payload.author, payload.featured_image, 1 if payload.is_featured else 0, payload.id
        ))
    else:
        await execute("""
            INSERT INTO blog_posts (title, slug, excerpt, content, status, category, author, featured_image, is_featured, published_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (
            payload.title, slug, payload.excerpt, payload.content, payload.status,
            payload.category, payload.author, payload.featured_image, 1 if payload.is_featured else 0
        ))
    return {"ok": True, "message": "Blog post saved"}

@router.delete("/blog/{post_id}")
async def admin_delete_blog(post_id: int, admin: Dict[str, Any] = Depends(get_current_admin)):
    await execute("DELETE FROM blog_posts WHERE id = ?", (post_id,))
    return {"ok": True, "message": "Blog post deleted"}


# ── Settings, AI & Integrations ─────────────────────────────────────────────

@router.get("/loyalty/settings")
async def admin_get_loyalty_settings(admin: Dict[str, Any] = Depends(get_current_admin)):
    defaults = {
        "enabled": 1,
        "release_delay_days": 7,
        "min_redemption_coins": 100,
        "max_redemption_coins": 100000,
        "max_redemption_percent": 20,
        "min_cart_paise": 0,
        "expiry_months": 0,
        "expiry_reminder_days": 30,
        "max_earn_per_order": 100000,
        "referral_bonus_coins": 0,
        "first_order_bonus_coins": 0,
    }
    values = {}
    for key, default in defaults.items():
        raw = await get_setting(await get_db(), f"loyalty_{key}", str(default))
        try:
            if key == "enabled":
                values[key] = bool(int(raw))
            else:
                values[key] = int(raw)
        except Exception:
            values[key] = default
    return {"ok": True, "settings": values}


@router.put("/loyalty/settings")
async def admin_save_loyalty_settings(payload: Dict[str, Any], admin: Dict[str, Any] = Depends(get_current_admin)):
    db = await get_db()
    try:
        for key, default in {
            "enabled": 1,
            "release_delay_days": 7,
            "min_redemption_coins": 100,
            "max_redemption_coins": 100000,
            "max_redemption_percent": 20,
            "min_cart_paise": 0,
            "expiry_months": 0,
            "expiry_reminder_days": 30,
            "max_earn_per_order": 100000,
            "referral_bonus_coins": 0,
            "first_order_bonus_coins": 0,
        }.items():
            if key in payload:
                value = payload[key]
                stored = "1" if key == "enabled" and bool(value) else str(int(value if value is not None else default))
                await set_setting(db, f"loyalty_{key}", stored)
        await db.commit()
        return await admin_get_loyalty_settings(admin)
    finally:
        await db.close()


@router.get("/loyalty/wallets")
async def admin_get_loyalty_wallets(search: Optional[str] = None, admin: Dict[str, Any] = Depends(get_current_admin)):
    db = await get_db()
    try:
        query = """
            SELECT w.customer_id, u.name AS customer_name, u.email AS customer_email,
                   w.available_coins, w.pending_coins, w.reserved_coins,
                   w.lifetime_earned, w.lifetime_redeemed, w.lifetime_expired, w.lifetime_reversed
            FROM loyalty_wallets w
            LEFT JOIN users u ON u.id = w.customer_id
        """
        params: list[Any] = []
        if search and search.strip():
            term = f"%{search.strip().lower()}%"
            query += " WHERE LOWER(COALESCE(u.name, '')) LIKE ? OR LOWER(COALESCE(u.email, '')) LIKE ? OR CAST(w.customer_id AS TEXT) LIKE ?"
            params.extend([term, term, f"%{search.strip()}%"])
        query += " ORDER BY w.available_coins DESC, w.customer_id ASC LIMIT 200"
        async with db.execute(query, tuple(params)) as cur:
            rows = await cur.fetchall()
        return {"ok": True, "wallets": [dict(row) for row in rows]}
    finally:
        await db.close()


@router.get("/loyalty/wallets/{customer_id}")
async def admin_get_loyalty_wallet(customer_id: int, admin: Dict[str, Any] = Depends(get_current_admin)):
    db = await get_db()
    try:
        async with db.execute(
            """
            SELECT w.customer_id, u.name AS customer_name, u.email AS customer_email,
                   w.available_coins, w.pending_coins, w.reserved_coins,
                   w.lifetime_earned, w.lifetime_redeemed, w.lifetime_expired, w.lifetime_reversed
            FROM loyalty_wallets w
            LEFT JOIN users u ON u.id = w.customer_id
            WHERE w.customer_id = ?
            """,
            (customer_id,),
        ) as cur:
            wallet = await cur.fetchone()
        if not wallet:
            raise HTTPException(status_code=404, detail="Customer wallet not found.")
        async with db.execute(
            """
            SELECT *
            FROM loyalty_transactions
            WHERE customer_id = ?
            ORDER BY id DESC
            LIMIT 200
            """,
            (customer_id,),
        ) as cur:
            transactions = [dict(row) for row in await cur.fetchall()]
        return {"ok": True, "wallet": dict(wallet), "transactions": transactions}
    finally:
        await db.close()


@router.post("/loyalty/adjustment")
async def admin_adjust_loyalty_wallet(payload: Dict[str, Any], admin: Dict[str, Any] = Depends(get_current_admin)):
    customer_id = int(payload.get("customer_id") or 0)
    coins = int(payload.get("coins") or 0)
    reason = str(payload.get("reason") or "").strip()
    reference_id = str(payload.get("reference_id") or "").strip()
    if not customer_id or abs(coins) <= 0 or len(reason) < 3 or not reference_id:
        raise HTTPException(status_code=422, detail="Provide a valid customer, a positive whole coin count, a reason, and a reference ID.")
    db = await get_db()
    try:
        async with db.execute("SELECT id FROM users WHERE id = ? AND role = 'customer'", (customer_id,)) as cur:
            customer = await cur.fetchone()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found.")
        from ..loyalty import append_transaction
        if coins > 0:
            await append_transaction(
                db,
                customer_id,
                "ADMIN_CREDIT",
                coins,
                coins,
                0,
                0,
                reference_id,
                "AVAILABLE",
                source="admin",
                description=reason,
                allow_negative=True,
            )
        else:
            await append_transaction(
                db,
                customer_id,
                "ADMIN_DEBIT",
                abs(coins),
                -abs(coins),
                0,
                0,
                reference_id,
                "AVAILABLE",
                source="admin",
                description=reason,
                allow_negative=True,
            )
        await db.commit()
        return {"ok": True, "message": "Adjustment recorded."}
    finally:
        await db.close()


@router.get("/loyalty/reports")
async def admin_get_loyalty_reports(admin: Dict[str, Any] = Depends(get_current_admin)):
    db = await get_db()
    try:
        async with db.execute(
            """
            SELECT
                COALESCE(SUM(available_coins),0) AS available_coins,
                COALESCE(SUM(pending_coins),0) AS pending_coins,
                COALESCE(SUM(lifetime_earned),0) AS total_coins_issued,
                COALESCE(SUM(lifetime_redeemed),0) AS redeemed_coins,
                COALESCE(SUM(lifetime_expired),0) AS expired_coins,
                COALESCE(SUM(lifetime_reversed),0) AS reversed_coins,
                COUNT(CASE WHEN (available_coins + pending_coins + reserved_coins) > 0 OR lifetime_earned > 0 THEN 1 END) AS customers_using_loyalty,
                COUNT(DISTINCT CASE WHEN order_id IS NOT NULL THEN order_id END) AS orders_using_loyalty,
                COALESCE(SUM(CAST(order_value AS INTEGER)),0) AS loyalty_discount_paise
            FROM loyalty_wallets w
            LEFT JOIN (
                SELECT order_id, SUM(loyalty_discount_paise) as order_value
                FROM orders
                WHERE loyalty_discount_paise > 0
                GROUP BY order_id
            ) o ON 1 = 1
            """
        ) as cur:
            row = await cur.fetchone()
        async with db.execute(
            "SELECT COALESCE(SUM(coins), 0) AS referral_rewards FROM loyalty_transactions WHERE transaction_type = 'REFERRAL_REWARD'"
        ) as cur:
            referral = await cur.fetchone()
        async with db.execute(
            "SELECT COALESCE(SUM(coins), 0) AS promotional_rewards FROM loyalty_transactions WHERE transaction_type = 'PROMOTIONAL_REWARD'"
        ) as cur:
            promo = await cur.fetchone()
        report = {
            "total_coins_issued": int((row or {}).get("total_coins_issued") or 0),
            "available_coins": int((row or {}).get("available_coins") or 0),
            "pending_coins": int((row or {}).get("pending_coins") or 0),
            "redeemed_coins": int((row or {}).get("redeemed_coins") or 0),
            "expired_coins": int((row or {}).get("expired_coins") or 0),
            "reversed_coins": int((row or {}).get("reversed_coins") or 0),
            "customers_using_loyalty": int((row or {}).get("customers_using_loyalty") or 0),
            "orders_using_loyalty": int((row or {}).get("orders_using_loyalty") or 0),
            "loyalty_discount_paise": int((row or {}).get("loyalty_discount_paise") or 0),
            "referral_rewards": int((referral or {}).get("referral_rewards") or 0),
            "promotional_rewards": int((promo or {}).get("promotional_rewards") or 0),
        }
        return {"ok": True, "reports": report}
    finally:
        await db.close()


@router.get("/loyalty/restrictions")
async def admin_get_loyalty_restrictions(admin: Dict[str, Any] = Depends(get_current_admin)):
    db = await get_db()
    try:
        async with db.execute("SELECT * FROM loyalty_product_rules ORDER BY product_id") as cur:
            products = [dict(row) for row in await cur.fetchall()]
        async with db.execute("SELECT * FROM loyalty_category_rules ORDER BY category_key") as cur:
            categories = [dict(row) for row in await cur.fetchall()]
        return {"ok": True, "products": products, "categories": categories}
    finally:
        await db.close()


@router.put("/loyalty/restrictions")
async def admin_save_loyalty_restrictions(payload: Dict[str, Any], admin: Dict[str, Any] = Depends(get_current_admin)):
    db = await get_db()
    try:
        products = payload.get("products", []) or []
        categories = payload.get("categories", []) or []
        for row in products:
            await db.execute(
                """
                INSERT INTO loyalty_product_rules (product_id, earn_excluded, redeem_excluded, multiplier, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(product_id) DO UPDATE SET
                    earn_excluded = excluded.earn_excluded,
                    redeem_excluded = excluded.redeem_excluded,
                    multiplier = excluded.multiplier,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (str(row.get("product_id")), 1 if row.get("earn_excluded") else 0, 1 if row.get("redeem_excluded") else 0, int(row.get("multiplier") or 1)),
            )
        for row in categories:
            await db.execute(
                """
                INSERT INTO loyalty_category_rules (category_key, earn_excluded, redeem_excluded, multiplier, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(category_key) DO UPDATE SET
                    earn_excluded = excluded.earn_excluded,
                    redeem_excluded = excluded.redeem_excluded,
                    multiplier = excluded.multiplier,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (str(row.get("category_key")), 1 if row.get("earn_excluded") else 0, 1 if row.get("redeem_excluded") else 0, int(row.get("multiplier") or 1)),
            )
        await db.commit()
        return await admin_get_loyalty_restrictions(admin)
    finally:
        await db.close()


@router.get("/settings")
async def admin_get_settings(admin: Dict[str, Any] = Depends(get_current_admin)):
    settings_rows = await fetch_all("SELECT setting_key, setting_value FROM settings")
    settings_dict = {row["setting_key"]: row["setting_value"] for row in settings_rows}
    return {"ok": True, "settings": settings_dict}

@router.post("/settings")
async def admin_save_settings(payload: Dict[str, Any], admin: Dict[str, Any] = Depends(get_current_admin)):
    for key, value in payload.items():
        val_str = str(value) if value is not None else ""
        await execute("""
            INSERT INTO settings (setting_key, setting_value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP
        """, (key, val_str))
    return {"ok": True, "message": "Settings saved"}


# ── Media Upload Endpoint ───────────────────────────────────────────────────

@router.post("/upload")
async def admin_upload_media(
    file: UploadFile = File(...),
    folder: str = Form("products"),
    admin: Dict[str, Any] = Depends(get_current_admin),
):
    folder_clean = "".join(c for c in folder.lower() if c.isalnum() or c in ("-", "_")) or "media"
    upload_dir = _public_upload_base() / folder_clean
    upload_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename).suffix.lower() or ".jpg"
    random_name = f"{folder_clean}-{secrets.token_hex(9)}{ext}"
    dest_path = upload_dir / random_name

    with open(dest_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    relative_url = f"/assets/uploads/{folder_clean}/{random_name}"
    return {"ok": True, "path": relative_url, "url": relative_url, "file_path": relative_url}
