"""
Gawdee FastAPI Backend
Third-party integrations — mirrors includes/integrations.php
Covers: Razorpay, Delhivery, WhatsApp Cloud API, AI (Groq/OpenAI), OTP
"""

import hashlib
import hmac
import json
import re
import secrets
import html
from datetime import datetime
from typing import Optional

import aiosqlite
import httpx
import bcrypt


def _hash_secret(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_secret(plain: str, hashed: str) -> bool:
    try:
        h = hashed or ""
        if h.startswith("$2y$"):
            h = "$2b$" + h[4:]
        return bcrypt.checkpw(plain.encode("utf-8"), h.encode("utf-8"))
    except Exception:
        return False

from .database import (
    get_setting,
    get_order_by_id,
    get_order_items,
    get_products,
    log_integration,
    record_order_event,
    record_inventory_event,
    record_webhook_event,
    complete_webhook_event,
    make_slug,
)
from .core.config import settings


# ── HTTP helper ───────────────────────────────────────────────────────────────

async def http_request(
    method: str,
    url: str,
    headers: dict = {},
    body=None,
    timeout: Optional[int] = None,
    basic_auth: Optional[tuple[str, str]] = None,
    body_mode: str = "json",
) -> dict:
    """Mirrors gawdee_http_request."""
    auth = basic_auth  # httpx accepts (user, pass) tuple natively
    timeout = settings.HTTP_TIMEOUT_SECONDS if timeout is None else timeout

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
        req_headers = {"Accept": "application/json", **headers}
        kwargs: dict = {"headers": req_headers}
        if basic_auth:
            kwargs["auth"] = basic_auth
        if body is not None:
            if isinstance(body, str):
                kwargs["content"] = body.encode()
            elif body_mode == "form":
                kwargs["data"] = body
            else:
                kwargs["json"] = body

        response = await client.request(method.upper(), url, **kwargs)

    try:
        data = response.json()
    except Exception:
        data = {"raw": response.text[:3000]}

    if not (200 <= response.status_code < 300):
        message = (
            data.get("error", {}).get("description")
            or data.get("error", {}).get("message")
            or data.get("message")
            or f"Remote service returned HTTP {response.status_code}"
        )
        raise RuntimeError(str(message) if isinstance(message, str) else "Remote integration request failed.")

    return {"status": response.status_code, "data": data}


# ── Razorpay ─────────────────────────────────────────────────────────────────

async def razorpay_configured(db: aiosqlite.Connection) -> bool:
    return (
        await get_setting(db, "razorpay_key_id") != ""
        and await get_setting(db, "razorpay_key_secret") != ""
    )


async def razorpay_create_order(db: aiosqlite.Connection, amount_rupees: int, receipt: str, notes: dict = {}) -> dict:
    """Mirrors gawdee_razorpay_create_order."""
    if not await razorpay_configured(db):
        raise RuntimeError("Razorpay is not configured yet. Add the Key ID and Key Secret in Admin > Integrations.")
    response = await http_request(
        "POST",
        f"{settings.RAZORPAY_API_BASE_URL}/v1/orders",
        {"Content-Type": "application/json"},
        {"amount": amount_rupees * 100, "currency": settings.CURRENCY, "receipt": receipt, "notes": notes},
        settings.HTTP_TIMEOUT_SECONDS,
        (await get_setting(db, "razorpay_key_id"), await get_setting(db, "razorpay_key_secret")),
    )
    data = response["data"]
    if not data.get("id"):
        raise RuntimeError("Razorpay did not return an order ID.")
    await log_integration(db, "razorpay", "create_order", "success", "Payment order created.", str(data["id"]))
    return data


def razorpay_verify_payment(server_order_id: str, payment_id: str, signature: str, secret: str) -> bool:
    """Mirrors gawdee_razorpay_verify_payment."""
    if not all([secret, server_order_id, payment_id, signature]):
        return False
    expected = hmac.new(secret.encode(), f"{server_order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def razorpay_verify_webhook(raw_body: str, signature: str, secret: str) -> bool:
    """Mirrors gawdee_razorpay_verify_webhook."""
    if not secret or not signature:
        return False
    return hmac.compare_digest(
        hmac.new(secret.encode(), raw_body.encode(), hashlib.sha256).hexdigest(),
        signature,
    )


async def razorpay_fetch_payment(db: aiosqlite.Connection, payment_id: str) -> dict:
    """Mirrors gawdee_razorpay_fetch_payment."""
    if not await razorpay_configured(db) or not re.match(r"^pay_[A-Za-z0-9]+$", payment_id):
        raise RuntimeError("The Razorpay payment reference is invalid.")
    response = await http_request(
        "GET",
        f"{settings.RAZORPAY_API_BASE_URL}/v1/payments/{payment_id}",
        {},
        None,
        settings.HTTP_TIMEOUT_SECONDS,
        (await get_setting(db, "razorpay_key_id"), await get_setting(db, "razorpay_key_secret")),
    )
    return response["data"]


def razorpay_payment_matches_order(payment: dict, order: dict) -> bool:
    """Mirrors gawdee_razorpay_payment_matches_order."""
    return (
        secrets.compare_digest(str(order["razorpay_order_id"]), str(payment.get("order_id", "")))
        and int(payment.get("amount", -1)) == int(order["total"]) * 100
        and str(payment.get("currency", "")).upper() == settings.CURRENCY
        and str(payment.get("status", "")) == "captured"
    )


# ── Phone normalization ───────────────────────────────────────────────────────

def normalize_phone(phone: str) -> str:
    """Mirrors gawdee_normalize_phone."""
    digits = re.sub(r"\D+", "", phone)
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) == 10:
        digits = "91" + digits
    return digits if re.match(r"^[1-9][0-9]{7,14}$", digits) else ""


# ── Delhivery ────────────────────────────────────────────────────────────────

async def delhivery_configured(db: aiosqlite.Connection) -> bool:
    required = [
        "delhivery_api_token", "delhivery_pickup_location", "delhivery_origin_phone",
        "delhivery_origin_address", "delhivery_origin_city", "delhivery_origin_state", "delhivery_origin_pincode",
    ]
    for key in required:
        if not (await get_setting(db, key)).strip():
            return False
    return await get_setting(db, "delhivery_enabled", "0") == "1"


async def delhivery_base_url(db: aiosqlite.Connection) -> str:
    env = await get_setting(db, "delhivery_environment", "staging")
    return settings.DELHIVERY_PROD_TRACK_URL if env == "production" else settings.DELHIVERY_STAGING_TRACK_URL


async def delhivery_headers(db: aiosqlite.Connection, content_type: str = "application/json") -> dict:
    token = await get_setting(db, "delhivery_api_token")
    return {"Authorization": f"Token {token}", "Content-Type": content_type}


async def delhivery_serviceability(db: aiosqlite.Connection, pincode: str, payment_mode: str = "Prepaid") -> dict:
    if not await delhivery_configured(db):
        raise RuntimeError("Delhivery is not configured. Add the API token and warehouse details in Admin > Integrations.")
    if not re.match(r"^[1-9][0-9]{5}$", pincode):
        raise RuntimeError("A valid six-digit Indian delivery pincode is required.")
    url = f"{await delhivery_base_url(db)}/c/api/pin-codes/json/?filter_codes={pincode}"
    response = await http_request("GET", url, await delhivery_headers(db))
    postal = (response["data"].get("delivery_codes") or [{}])[0].get("postal_code")
    if not isinstance(postal, dict):
        raise RuntimeError("Delhivery does not currently service this pincode.")
    remarks = str(postal.get("remarks", "")).lower()
    if "embargo" in remarks:
        raise RuntimeError("Delhivery has temporarily embargoed this pincode.")
    field = "cod" if payment_mode.lower() == "cod" else "pre_paid"
    available = str(postal.get(field, postal.get("cash" if field == "cod" else "prepaid", ""))).upper()
    if available and available not in ("Y", "YES", "TRUE", "1"):
        mode_label = "cash on delivery" if field == "cod" else "prepaid delivery"
        raise RuntimeError(f"Delhivery does not support {mode_label} for this pincode.")
    return postal


async def delhivery_create_shipment(db: aiosqlite.Connection, order: dict, items: list[dict]) -> dict:
    """Mirrors gawdee_delhivery_create_shipment."""
    if not await delhivery_configured(db):
        raise RuntimeError("Delhivery is offline or incomplete in Admin > Integrations.")
    payment_mode = "COD" if order.get("payment_method") == "cod" else "Prepaid"
    await delhivery_serviceability(db, str(order["pincode"]), payment_mode)

    quantity = sum(max(1, int(i.get("quantity", 1))) for i in items)
    quantity = max(1, quantity)
    weight = max(100, int(await get_setting(db, "delhivery_default_weight_grams", "500"))) * quantity
    address = ", ".join(filter(None, [str(order["address1"]), str(order.get("address2", ""))]))
    origin_address = (await get_setting(db, "delhivery_origin_address")).strip()

    payload = {
        "shipments": [{
            "name": str(order["customer_name"]),
            "add": address,
            "pin": str(order["pincode"]),
            "city": str(order["city"]),
            "state": str(order["state"]),
            "country": "India",
            "phone": normalize_phone(str(order["phone"])),
            "order": str(order["order_number"]),
            "payment_mode": payment_mode,
            "return_pin": await get_setting(db, "delhivery_origin_pincode"),
            "return_city": await get_setting(db, "delhivery_origin_city"),
            "return_phone": normalize_phone(await get_setting(db, "delhivery_origin_phone")),
            "return_add": origin_address,
            "return_state": await get_setting(db, "delhivery_origin_state"),
            "return_country": "India",
            "products_desc": ", ".join(str(i.get("product_name", i.get("product_id", "Product"))) for i in items)[:500],
            "cod_amount": int(order["total"]) if payment_mode == "COD" else 0,
            "order_date": str(order.get("created_at", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))),
            "total_amount": int(order["total"]),
            "seller_add": origin_address,
            "seller_name": await get_setting(db, "store_name", "Gawdee"),
            "seller_inv": str(order["order_number"]),
            "quantity": quantity,
            "waybill": "",
            "weight": weight,
            "shipment_length": max(1, int(await get_setting(db, "delhivery_default_length_cm", "20"))),
            "shipment_width": max(1, int(await get_setting(db, "delhivery_default_width_cm", "15"))),
            "shipment_height": max(1, int(await get_setting(db, "delhivery_default_height_cm", "10"))),
            "shipping_mode": "Surface",
            "address_type": "home",
        }],
        "pickup_location": {
            "name": await get_setting(db, "delhivery_pickup_location"),
            "add": origin_address,
            "city": await get_setting(db, "delhivery_origin_city"),
            "state": await get_setting(db, "delhivery_origin_state"),
            "pin_code": await get_setting(db, "delhivery_origin_pincode"),
            "country": "India",
            "phone": normalize_phone(await get_setting(db, "delhivery_origin_phone")),
        },
    }

    try:
        response = await http_request(
            "POST",
            f"{await delhivery_base_url(db)}/api/cmu/create.json",
            await delhivery_headers(db, "application/x-www-form-urlencoded"),
            {"format": "json", "data": json.dumps(payload, ensure_ascii=False)},
            settings.DELHIVERY_HTTP_TIMEOUT_SECONDS,
            body_mode="form",
        )
        data = response["data"]
        packages = data.get("packages", [{}])
        waybill = str(packages[0].get("waybill", data.get("waybill", ""))).strip()
        if not waybill:
            reason = str(packages[0].get("remarks", [data.get("rmk", "Delhivery accepted the request but did not return a waybill.")])[0])
            raise RuntimeError(reason)
        tracking_url = f"{settings.DELHIVERY_PACKAGE_TRACK_URL}/{waybill}"
        await log_integration(db, "delhivery", "create_shipment", "success", "Shipment manifested.", waybill)
        return {"waybill": waybill, "tracking_url": tracking_url, "response": data}
    except Exception as error:
        await log_integration(db, "delhivery", "create_shipment", "failed", str(error), str(order["order_number"]))
        raise


async def delhivery_track(db: aiosqlite.Connection, waybill: str) -> dict:
    """Mirrors gawdee_delhivery_track."""
    if not await delhivery_configured(db) or not re.match(r"^[A-Za-z0-9_-]{5,60}$", waybill):
        raise RuntimeError("A valid configured Delhivery waybill is required.")
    response = await http_request(
        "GET",
        f"{await delhivery_base_url(db)}/api/v1/packages/json/?waybill={waybill}",
        await delhivery_headers(db),
    )
    shipment = (response["data"].get("ShipmentData") or [{}])[0].get("Shipment")
    if not isinstance(shipment, dict):
        raise RuntimeError("Delhivery returned no tracking record for this waybill.")
    status = str(shipment.get("Status", {}).get("Status") or shipment.get("Status", {}).get("StatusType") or "Unknown")
    return {
        "status": status,
        "status_date": str(shipment.get("Status", {}).get("StatusDateTime", "")),
        "location": str(shipment.get("Status", {}).get("StatusLocation") or shipment.get("Destination", "")),
        "shipment": shipment,
    }


def delhivery_map_order_status(status: str) -> Optional[str]:
    """Mirrors gawdee_delhivery_map_order_status."""
    s = status.lower().strip()
    if not s:
        return None
    if "deliver" in s and "undeliver" not in s and "out for" not in s:
        return "delivered"
    if any(x in s for x in ("cancel", "rto", "return")):
        return "on_hold"
    for needle in ("transit", "dispatch", "picked", "out for delivery"):
        if needle in s:
            return "shipped"
    for needle in ("manifest", "pending", "ready", "bagged"):
        if needle in s:
            return "packed"
    return None


# ── WhatsApp Cloud API ────────────────────────────────────────────────────────

async def whatsapp_configured(db: aiosqlite.Connection) -> bool:
    return (
        await get_setting(db, "whatsapp_cloud_enabled", "0") == "1"
        and await get_setting(db, "whatsapp_phone_number_id") != ""
        and await get_setting(db, "whatsapp_access_token") != ""
    )


async def whatsapp_send_text(
    db: aiosqlite.Connection,
    phone: str,
    text: str,
) -> dict:
    """Send a plain WhatsApp text reply for product support or follow-up conversations."""
    if not await whatsapp_configured(db):
        raise RuntimeError("WhatsApp Cloud API is not configured or enabled.")
    phone = normalize_phone(phone)
    text = (text or "").strip()
    if not phone or len(text) < 1:
        raise RuntimeError("The WhatsApp recipient or message body is invalid.")

    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": phone,
        "type": "text",
        "text": {"body": text[:2000]},
    }

    version = await get_setting(db, "whatsapp_graph_version", "v23.0")
    if not re.match(r"^v[0-9]+\.[0-9]+$", version):
        version = "v23.0"
    phone_id = await get_setting(db, "whatsapp_phone_number_id")
    access_token = await get_setting(db, "whatsapp_access_token")

    try:
        response = await http_request(
            "POST",
            f"{settings.WHATSAPP_GRAPH_BASE_URL}/{version}/{phone_id}/messages",
            {"Content-Type": "application/json", "Authorization": f"Bearer {access_token}"},
            payload,
        )
        message_id = str(response["data"].get("messages", [{}])[0].get("id", ""))
        if not message_id:
            raise RuntimeError("WhatsApp accepted the text message but returned no message ID.")
        await log_integration(db, "whatsapp", "send_text", "success", phone, message_id)
        return {"message_id": message_id, "response": response["data"]}
    except Exception as error:
        await log_integration(db, "whatsapp", "send_text", "failed", str(error), phone)
        raise


async def whatsapp_send_template(
    db: aiosqlite.Connection,
    phone: str,
    template_name: str,
    parameters: list = [],
    language: Optional[str] = None,
    otp_button: bool = False,
) -> dict:
    """Mirrors gawdee_whatsapp_send_template."""
    if not await whatsapp_configured(db):
        raise RuntimeError("WhatsApp Cloud API is not configured or enabled.")
    phone = normalize_phone(phone)
    if not phone or not re.match(r"^[a-z0-9_]{1,512}$", template_name):
        raise RuntimeError("The WhatsApp recipient or approved template name is invalid.")

    lang = language or await get_setting(db, "whatsapp_language", "en_US")
    components = []
    if parameters:
        body_params = [{"type": "text", "text": str(v)[:1024]} for v in parameters]
        components.append({"type": "body", "parameters": body_params})
        if otp_button:
            components.append({"type": "button", "sub_type": "url", "index": "0", "parameters": [{"type": "text", "text": str(parameters[0])}]})

    template_obj: dict = {"name": template_name, "language": {"code": lang}}
    if components:
        template_obj["components"] = components

    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": phone,
        "type": "template",
        "template": template_obj,
    }

    version = await get_setting(db, "whatsapp_graph_version", "v23.0")
    if not re.match(r"^v[0-9]+\.[0-9]+$", version):
        version = "v23.0"
    phone_id = await get_setting(db, "whatsapp_phone_number_id")
    access_token = await get_setting(db, "whatsapp_access_token")

    try:
        response = await http_request(
            "POST",
            f"{settings.WHATSAPP_GRAPH_BASE_URL}/{version}/{phone_id}/messages",
            {"Content-Type": "application/json", "Authorization": f"Bearer {access_token}"},
            payload,
        )
        message_id = str(response["data"].get("messages", [{}])[0].get("id", ""))
        if not message_id:
            raise RuntimeError("WhatsApp accepted the request but returned no message ID.")
        await log_integration(db, "whatsapp", "send_template", "success", template_name, message_id)
        return {"message_id": message_id, "response": response["data"]}
    except Exception as error:
        await log_integration(db, "whatsapp", "send_template", "failed", str(error), template_name)
        raise


def whatsapp_verify_webhook(raw_body: str, signature: str, secret: str) -> bool:
    """Mirrors gawdee_whatsapp_verify_webhook."""
    if not secret or not signature.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(secret.encode(), raw_body.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


# ── Notification queue ────────────────────────────────────────────────────────

def order_tracking_reference(order: dict) -> str:
    return str(order.get("tracking_number") or order.get("delhivery_waybill") or order.get("dtdc_reference") or "")


def build_order_whatsapp_payload(order: dict, items: list[dict]) -> dict:
    """Create a rich WhatsApp order update payload with item image preview."""
    item = items[0] if items else {}
    product_name = str(item.get("product_name") or item.get("name") or "your order").strip() or "your order"
    variant_name = str(item.get("variant_name") or item.get("variant") or "").strip()
    image_url = str(item.get("image_url") or item.get("image") or "").strip()
    item_label = f"{product_name} {variant_name}".strip()
    order_number = str(order.get("order_number") or "order").strip()
    customer_name = str(order.get("customer_name") or "Customer").strip() or "Customer"
    total = int(order.get("total") or 0)
    method = str(order.get("payment_method") or "order").strip() or "order"

    text = (
        f"Hi {customer_name}! Your order {order_number} is confirmed. "
        f"Item: {item_label}. Total: ₹{total:,}. Payment: {method}. "
        "We’ll keep you updated on packing and delivery."
    )
    return {"text": text, "image_url": image_url, "item_name": item_label}


def build_product_query_answer(query: str, products: list[dict], free_shipping: str, store_email: str) -> str:
    """Generate a helpful WhatsApp-style product answer using the product catalog."""
    q = (query or "").lower()
    if not products:
        return (
            "I’m not able to find a matching product right now. Please share the product name or variant you want, "
            f"and we can help in WhatsApp. For support, email {store_email}."
        )

    candidate = None
    for product in products:
        haystack = " ".join([
            str(product.get("full_name") or ""),
            str(product.get("name") or ""),
            str(product.get("description") or ""),
            str(product.get("tag") or ""),
        ]).lower()
        if any(word in haystack for word in ["ghee", "honey", "mixme", "burra", "taral", "sugar"]):
            if any(word in q for word in ["ghee", "honey", "mixme", "burra", "taral"]):
                candidate = product
                break
        if any(word in q for word in ["ghee", "honey", "mixme", "burra", "taral", "variant", "price"]) and any(word in haystack for word in q.split() if len(word) > 2):
            candidate = product
            break
    candidate = candidate or products[0]

    product_name = str(candidate.get("full_name") or candidate.get("name") or "This product")
    price = int(candidate.get("price") or candidate.get("selling_price") or 0)
    description = str(candidate.get("description") or "").strip()
    image = str(candidate.get("image") or candidate.get("primary_image") or "").strip()
    variant_hint = "We offer this product in multiple sizes and pack options. Reply with the product name to get the latest variant list or check our catalogue."
    if "variant" in q or "size" in q or "pack" in q:
        variant_hint = (
            f"{product_name} is available in our standard Gawdee pack options. "
            f"You can also browse the full variant range on the product page."
        )

    return (
        f"{product_name} is a favorite pick at Gawdee. "
        f"Starting price: ₹{price:,}. {description or 'A wholesome, natural product designed for everyday wellness.'} "
        f"{variant_hint} Free shipping is available above ₹{free_shipping}. For support, contact {store_email}."
        f"{f' Image: {image}' if image else ''}"
    )


async def queue_marketing_notification(db: aiosqlite.Connection, user_id: int, channel: str, message: str, product_name: str = "") -> bool:
    """Queue a WhatsApp/SMS/email marketing or offer update for a user."""
    async with db.execute("SELECT id, email, phone, whatsapp_marketing_opt_in FROM users WHERE id=? AND role='customer' LIMIT 1", (user_id,)) as cur:
        user = await cur.fetchone()
    if not user:
        return False
    recipient = normalize_phone(str(user["phone"])) if channel in ("whatsapp", "sms") else str(user["email"] or "").strip()
    if not recipient:
        return False
    if channel == "whatsapp":
        consent = int(user["whatsapp_marketing_opt_in"] or 0)
        if consent != 1:
            return False
    dedupe = f"marketing:{channel}:{user_id}:{product_name or 'general'}:{message[:80]}"
    await db.execute(
        "INSERT OR IGNORE INTO notification_queue (user_id, channel, notification_type, recipient, template_name, language, variables_json, dedupe_key, status) VALUES (?, ?, 'marketing', ?, ?, ?, ?, ?, 'queued')",
        (user_id, channel, recipient, "marketing_update", "en_US", json.dumps([message], ensure_ascii=False), dedupe),
    )
    await db.commit()
    return True


async def queue_visitor_followup(db: aiosqlite.Connection, phone: str, message: str) -> bool:
    """Create a follow-up message for a site visitor who did not purchase."""
    phone = normalize_phone(phone)
    if not phone:
        return False
    dedupe = f"visitor_followup:{phone}:{message[:80]}"
    await db.execute(
        "INSERT OR IGNORE INTO notification_queue (order_id, user_id, channel, notification_type, recipient, template_name, language, variables_json, dedupe_key, status) VALUES (NULL, NULL, 'whatsapp', 'followup', ?, ?, ?, ?, ?, 'queued')",
        (phone, "visitor_followup", "en_US", json.dumps([message], ensure_ascii=False), dedupe),
    )
    await db.commit()
    return True


async def auto_reply_product_question(db: aiosqlite.Connection, phone: str, message: str) -> Optional[str]:
    """Answer common product/variant questions automatically via WhatsApp."""
    query = (message or "").strip()
    if not query:
        return None

    products = await get_products(db)
    if not products:
        return None
    answer = build_product_query_answer(
        query,
        products,
        await get_setting(db, "free_shipping_threshold", "999"),
        await get_setting(db, "store_email", "info@gawdee.com"),
    )
    if not answer:
        return None

    try:
        await whatsapp_send_text(db, phone, answer)
    except Exception:
        await queue_visitor_followup(db, phone, answer)
    return answer


async def queue_order_notification(db: aiosqlite.Connection, order_id: int, notification_type: str) -> bool:
    """Mirrors gawdee_queue_order_notification."""
    if await get_setting(db, "whatsapp_cloud_enabled", "0") != "1" or await get_setting(db, "whatsapp_order_notifications", "1") != "1":
        return False
    order = await get_order_by_id(db, order_id)
    if not order or not normalize_phone(str(order["phone"])):
        return False

    tracking = order_tracking_reference(order)
    templates = {
        "order_confirmed": ("whatsapp_template_order_confirmed", [order["customer_name"], order["order_number"], f"₹{int(order['total']):,}"]),
        "payment_confirmed": ("whatsapp_template_payment_confirmed", [order["customer_name"], order["order_number"], f"₹{int(order['total']):,}"]),
        "order_packed": ("whatsapp_template_order_packed", [order["customer_name"], order["order_number"]]),
        "order_shipped": ("whatsapp_template_order_shipped", [order["customer_name"], order["order_number"], order.get("courier_name") or "Gawdee delivery", tracking or "Tracking will update shortly"]),
        "order_delivered": ("whatsapp_template_order_delivered", [order["customer_name"], order["order_number"]]),
        "order_cancelled": ("whatsapp_template_order_cancelled", [order["customer_name"], order["order_number"]]),
    }
    if notification_type not in templates:
        return False

    setting_key, variables = templates[notification_type]
    template_name = await get_setting(db, setting_key)
    if not template_name:
        return False

    dedupe = f"order:{order_id}:{notification_type}:{tracking or 'none'}"
    await db.execute(
        """INSERT OR IGNORE INTO notification_queue
           (order_id, user_id, channel, notification_type, recipient, template_name, language, variables_json, dedupe_key)
           VALUES (?, ?, 'whatsapp', ?, ?, ?, ?, ?, ?)""",
        (order_id, order.get("user_id"), notification_type,
         normalize_phone(str(order["phone"])), template_name,
         await get_setting(db, "whatsapp_language", "en_US"),
         json.dumps(variables, ensure_ascii=False), dedupe),
    )
    inserted = True  # OR IGNORE — if no error, it was inserted
    await db.commit()
    return inserted


async def process_notification_queue(db: aiosqlite.Connection, limit: int = 20) -> dict:
    """Mirrors gawdee_process_notification_queue."""
    result = {"sent": 0, "failed": 0, "skipped": 0}
    if not await whatsapp_configured(db):
        return result

    limit = min(100, max(1, limit))
    async with db.execute(
        f"SELECT * FROM notification_queue WHERE status IN ('queued','retry') AND attempts < 5 AND scheduled_at <= CURRENT_TIMESTAMP ORDER BY id LIMIT {limit}"
    ) as cur:
        rows = await cur.fetchall()

    for row in rows:
        row = dict(row)
        if row["notification_type"] == "marketing":
            consent = False
            if row["user_id"]:
                async with db.execute(
                    "SELECT whatsapp_marketing_opt_in FROM users WHERE id=? AND whatsapp_opt_out_at IS NULL",
                    (int(row["user_id"]),),
                ) as cur:
                    consent_row = await cur.fetchone()
                consent = bool(consent_row and int(consent_row["whatsapp_marketing_opt_in"]) == 1)
            if not consent or await get_setting(db, "whatsapp_marketing_enabled", "0") != "1":
                await db.execute(
                    "UPDATE notification_queue SET status='cancelled', error_message='No active marketing consent.', updated_at=CURRENT_TIMESTAMP WHERE id=?",
                    (int(row["id"]),),
                )
                result["skipped"] += 1
                continue

        try:
            variables = json.loads(row["variables_json"] or "[]")
            sent = await whatsapp_send_template(db, row["recipient"], row["template_name"], variables if isinstance(variables, list) else [], row["language"])
            await db.execute(
                "UPDATE notification_queue SET status='sent', attempts=attempts+1, provider_message_id=?, error_message='', sent_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (sent["message_id"], int(row["id"])),
            )
            result["sent"] += 1
        except Exception as error:
            await db.execute(
                "UPDATE notification_queue SET status=CASE WHEN attempts+1 >= 5 THEN 'failed' ELSE 'retry' END, attempts=attempts+1, error_message=?, scheduled_at=datetime('now', '+' || MIN(60, (attempts+1)*(attempts+1)*5) || ' minutes'), updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (str(error)[:1000], int(row["id"])),
            )
            result["failed"] += 1

    await db.commit()
    return result


# ── OTP authentication ────────────────────────────────────────────────────────

async def customer_by_identity(db: aiosqlite.Connection, identity: str) -> Optional[dict]:
    """Mirrors gawdee_customer_by_identity."""
    email = identity.lower().strip()
    phone = normalize_phone(identity)
    async with db.execute(
        "SELECT * FROM users WHERE role='customer' AND (LOWER(email)=? OR (? != '' AND phone LIKE ?)) LIMIT 1",
        (email, phone, f"%{phone[-10:]}%" if len(phone) >= 10 else ""),
    ) as cur:
        row = await cur.fetchone()
    return dict(row) if row else None


async def whatsapp_request_otp(db: aiosqlite.Connection, identity: str, ip_address: str = "") -> bool:
    """Mirrors gawdee_whatsapp_request_otp."""
    if not await whatsapp_configured(db) or await get_setting(db, "whatsapp_otp_enabled", "0") != "1":
        raise RuntimeError("WhatsApp OTP login is not enabled yet.")

    from .database import get_secret_key
    ip_hash = hmac.new(get_secret_key(), (ip_address or "unknown").encode(), hashlib.sha256).hexdigest()

    customer = await customer_by_identity(db, identity)
    if not customer or not normalize_phone(str(customer["phone"])):
        return False

    phone = normalize_phone(str(customer["phone"]))
    async with db.execute(
        f"SELECT COUNT(*) FROM customer_otps WHERE (phone=? OR requested_ip_hash=?) AND created_at >= datetime('now','-{settings.OTP_REQUEST_WINDOW_MINUTES} minutes')",
        (phone, ip_hash),
    ) as cur:
        count = (await cur.fetchone())[0]
    if count >= settings.OTP_REQUEST_LIMIT:
        raise RuntimeError(f"Too many OTP requests. Please wait {settings.OTP_REQUEST_WINDOW_MINUTES} minutes and try again.")

    await db.execute(
        "UPDATE customer_otps SET status='expired' WHERE user_id=? AND purpose='login' AND status='pending'",
        (int(customer["id"]),),
    )
    digits = settings.OTP_CODE_DIGITS
    code = str(secrets.randbelow(9 * (10 ** (digits - 1))) + 10 ** (digits - 1))
    await db.execute(
        f"INSERT INTO customer_otps (user_id, phone, purpose, code_hash, expires_at, requested_ip_hash) VALUES (?, ?, 'login', ?, datetime('now','+{settings.OTP_EXPIRY_MINUTES} minutes'), ?)",
        (int(customer["id"]), phone, _hash_secret(code), ip_hash),
    )
    async with db.execute("SELECT last_insert_rowid()") as cur:
        otp_id = (await cur.fetchone())[0]
    await db.commit()

    try:
        await whatsapp_send_template(db, phone, await get_setting(db, "whatsapp_template_otp", "gawdee_login_otp"),
                                     [code], await get_setting(db, "whatsapp_language", "en_US"), otp_button=True)
        return True
    except Exception as error:
        await db.execute("UPDATE customer_otps SET status='failed' WHERE id=?", (otp_id,))
        await db.commit()
        raise


async def whatsapp_verify_otp(db: aiosqlite.Connection, identity: str, code: str) -> Optional[dict]:
    """Mirrors gawdee_whatsapp_verify_otp."""
    if not re.match(r"^[0-9]{" + str(settings.OTP_CODE_DIGITS) + r"}$", code):
        return None
    customer = await customer_by_identity(db, identity)
    if not customer:
        return None

    async with db.execute(
        "SELECT * FROM customer_otps WHERE user_id=? AND purpose='login' AND status='pending' AND expires_at >= CURRENT_TIMESTAMP ORDER BY id DESC LIMIT 1",
        (int(customer["id"]),),
    ) as cur:
        otp = await cur.fetchone()

    if not otp or int(otp["attempts"]) >= settings.OTP_MAX_ATTEMPTS:
        return None
    if not _verify_secret(code, str(otp["code_hash"])):
        await db.execute(
            f"UPDATE customer_otps SET attempts=attempts+1, status=CASE WHEN attempts+1 >= {settings.OTP_MAX_ATTEMPTS} THEN 'expired' ELSE status END WHERE id=?",
            (int(otp["id"]),),
        )
        await db.commit()
        return None

    await db.execute(
        "UPDATE customer_otps SET status='consumed', consumed_at=CURRENT_TIMESTAMP WHERE id=?",
        (int(otp["id"]),),
    )
    await db.commit()
    return dict(customer)


# ── AI content generation ─────────────────────────────────────────────────────

async def ai_configured(db: aiosqlite.Connection, provider: Optional[str] = None) -> bool:
    provider = provider or await get_setting(db, "ai_provider", "groq")
    if provider == "openai":
        return await get_setting(db, "openai_api_key") != ""
    return await get_setting(db, "groq_api_key") != ""


async def ai_generate(db: aiosqlite.Connection, instructions: str, input_text: str, max_tokens: int = 1100, provider: Optional[str] = None) -> str:
    """Mirrors gawdee_ai_generate."""
    provider = provider or await get_setting(db, "ai_provider", "groq")
    if provider not in ("groq", "openai"):
        raise RuntimeError("Select Groq or OpenAI as the AI provider.")
    if not await ai_configured(db, provider):
        raise RuntimeError(f"{provider.capitalize()} is not configured. Add its API key in Admin > AI & Blog.")

    if provider == "openai":
        response = await http_request(
            "POST",
            settings.OPENAI_RESPONSES_URL,
            {"Content-Type": "application/json", "Authorization": f"Bearer {await get_setting(db, 'openai_api_key')}"},
            {
                "model": await get_setting(db, "openai_model", "gpt-5.6-luna"),
                "instructions": instructions,
                "input": input_text,
                "max_output_tokens": max_tokens,
                "store": False,
            },
            settings.AI_HTTP_TIMEOUT_SECONDS,
        )
        data = response["data"]
        text = str(data.get("output_text", ""))
        if not text:
            for item in data.get("output", []):
                for content in item.get("content", []):
                    if content.get("type") == "output_text":
                        text += str(content.get("text", ""))
    else:
        response = await http_request(
            "POST",
            settings.GROQ_CHAT_URL,
            {"Content-Type": "application/json", "Authorization": f"Bearer {await get_setting(db, 'groq_api_key')}"},
            {
                "model": await get_setting(db, "groq_model", "llama-3.3-70b-versatile"),
                "messages": [
                    {"role": "system", "content": instructions},
                    {"role": "user", "content": input_text},
                ],
                "temperature": 0.65,
                "max_completion_tokens": max_tokens,
            },
            settings.AI_HTTP_TIMEOUT_SECONDS,
        )
        text = str(response["data"].get("choices", [{}])[0].get("message", {}).get("content", ""))

    if not text.strip():
        raise RuntimeError("The AI provider returned an empty response.")
    await log_integration(db, provider, "generate_text", "success", "Text generation completed.")
    return text.strip()


def sanitize_article_html(raw_html: str) -> str:
    """Mirrors gawdee_sanitize_article_html — strip unsafe tags/attributes."""
    import re as _re
    allowed_tags = {"h2", "h3", "p", "ul", "ol", "li", "strong", "em", "blockquote"}
    # Remove all tags not in the allowed set
    def replace_tag(m):
        tag = m.group(1).lower().split()[0].lstrip("/")
        return m.group(0) if tag in allowed_tags else ""
    cleaned = _re.sub(r"<(/?\w+[^>]*)>", replace_tag, raw_html)
    # Strip event handlers / style / class / id attrs
    cleaned = _re.sub(r'\s+(?:on\w+|style|class|id)\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+)', "", cleaned, flags=_re.IGNORECASE)
    return cleaned.strip()


async def generate_blog(db: aiosqlite.Connection, topic: str, status: str = "draft") -> dict:
    """Mirrors gawdee_generate_blog."""
    from .database import get_products, make_slug
    provider = await get_setting(db, "ai_provider", "groq")
    products = await get_products(db)
    product_context = "\n".join(f"{p['full_name']}: {p['description']}" for p in products)

    instructions = (
        "You are Gawdee's responsible food and wellness editor. Write accurate, helpful Indian consumer content. "
        "Avoid medical claims, disease-treatment language, fabricated research, and guaranteed outcomes. "
        "Never claim organic certification unless the supplied product data explicitly says so. "
        "Return only valid JSON with keys: title, excerpt, meta_description, content_html. "
        "content_html must use only h2, h3, p, ul, ol, li, strong, em, and blockquote tags. "
        "The article should be original, readable, practical, and 700-1000 words."
    )
    input_text = f"Topic: {topic}\n\nApproved Gawdee product context:\n{product_context}"
    raw = await ai_generate(db, instructions, input_text, 2400, provider)
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip(), flags=re.IGNORECASE)
    article = json.loads(raw)
    if not isinstance(article, dict) or not article.get("title") or not article.get("content_html"):
        raise RuntimeError("The AI response was not a valid blog document. Try a more specific topic.")

    title = str(article["title"])[:180].strip()
    base_slug = make_slug(title)
    slug = base_slug
    counter = 2
    while counter < 100:
        async with db.execute("SELECT COUNT(*) FROM blog_posts WHERE slug = ?", (slug,)) as cur:
            count = (await cur.fetchone())[0]
        if count == 0:
            break
        slug = f"{base_slug}-{counter}"
        counter += 1

    published_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S") if status == "published" else None
    await db.execute(
        "INSERT INTO blog_posts (title, slug, excerpt, content, status, source, ai_provider, meta_description, published_at) VALUES (?, ?, ?, ?, ?, 'ai', ?, ?, ?)",
        (
            title, slug,
            str(article.get("excerpt", ""))[:360].strip(),
            sanitize_article_html(str(article["content_html"])),
            status, provider,
            str(article.get("meta_description", ""))[:180].strip(),
            published_at,
        ),
    )
    async with db.execute("SELECT last_insert_rowid()") as cur:
        post_id = (await cur.fetchone())[0]
    await set_setting(db, "ai_last_blog_at", datetime.now().isoformat())
    await db.commit()
    return {"id": int(post_id), "title": title, "slug": slug, "status": status}


async def set_setting(db, key, value, secret=False):
    """Re-export for use in this module."""
    from .database import set_setting as _set
    await _set(db, key, value, secret)
