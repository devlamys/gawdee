"""
Gawdee FastAPI Backend
Public storefront routers — catalog, catalog product, subscribe, product review, wishlist, checkout, verify-payment, AI chat
"""

import json
import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr

from ..database import (
    get_db,
    get_products,
    get_product_by_id,
    get_product_by_slug,
    get_product_reviews,
    get_setting,
    migrate,
    get_catalog_rows,
    get_item_with_variants,
    get_item_by_id,
    get_variant_by_ref,
    map_variant_row,
)
from ..commerce import checkout_pricing, create_local_order, expire_stale_payment_orders
from ..integrations import (
    order_payable_paise, razorpay_configured, razorpay_create_order_paise, razorpay_verify_payment,
    razorpay_fetch_payment, razorpay_payment_matches_order,
    whatsapp_configured, whatsapp_request_otp, whatsapp_verify_otp,
    ai_configured, ai_generate,
    queue_order_notification, process_notification_queue,
    log_integration, trigger_order_event, trigger_checkout_abandoned_event,
)
from ..session import get_session, set_session_value, get_session_value
from ..core.config import settings
import aiosqlite

router = APIRouter()


# ── Dependency: DB connection ─────────────────────────────────────────────────

async def db_dep():
    db = await get_db()
    try:
        await migrate(db)
        yield db
    finally:
        await db.close()


# ── GET /api/catalog ──────────────────────────────────────────────────────────

@router.get("/catalog")
async def catalog(db: aiosqlite.Connection = Depends(db_dep)):
    products = await get_products(db)
    return {
        "ok": True,
        "products": [
            {"id": p["id"], "name": p["full_name"], "price": int(p["price"]), "image": p["image"], "stock": int(p["stock"])}
            for p in products
        ],
    }


# ── GET /api/products ─────────────────────────────────────────────────────────

@router.get("/products")
async def list_products(db: aiosqlite.Connection = Depends(db_dep)):
    catalog = await get_catalog_rows(db)
    if catalog:
        return {"ok": True, "products": catalog}
    products = await get_products(db)
    return {"ok": True, "products": products}


# ── GET /api/products/{id_or_slug} ───────────────────────────────────────────

@router.get("/products/{identifier}")
async def get_product(identifier: str, db: aiosqlite.Connection = Depends(db_dep)):
    product = await get_product_by_id(db, identifier) or await get_product_by_slug(db, identifier)
    item = None
    variants = []
    if product:
        var = await get_variant_by_ref(db, product["id"])
        if var:
            item = await get_item_with_variants(db, var["item_id"])
    else:
        item = await get_item_with_variants(db, identifier)
        if item and item.get("variants"):
            product = map_variant_row(item, item["variants"][0])

    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")

    if item and item.get("variants"):
        variants = [map_variant_row(item, v) for v in item["variants"]]

    if isinstance(product, dict):
        product["variants"] = variants
        if item:
            product["item_id"] = item.get("id")
            product["item_slug"] = item.get("slug")

    reviews = await get_product_reviews(db, int(item["id"])) if item else []
    return {"ok": True, "product": product, "variants": variants, "item": item, "reviews": reviews}


# ── POST /api/subscribe ───────────────────────────────────────────────────────

class SubscribeRequest(BaseModel):
    email: EmailStr

@router.post("/subscribe")
async def subscribe(payload: SubscribeRequest, db: aiosqlite.Connection = Depends(db_dep)):
    email = str(payload.email).lower().strip()
    try:
        await db.execute("INSERT OR IGNORE INTO subscribers (email) VALUES (?)", (email,))
        await db.commit()
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {"ok": True, "message": "Thank you! Your wellness updates are on the way."}


# ── POST /api/product-review ──────────────────────────────────────────────────

class ReviewRequest(BaseModel):
    product_id: int
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    review: str
    rating: int


async def _review_customer(request: Request, db: aiosqlite.Connection) -> dict:
    session = await get_session(request)
    customer_id = session.get("customer_user_id")
    if not customer_id:
        raise HTTPException(status_code=401, detail="Sign in to review a purchased product.")
    async with db.execute(
        "SELECT id, name, email FROM users WHERE id=? AND role='customer'",
        (int(customer_id),),
    ) as cur:
        customer = await cur.fetchone()
    if not customer:
        raise HTTPException(status_code=401, detail="Your session is no longer valid. Please sign in again.")
    return dict(customer)


async def _has_purchased_product(db: aiosqlite.Connection, customer_id: int, product_id: int) -> bool:
    async with db.execute(
        """
        SELECT 1
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN variant v ON CAST(v.id AS TEXT) = oi.product_id
                          OR (v.legacy_product_id != '' AND v.legacy_product_id = oi.product_id)
        WHERE o.user_id = ? AND v.item_id = ?
          AND (o.payment_status = 'paid' OR o.status = 'delivered')
          AND o.status NOT IN ('cancelled', 'refunded')
        LIMIT 1
        """,
        (customer_id, product_id),
    ) as cur:
        return await cur.fetchone() is not None


@router.get("/products/{product_id}/review-eligibility")
async def review_eligibility(product_id: int, request: Request, db: aiosqlite.Connection = Depends(db_dep)):
    customer = await _review_customer(request, db)
    purchased = await _has_purchased_product(db, int(customer["id"]), product_id)
    async with db.execute(
        "SELECT 1 FROM product_reviews WHERE product_id=? AND lower(email)=lower(?) LIMIT 1",
        (product_id, customer["email"]),
    ) as cur:
        reviewed = await cur.fetchone() is not None
    return {
        "ok": True,
        "eligible": purchased and not reviewed,
        "purchased": purchased,
        "reviewed": reviewed,
        "customer": {"name": customer["name"], "email": customer["email"]},
    }

@router.post("/product-review")
async def submit_review(payload: ReviewRequest, request: Request, db: aiosqlite.Connection = Depends(db_dep)):
    customer = await _review_customer(request, db)
    product = await get_item_by_id(db, payload.product_id)
    if not product:
        raise HTTPException(status_code=422, detail="This product is no longer available.")
    if not await _has_purchased_product(db, int(customer["id"]), payload.product_id):
        raise HTTPException(status_code=403, detail="Only customers who purchased this product can review it.")
    async with db.execute(
        "SELECT 1 FROM product_reviews WHERE product_id=? AND lower(email)=lower(?) LIMIT 1",
        (payload.product_id, customer["email"]),
    ) as cur:
        if await cur.fetchone():
            raise HTTPException(status_code=409, detail="You have already reviewed this product.")
    if payload.rating < 1 or payload.rating > 5:
        raise HTTPException(status_code=422, detail="Choose a rating from 1 to 5 stars.")
    review_text = payload.review.strip()
    if len(review_text) < 15 or len(review_text) > 1200:
        raise HTTPException(status_code=422, detail="Write a review between 15 and 1,200 characters.")

    await db.execute(
        "INSERT INTO product_reviews (product_id, rating, review, name, email) VALUES (?, ?, ?, ?, ?)",
        (payload.product_id, payload.rating, review_text, customer["name"], customer["email"].lower()),
    )
    await db.commit()
    from datetime import datetime
    created_at = datetime.now().isoformat(timespec="seconds")
    return {
        "ok": True,
        "message": "Thank you — your review is now published.",
        "review": {"name": customer["name"], "rating": payload.rating, "review": review_text, "created_at": created_at},
    }


# ── Wishlist ──────────────────────────────────────────────────────────────────

class WishlistSetRequest(BaseModel):
    ids: list[str]
    saved: bool

def _validate_wishlist_ids(ids: list[str]) -> list[str]:
    if not 1 <= len(ids) <= 6:
        raise HTTPException(status_code=422, detail="Choose between one and six products.")
    for pid in ids:
        if not isinstance(pid, str) or not re.match(r"^[a-z0-9-]{1,120}$", pid):
            raise HTTPException(status_code=422, detail="Invalid product selection.")
    return sorted(list(set(ids)))

@router.get("/wishlist")
async def wishlist_get(request: Request, db: aiosqlite.Connection = Depends(db_dep)):
    session = await get_session(request)
    customer_id = session.get("customer_user_id")
    if customer_id:
        async with db.execute(
            "SELECT item_key, product_ids FROM saved_products WHERE user_id=? ORDER BY created_at DESC, item_key",
            (int(customer_id),),
        ) as cur:
            rows = await cur.fetchall()
        items = {r["item_key"]: json.loads(r["product_ids"]) for r in rows}
    else:
        items = session.get("saved_products", {})
    return {"ok": True, "items": items, "count": len(items)}

@router.post("/wishlist")
async def wishlist_set(payload: WishlistSetRequest, request: Request, db: aiosqlite.Connection = Depends(db_dep)):
    ids = _validate_wishlist_ids(payload.ids)
    key = ",".join(ids)
    session = await get_session(request)
    customer_id = session.get("customer_user_id")

    if payload.saved:
        for pid in ids:
            product = await get_product_by_id(db, pid)
            if not product or not product["is_active"]:
                raise HTTPException(status_code=422, detail="This product is no longer available to save.")

    if customer_id:
        if payload.saved:
            await db.execute(
                "INSERT INTO saved_products(user_id,item_key,product_ids) VALUES(?,?,?) ON CONFLICT(user_id,item_key) DO NOTHING",
                (int(customer_id), key, json.dumps(ids, ensure_ascii=False)),
            )
        else:
            await db.execute("DELETE FROM saved_products WHERE user_id=? AND item_key=?", (int(customer_id), key))
        await db.commit()
        async with db.execute(
            "SELECT item_key, product_ids FROM saved_products WHERE user_id=? ORDER BY created_at DESC, item_key",
            (int(customer_id),),
        ) as cur:
            rows = await cur.fetchall()
        items = {r["item_key"]: json.loads(r["product_ids"]) for r in rows}
    else:
        items = dict(session.get("saved_products", {}))
        if payload.saved:
            items[key] = ids
        else:
            items.pop(key, None)
        await set_session_value(request, "saved_products", items)

    return {"ok": True, "items": items, "count": len(items)}


# ── POST /api/create-order ────────────────────────────────────────────────────

class CustomerFields(BaseModel):
    name: str
    email: EmailStr
    phone: str
    address1: str
    address2: Optional[str] = ""
    city: str
    state: str
    pincode: str
    notes: Optional[str] = ""

class CartItem(BaseModel):
    id: str
    quantity: int = 1

class CreateOrderRequest(BaseModel):
    customer: CustomerFields
    items: list[CartItem]
    payment_method: str = "razorpay"
    checkout_token: str
    coupon_code: Optional[str] = ""
    loyalty_coins: int = 0
    whatsapp_followup_opt_in: bool = False

@router.post("/create-order")
async def create_order(payload: CreateOrderRequest, request: Request, db: aiosqlite.Connection = Depends(db_dep)):
    session = await get_session(request)
    try:
        await expire_stale_payment_orders(db)
        customer_id = session.get("customer_user_id")

        fields = {
            "name": payload.customer.name[:180].strip(),
            "email": str(payload.customer.email).lower(),
            "phone": payload.customer.phone[:18].strip(),
            "address1": payload.customer.address1[:180].strip(),
            "address2": (payload.customer.address2 or "")[:180].strip(),
            "city": payload.customer.city[:180].strip(),
            "state": payload.customer.state[:180].strip(),
            "pincode": payload.customer.pincode[:18].strip(),
            "notes": (payload.customer.notes or "")[:500].strip(),
        }

        if len(fields["name"]) < 2:
            raise ValueError("Enter a valid name and email address.")
        if not re.match(r"^[0-9+()\s-]{8,18}$", fields["phone"]):
            raise ValueError("Enter a valid phone number.")
        if not fields["address1"] or not fields["city"] or not fields["state"] or not re.match(r"^[1-9][0-9]{5}$", fields["pincode"]):
            raise ValueError("Enter a complete Indian delivery address and six-digit pincode.")

        payment_method = "cod" if payload.payment_method == "cod" else "razorpay"
        if payment_method == "cod" and await get_setting(db, "cod_enabled", "1") != "1":
            raise ValueError("Cash on delivery is not available.")
        if payment_method == "razorpay" and not await razorpay_configured(db):
            raise ValueError("Online payment is being configured. Choose cash on delivery or contact the store.")

        requested_items = [{"id": i.id, "quantity": i.quantity} for i in payload.items]
        order = await create_local_order(
            db, fields, requested_items, payment_method,
            int(customer_id) if customer_id else None,
            payload.checkout_token.strip(), (payload.coupon_code or "").strip(),
            int(payload.loyalty_coins or 0),
        )

        if order["payment_method"] != payment_method:
            raise ValueError("This checkout session is already linked to another payment method. Refresh checkout to begin a new order.")

        if payment_method == "razorpay" and order["payment_status"] != "paid":
            if order["payment_status"] in ("failed", "expired"):
                raise ValueError("The previous payment attempt ended. Refresh checkout to start a new secure payment.")
            if not order["razorpay_order_id"]:
                try:
                    rp_order = await razorpay_create_order_paise(db, order_payable_paise(order), str(order["order_number"]),
                                                           {"gawdee_order": order["order_number"], "customer_email": fields["email"]})
                    await db.execute(
                        "UPDATE orders SET razorpay_order_id=?, payment_status='pending', payment_error='', updated_at=CURRENT_TIMESTAMP WHERE id=? AND payment_status!='paid'",
                        (str(rp_order["id"]), int(order["id"])),
                    )
                    await db.commit()
                    from ..database import get_order_by_id
                    order = await get_order_by_id(db, int(order["id"])) or order
                except Exception as pay_err:
                    from ..commerce import mark_payment_failed
                    await mark_payment_failed(db, int(order["id"]), str(pay_err))
                    await log_integration(db, "razorpay", "initialize_checkout", "failed", str(pay_err), str(order["order_number"]))
                    raise ValueError(f"Your order was received as {order['order_number']}, but online payment could not start. It is visible to the store team; no payment was taken.")

        await set_session_value(request, "last_order_number", str(order["order_number"]))

        response: dict = {
            "ok": True,
            "order_number": order["order_number"],
            "payment_method": payment_method,
            "subtotal": int(order["subtotal"]),
            "discount": int(order["discount"]),
            "shipping": int(order["shipping"]),
            "total": int(order["total"]),
            "subtotal_paise": int(order["subtotal_paise"] or 0),
            "shipping_paise": int(order["shipping_paise"] or 0),
            "discount_paise": int(order["discount_paise"] or 0),
            "loyalty_discount_paise": int(order["loyalty_discount_paise"] or 0),
            "total_paise": order_payable_paise(order),
            "loyalty_coins_earned": int(order["loyalty_coins_earned"] or 0),
            "loyalty_coins_redeemed": int(order["loyalty_coins_redeemed"] or 0),
            "coupon_code": order["coupon_code"],
            "already_paid": order["payment_status"] == "paid",
            "success_url": f"order-success.php?order={order['order_number']}",
            "account_url": f"account-order.php?order={order['order_number']}" if customer_id else "",
        }
        if payment_method == "razorpay" and order["payment_status"] != "paid":
            response["razorpay"] = {
                "key": await get_setting(db, "razorpay_key_id"),
                "order_id": order["razorpay_order_id"],
                "amount": order_payable_paise(order),
                "currency": settings.CURRENCY,
                "name": await get_setting(db, "store_name", "Gawdee"),
                "description": f"Order {order['order_number']}",
                "prefill": {"name": fields["name"], "email": fields["email"], "contact": fields["phone"]},
            }

        await log_integration(db, "checkout", "order_received", "success", "Order saved in the fulfilment queue.", str(order["order_number"]))
        if payment_method == "cod" or order.get("payment_status") == "paid":
            try:
                async with db.execute("SELECT product_name, quantity, image FROM order_items WHERE order_id = ? ORDER BY id", (int(order["id"]),)) as cur:
                    rows = await cur.fetchall()
                item_payload = [{"product_name": r["product_name"], "quantity": int(r["quantity"]), "image_url": str(r["image"] or "").strip()} for r in rows]
                await trigger_order_event(db, dict(order), item_payload)
            except Exception:
                pass
        await process_notification_queue(db, settings.NOTIFICATION_BATCH_CHECKOUT)
        return response
    except (ValueError, RuntimeError) as exc:
        msg = str(exc)
        await log_integration(db, "checkout", "create_order", "failed", msg)
        reset = any(x in msg for x in ("Your order was received as", "previous payment attempt ended"))
        raise HTTPException(status_code=422, detail={"message": msg, "reset_checkout": reset})


# ── POST /api/verify-payment ──────────────────────────────────────────────────

class VerifyPaymentRequest(BaseModel):
    order_number: str
    razorpay_payment_id: str
    razorpay_signature: str

@router.post("/verify-payment")
async def verify_payment(payload: VerifyPaymentRequest, request: Request, db: aiosqlite.Connection = Depends(db_dep)):
    try:
        async with db.execute("SELECT * FROM orders WHERE order_number = ?", (payload.order_number.strip(),)) as cur:
            order = await cur.fetchone()
        if not order or order["payment_method"] != "razorpay":
            raise ValueError("Payment order was not found.")
        order = dict(order)

        secret = await get_setting(db, "razorpay_key_secret")
        if not razorpay_verify_payment(str(order["razorpay_order_id"]), payload.razorpay_payment_id, payload.razorpay_signature, secret):
            await log_integration(db, "razorpay", "verify_payment", "failed", "Checkout signature did not match.", payload.order_number)
            raise ValueError("Payment verification failed. The order has not been marked paid.")

        payment = await razorpay_fetch_payment(db, payload.razorpay_payment_id)
        if not razorpay_payment_matches_order(payment, order):
            await log_integration(db, "razorpay", "verify_payment", "failed", "Gateway payment details did not match.", payload.razorpay_payment_id)
            raise ValueError("Razorpay has not confirmed a captured payment for this exact order amount. The order remains unpaid.")

        from ..commerce import mark_order_paid
        await mark_order_paid(db, int(order["id"]), payload.razorpay_payment_id, payload.razorpay_signature)
        async with db.execute("SELECT product_name, quantity, image FROM order_items WHERE order_id = ? ORDER BY id", (int(order["id"]),)) as cur:
            item_rows = await cur.fetchall()
        item_payload = [{"product_name": r["product_name"], "quantity": int(r["quantity"]), "image_url": str(r["image"] or "").strip()} for r in item_rows]
        await trigger_order_event(db, {**order, "payment_status": "paid", "status": "processing", "customer_name": order.get("customer_name") or "Customer", "phone": order.get("phone") or ""}, item_payload)
        await process_notification_queue(db, settings.NOTIFICATION_BATCH_CHECKOUT)
        await set_session_value(request, "last_order_number", payload.order_number)
        await log_integration(db, "razorpay", "verify_payment", "success", "Payment signature verified.", payload.razorpay_payment_id)
        return {"ok": True, "success_url": f"order-success.php?order={payload.order_number}"}
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=422, detail={"message": str(exc)})


# ── POST /api/ai-chat ─────────────────────────────────────────────────────────

class AiChatRequest(BaseModel):
    message: str

def get_catalogue_fallback_answer(products: list, query: str, free_shipping: str, store_email: str) -> str:
    q = query.lower()
    if any(w in q for w in ("ghee", "gir", "bilona", "a2")):
        return (
            "Gawdee A2 Gir Cow Ghee is prepared using the traditional Vedic Bilona method from grass-fed Gir cows. "
            "It is hand-churned from cultured curd (not malai/cream), making it easily digestible, rich in vitamins A, D, E & K, "
            "and packed with authentic nutty aroma and golden granular texture. Available in 250ml, 500ml, and 1L glass jars."
        )
    if any(w in q for w in ("honey", "forest", "wild")):
        return (
            "Gawdee Raw Wild Forest Honey is 100% natural, unprocessed, and unpasteurised. "
            "Sourced ethically from wild forest hives, it retains natural enzymes, pollen, and antioxidants with zero added sugar or corn syrup."
        )
    if any(w in q for w in ("mixme", "mix me", "powder", "nutritive", "kids")):
        return (
            "MixMe is our 100% natural nutritive food powder suitable for children (2+ yrs) and adults. "
            "Formulated with whole grains, nuts, dates, and Ayurvedic herbs like Ashwagandha, Brahmi, and Shankhpushpi. "
            "Available in soothing Vanilla and Cardamom flavours with zero artificial preservatives or refined sugars."
        )
    if any(w in q for w in ("sugar", "burra", "bura", "khandsari", "sweet")):
        return (
            "Gawdee Burra (Khandsari Sugar) is traditionally handcrafted unrefined sugar. "
            "Unlike refined white sugar, it is processed without chemical bleaching, sulphur, or bone char, retaining natural minerals, "
            "subtle molasses flavor, and delicate crystals perfect for beverages and traditional sweets."
        )
    if any(w in q for w in ("drop", "taral", "nasya", "belly")):
        return (
            "Gawdee Taral Drop is an authentic classical Nasya formulation for nasal and navel (belly button) lubrication. "
            "Crafted with pure herbal oils and A2 ghee, it helps improve respiratory comfort, sleep quality, and daily mental clarity."
        )
    if any(w in q for w in ("shipping", "delivery", "track", "charge", "order", "cod")):
        return (
            f"We offer Free Shipping across India on all orders above ₹{free_shipping}. "
            "For orders below that, standard shipping is ₹99. We ship orders within 24-48 hours and delivery typically takes 3-5 business days. "
            "Cash on Delivery (COD) and secure online payments are supported."
        )
    if any(w in q for w in ("pantry", "family", "recommend", "best", "essential")):
        return (
            "For an everyday family wellness pantry, we recommend:\n"
            "1. A2 Gir Cow Bilona Ghee (for cooking, roti & digestion)\n"
            "2. Raw Wild Forest Honey (natural immunity & warm morning drinks)\n"
            "3. MixMe Nutritive Blend (daily energy & breakfast nourishment)\n"
            "4. Burra Khandsari Sugar (wholesome unrefined sweetness)"
        )
    words = [w for w in q.split() if len(w) > 2]
    matching = [p for p in products if any(w in p.get('full_name', '').lower() or w in p.get('description', '').lower() for w in words)]
    if matching:
        items = "\n".join(f"• {p['full_name']} (₹{p['price']}) — {p['description']}" for p in matching[:3])
        return f"Here are the most relevant Gawdee products for your question:\n\n{items}\n\nFeel free to ask for more details or recipe ideas!"
    return (
        "Namaste! At Gawdee, we craft pure, natural food products rooted in traditional Indian wellness — "
        "including Vedic A2 Gir Cow Bilona Ghee, Raw Forest Honey, MixMe Nutritive Blend, Burra Khandsari Sugar, and Taral Nasya Drops. "
        f"All orders above ₹{free_shipping} ship for free! What product would you like to know more about?"
    )

class CheckoutLeadRequest(BaseModel):
    phone: str
    product_name: Optional[str] = ""
    image_url: Optional[str] = ""
    checkout_url: Optional[str] = ""
    whatsapp_followup_opt_in: bool = False

@router.post("/checkout/lead")
async def checkout_lead(payload: CheckoutLeadRequest, db: aiosqlite.Connection = Depends(db_dep)):
    phone = (payload.phone or "").strip()
    if not re.match(r"^[0-9+()\s-]{8,18}$", phone):
        raise HTTPException(status_code=422, detail={"message": "Enter a valid phone number."})
    if not payload.whatsapp_followup_opt_in:
        return {"ok": True, "message": "No follow-up consent was given."}

    normalized_phone = re.sub(r"\D+", "", phone)
    if len(normalized_phone) == 11 and normalized_phone.startswith("0"):
        normalized_phone = normalized_phone[1:]
    if len(normalized_phone) == 10:
        normalized_phone = "91" + normalized_phone

    async with db.execute("SELECT 1 FROM orders WHERE phone LIKE ? AND payment_status='paid' LIMIT 1", (f"%{normalized_phone[-10:]}%",)) as cur:
        purchased = await cur.fetchone() is not None
    lead = {
        "phone": normalized_phone,
        "whatsapp_followup_opt_in": True,
        "whatsapp_marketing_opt_in": True,
        "whatsapp_opted_out": False,
        "purchased": purchased,
        "product_name": payload.product_name or "Item in cart",
        "image_url": payload.image_url or "",
        "checkout_url": payload.checkout_url or "",
        "abandoned_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    }
    if not purchased:
        await trigger_checkout_abandoned_event(db, lead)
    return {"ok": True, "purchased": purchased, "phone": normalized_phone}

@router.post("/ai-chat")
async def ai_chat(payload: AiChatRequest, request: Request, db: aiosqlite.Connection = Depends(db_dep)):
    if await get_setting(db, "ai_chat_enabled", "1") != "1":
        raise HTTPException(status_code=422, detail={"message": "The Gawdee AI assistant is currently offline."})

    message = payload.message.strip()[:700]
    if len(message) < 2:
        raise HTTPException(status_code=422, detail={"message": "Type a question for the Gawdee assistant."})

    # ── Session-based rate limit (mirrors PHP exactly)
    import time
    session = await get_session(request)
    now = time.time()
    attempts = [t for t in (session.get("ai_chat_attempts") or []) if t > now - settings.AI_CHAT_WINDOW_SECONDS]
    if len(attempts) >= settings.AI_CHAT_LIMIT:
        raise HTTPException(status_code=422, detail={"message": "Please wait a few minutes before asking another question."})
    attempts.append(now)
    await set_session_value(request, "ai_chat_attempts", attempts)

    products = await get_products(db)
    free_shipping = await get_setting(db, "free_shipping_threshold", "999")
    store_email = await get_setting(db, "store_email", "info@gawdee.com")

    if await ai_configured(db):
        try:
            catalogue = "\n".join(
                f"- {p['full_name']} — ₹{p['price']}, {p['description']}"
                for p in products
            )
            instructions = (
                "You are the Gawdee shopping assistant. Be warm, concise and practical. "
                "Answer only from the approved catalogue and store information below. "
                "Never diagnose, prescribe, or promise health outcomes. "
                "For medical, allergy, pregnancy or disease questions, recommend consulting a qualified professional and checking the product label. "
                f"If unsure, say so.\n\nApproved catalogue:\n{catalogue}\n\n"
                f"Store: Free shipping above ₹{free_shipping}. Support: {store_email}."
            )
            provider = await get_setting(db, "ai_provider", "groq")
            reply = await ai_generate(db, instructions, message, 500)
            return {"ok": True, "reply": reply, "provider": provider}
        except Exception:
            pass

    # Fallback to local intelligent catalogue response
    reply = get_catalogue_fallback_answer(products, message, free_shipping, store_email)
    return {"ok": True, "reply": reply, "provider": "gawdee-knowledgebase"}



# ── POST /api/auth/otp/request ────────────────────────────────────────────────

class OtpRequestBody(BaseModel):
    identity: str  # email or phone

@router.post("/auth/otp/request")
async def request_otp(payload: OtpRequestBody, request: Request, db: aiosqlite.Connection = Depends(db_dep)):
    try:
        client_ip = request.client.host if request.client else ""
        found = await whatsapp_request_otp(db, payload.identity.strip(), client_ip)
        return {"ok": True, "found": found, "message": "If an account was found, an OTP was sent via WhatsApp."}
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=422, detail={"message": str(exc)})


class OtpVerifyBody(BaseModel):
    identity: str
    code: str

@router.post("/auth/otp/verify")
async def verify_otp(payload: OtpVerifyBody, request: Request, db: aiosqlite.Connection = Depends(db_dep)):
    customer = await whatsapp_verify_otp(db, payload.identity.strip(), payload.code.strip())
    if not customer:
        raise HTTPException(status_code=422, detail={"message": "The OTP is incorrect or has expired."})
    await db.execute("UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?", (int(customer["id"]),))
    await db.commit()
    await set_session_value(request, "customer_user_id", int(customer["id"]))
    return {
        "ok": True,
        "customer": {
            "id": customer["id"], "name": customer["name"], "email": customer["email"],
            "phone": customer["phone"], "role": customer["role"],
        },
    }


@router.post("/auth/logout")
async def logout(request: Request):
    from ..session import clear_session
    await clear_session(request)
    return {"ok": True}
