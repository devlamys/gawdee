"""
Gawdee FastAPI Backend
Commerce logic — mirrors includes/commerce.php
"""

import secrets
import re
from datetime import datetime
from typing import Optional

import aiosqlite

from .database import (
    get_db,
    get_setting,
    get_order_by_id,
    get_order_items,
    get_product_by_id,
    record_order_event,
    record_inventory_event,
    log_integration,
    get_variant_by_ref,
    get_item_by_id,
    map_variant_row,
    resolve_variant_identity,
    get_variant_stock,
    deduct_variant_stock,
    restore_variant_stock,
    sync_variant_mirror,
    resolve_combo_product,
    combo_available_stock,
)
from .loyalty import create_pending_purchase_reward, price_loyalty_lines, redeem_reservation, reserve_coins
from .core.config import settings


ORDER_STATUS_LABELS = {
    "pending": "Payment pending",
    "processing": "Confirmed",
    "packed": "Packed",
    "shipped": "Shipped",
    "delivered": "Delivered",
    "on_hold": "Needs attention",
    "cancelled": "Cancelled",
    "refunded": "Refunded",
}

ORDER_STATUS_TRANSITIONS = {
    "pending": ["processing", "on_hold", "cancelled"],
    "processing": ["packed", "on_hold", "cancelled", "delivered", "refunded"],
    "packed": ["processing", "shipped", "cancelled"],
    "shipped": ["delivered", "on_hold"],
    "delivered": ["refunded"],
    "on_hold": ["processing", "cancelled", "refunded"],
    "cancelled": [],
    "refunded": [],
}


# ── Pricing ──────────────────────────────────────────────────────────────────

async def checkout_pricing(db: aiosqlite.Connection, requested_items: list[dict], coupon_code: str = "") -> dict:
    """Mirrors gawdee_checkout_pricing."""
    if not requested_items or len(requested_items) > settings.CHECKOUT_MAX_ITEMS:
        raise ValueError("Your cart is empty or contains too many line items.")

    items = []
    subtotal = 0
    for req in requested_items:
        prod_id = str(req.get("id", ""))
        product = await get_product_by_id(db, prod_id)
        if product:
            # Legacy product rows can mirror a canonical variant. Use its
            # stock for pricing and reservation so both views stay aligned.
            canonical = await get_variant_by_ref(db, prod_id, True)
            if canonical:
                if not canonical["is_active"] or not canonical["item_is_active"]:
                    raise ValueError("A product in the cart is no longer available.")
                product = {**product, "variant_id": canonical["id"],
                           "legacy_product_id": canonical.get("legacy_product_id") or "",
                           "item_id": canonical["item_id"]}
        if not product:
            var = await get_variant_by_ref(db, prod_id, False)
            if var:
                item = await get_item_by_id(db, var["item_id"])
                if item:
                    product = map_variant_row(item, var)
        if not product and prod_id.startswith("combo-"):
            # Curated bundle (`combos` table): charged at its own combo price,
            # stock gated by the scarcest backing product.
            product = await resolve_combo_product(db, prod_id)
        quantity = min(settings.CHECKOUT_MAX_QTY, max(1, int(req.get("quantity") or req.get("qty") or 1)))
        if not product:
            raise ValueError("A product in the cart is no longer available.")
        identity = resolve_variant_identity(product)
        available = None
        if identity.get("variant_id"):
            available = await get_variant_stock(db, identity["variant_id"])
        if available is None:
            available = int(product.get("stock", 0))
        if available < quantity:
            raise ValueError(f"{product['name']} does not have enough stock for that quantity.")
        items.append({"product": product, "quantity": quantity})
        subtotal += int(product["price"]) * quantity

    coupon_code = coupon_code.upper().strip()
    discount = 0
    applied_coupon = ""
    if coupon_code:
        active_code = (await get_setting(db, "offer_code", "FREEDOM10")).upper().strip()
        if not secrets.compare_digest(active_code, coupon_code):
            raise ValueError("That offer code is not valid.")
        percent = min(100, max(0, int(await get_setting(db, "offer_percent", "10"))))
        discount = subtotal * percent // 100
        applied_coupon = active_code

    free_threshold = int(await get_setting(db, "free_shipping_threshold", "999"))
    shipping_fee = max(0, int(await get_setting(db, "shipping_fee", "99")))
    shipping = 0 if subtotal >= free_threshold else shipping_fee

    return {
        "items": items,
        "subtotal": subtotal,
        "discount": discount,
        "shipping": shipping,
        "total": max(0, subtotal - discount + shipping),
        "coupon_code": applied_coupon,
    }


# ── Order creation ────────────────────────────────────────────────────────────

async def create_local_order(
    db: aiosqlite.Connection,
    fields: dict,
    requested_items: list[dict],
    payment_method: str,
    user_id: Optional[int],
    checkout_token: str,
    coupon_code: str = "",
    loyalty_coins: int = 0,
) -> dict:
    """Mirrors gawdee_create_local_order."""
    payment_method = "cod" if payment_method == "cod" else "razorpay"
    loyalty_coins = max(0, int(loyalty_coins or 0))
    if not re.match(r"^[A-Za-z0-9_-]{16,100}$", checkout_token):
        raise ValueError("Checkout session is invalid. Refresh the checkout page and try again.")

    async with db.execute("SELECT * FROM orders WHERE checkout_token = ?", (checkout_token,)) as cur:
        existing = await cur.fetchone()
    if existing:
        order = dict(existing)
        order["is_duplicate"] = True
        return order

    pricing = await checkout_pricing(db, requested_items, coupon_code)
    line_pricing = await price_loyalty_lines(db, pricing)
    order_number = "GD" + datetime.now().strftime("%y%m%d") + secrets.token_hex(3).upper()
    status = "processing" if payment_method == "cod" else "pending"
    payment_status = "cod_pending" if payment_method == "cod" else "initializing"
    inventory_status = "deducted" if payment_method == "cod" else "reserved"

    dtdc_ready = (
        await get_setting(db, "dtdc_enabled", "0") == "1"
        and await get_setting(db, "dtdc_booking_endpoint") != ""
        and (
            await get_setting(db, "dtdc_api_token") != ""
            or (await get_setting(db, "dtdc_username") != "" and await get_setting(db, "dtdc_password") != "")
        )
    )
    delhivery_ready = (
        await get_setting(db, "delhivery_enabled", "0") == "1"
        and await get_setting(db, "delhivery_api_token") != ""
        and await get_setting(db, "delhivery_pickup_location") != ""
    )
    fulfillment_mode = "delhivery" if delhivery_ready else ("dtdc" if dtdc_ready else "manual")

    try:
        # Stock check
        for line in pricing["items"]:
            prod = line["product"]
            req_qty = line["quantity"]
            identity = resolve_variant_identity(prod)
            avail = None
            if prod.get("combo_id"):
                avail = await combo_available_stock(db, int(prod["combo_id"]))
            elif identity.get("variant_id"):
                avail = await get_variant_stock(db, identity["variant_id"])
            if avail is None:
                async with db.execute("SELECT stock FROM products WHERE id = ?", (prod["id"],)) as cur:
                    stock_row = await cur.fetchone()
                avail = int(stock_row["stock"]) if stock_row else 0
            if avail < req_qty:
                raise ValueError(f"{prod['name']} sold out while checkout was being prepared.")

        # Insert order
        await db.execute(
            """INSERT INTO orders
            (user_id, order_number, status, payment_method, payment_status, shipment_status, currency,
             subtotal, shipping, discount, total, coupon_code, checkout_token,
             customer_name, email, phone, address1, address2, city, state, pincode, notes,
             fulfillment_mode, inventory_status, loyalty_eligible_paise, loyalty_discount_paise, loyalty_coins_redeemed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                user_id, order_number, status, payment_method, payment_status,
                "awaiting_fulfillment", settings.CURRENCY,
                pricing["subtotal"], pricing["shipping"], pricing["discount"], pricing["total"],
                pricing["coupon_code"], checkout_token,
                fields["name"], fields["email"], fields["phone"],
                fields["address1"], fields.get("address2", ""),
                fields["city"], fields["state"], fields["pincode"], fields.get("notes", ""),
                fulfillment_mode, inventory_status,
                int(line_pricing["eligible_paise"]),
                int(loyalty_coins),
                int(loyalty_coins),
            ),
        )
        async with db.execute("SELECT last_insert_rowid()") as cur:
            order_id = (await cur.fetchone())[0]

        # Insert items and deduct stock
        for line in pricing["items"]:
            product = line["product"]
            quantity = line["quantity"]
            await db.execute(
                "INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, image) VALUES (?, ?, ?, ?, ?, ?)",
                (order_id, product["id"], product["full_name"], quantity, product["price"], product.get("image", "")),
            )
            async with db.execute("SELECT last_insert_rowid()") as cur:
                item_id = int((await cur.fetchone())[0])
            # keep the row in sync with the loyalty pricing snapshot for earnings / redemption calculations.
            line_snapshot = next((entry for entry in line_pricing["lines"] if str(entry["product_id"]) == str(product["id"])), None)
            if line_snapshot and user_id is not None:
                await db.execute(
                    "INSERT INTO loyalty_order_lines (order_item_id, order_id, customer_id, quantity, gross_paise, coupon_discount_paise, eligible_paise, redeemable_paise, multiplier, earn_excluded, redeem_excluded) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        item_id,
                        order_id,
                        int(user_id),
                        int(quantity),
                        int(line_snapshot.get("gross_paise", 0)),
                        int(line_snapshot.get("coupon_discount_paise", 0)),
                        int(line_snapshot.get("eligible_paise", 0)),
                        int(line_snapshot.get("redeemable_paise", 0)),
                        int(line_snapshot.get("multiplier", 1)),
                        int(1 if line_snapshot.get("earn_excluded") else 0),
                        int(1 if line_snapshot.get("redeem_excluded") else 0),
                    ),
                )
            identity = resolve_variant_identity(product)
            if product.get("combo_id"):
                # Bundle line: reserve one unit of each backing product.
                for ref in product.get("bundle_refs", []):
                    bundle_var = await get_variant_by_ref(db, ref, True)
                    if bundle_var:
                        deducted = await deduct_variant_stock(db, bundle_var["id"], quantity)
                        if not deducted:
                            raise ValueError(f"{product['name']} sold out while checkout was being prepared.")
                        balance = await get_variant_stock(db, bundle_var["id"]) or 0
                        inv_ref = bundle_var.get("legacy_product_id") or str(bundle_var["id"])
                        await record_inventory_event(db, str(inv_ref), -quantity, balance, f"Bundle part for order {order_number}", order_id)
                    else:
                        deduct_cur = await db.execute(
                            """UPDATE products SET stock = stock - ?,
                               stock_status = CASE WHEN stock - ? <= 0 THEN 'out_of_stock' ELSE 'in_stock' END
                               WHERE id = ? AND stock >= ?""",
                            (quantity, quantity, ref, quantity),
                        )
                        if deduct_cur.rowcount != 1:
                            raise ValueError(f"{product['name']} sold out while checkout was being prepared.")
                        async with db.execute("SELECT stock FROM products WHERE id = ?", (ref,)) as cur:
                            stock_row = await cur.fetchone()
                        if not stock_row:
                            raise ValueError(f"{product['name']} sold out while checkout was being prepared.")
                        await record_inventory_event(db, ref, -quantity, int(stock_row["stock"]), f"Bundle part for order {order_number}", order_id)
            elif identity.get("variant_id"):
                deducted = await deduct_variant_stock(db, identity["variant_id"], quantity)
                if not deducted:
                    raise ValueError(f"{product['name']} sold out while checkout was being prepared.")
                balance = await get_variant_stock(db, identity["variant_id"]) or 0
                # inventory_events.product_id references products(id) — use the legacy product id for variant rows.
                inv_ref = identity.get("legacy_id") or product.get("legacy_product_id") or product["id"]
                await record_inventory_event(db, str(inv_ref), -quantity, balance, f"Reserved for order {order_number}", order_id)
            else:
                await db.execute(
                    """UPDATE products SET stock = stock - ?,
                       stock_status = CASE WHEN stock - ? <= 0 THEN 'out_of_stock' ELSE 'in_stock' END
                       WHERE id = ? AND stock >= ?""",
                    (quantity, quantity, product["id"], quantity),
                )
                async with db.execute("SELECT stock FROM products WHERE id = ?", (product["id"],)) as cur:
                    balance = int((await cur.fetchone())["stock"])
                await record_inventory_event(db, product["id"], -quantity, balance, f"Reserved for order {order_number}", order_id)

        # Update user address
        if user_id:
            await db.execute(
                "UPDATE users SET name=?, phone=?, address1=?, address2=?, city=?, state=?, pincode=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (fields["name"], fields["phone"], fields["address1"], fields.get("address2", ""),
                 fields["city"], fields["state"], fields["pincode"], user_id),
            )

        description = (
            "Cash on delivery order confirmed and sent to the fulfilment queue."
            if payment_method == "cod"
            else "Order saved securely. Online payment is being prepared."
        )
        if loyalty_coins > 0 and user_id:
            await reserve_coins(db, int(user_id), order_id, loyalty_coins, checkout_token, payment_method)
            await db.execute(
                "UPDATE orders SET loyalty_discount_paise=?, loyalty_coins_redeemed=? WHERE id=?",
                (loyalty_coins, loyalty_coins, order_id),
            )

        await record_order_event(db, order_id, status, "Order received", description)
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    order = await get_order_by_id(db, order_id)
    if not order:
        raise RuntimeError("The order was saved but could not be reloaded.")
    order["is_duplicate"] = False
    return order


# ── Order status management ───────────────────────────────────────────────────

def order_allowed_transitions(order: dict) -> list[str]:
    """Mirrors gawdee_order_allowed_transitions."""
    allowed = list(ORDER_STATUS_TRANSITIONS.get(order["status"], []))
    if order["payment_method"] == "razorpay" and order["payment_status"] != "paid":
        allowed = [s for s in allowed if s in ("on_hold", "cancelled")]
    return allowed


async def update_order_status(db: aiosqlite.Connection, order_id: int, new_status: str, note: str = "") -> None:
    """Mirrors gawdee_update_order_status."""
    if new_status not in ORDER_STATUS_LABELS:
        raise ValueError("Unknown order status.")

    order = await get_order_by_id(db, order_id)
    if not order:
        raise ValueError("Order not found.")
    if order["status"] == new_status:
        return
    if new_status not in order_allowed_transitions(order):
        raise ValueError(f"That workflow change is not allowed from {order['status'].replace('_', ' ')}.")

    if new_status == "cancelled":
        await release_order_inventory(db, order_id, "restocked")

    shipment_map = {
        "processing": "awaiting_fulfillment",
        "packed": "awaiting_shipment",
        "shipped": "in_transit",
        "delivered": "delivered",
        "cancelled": "cancelled",
        "refunded": "refunded",
    }
    shipment_status = shipment_map.get(new_status, order["shipment_status"])
    payment_status = order["payment_status"]
    extra_cols = ""
    if new_status == "delivered" and order["payment_method"] == "cod" and payment_status != "paid":
        payment_status = "paid"
        extra_cols += ", paid_at=CURRENT_TIMESTAMP"
    if new_status == "refunded":
        payment_status = "refunded"
    if new_status == "delivered":
        extra_cols += ", fulfilled_at=CURRENT_TIMESTAMP"
    elif new_status == "cancelled":
        extra_cols += ", cancelled_at=CURRENT_TIMESTAMP"

    await db.execute(
        f"UPDATE orders SET status=?, shipment_status=?, payment_status=?, admin_note=?, updated_at=CURRENT_TIMESTAMP{extra_cols} WHERE id=?",
        (new_status, shipment_status, payment_status, note[:500], order_id),
    )

    titles = {
        "processing": "Order confirmed", "packed": "Packed with care", "shipped": "Shipment dispatched",
        "delivered": "Order delivered", "on_hold": "Order needs attention",
        "cancelled": "Order cancelled", "refunded": "Order refunded",
    }
    if new_status == "delivered":
        from .loyalty import schedule_order_release
        await schedule_order_release(db, order_id)
    elif new_status == "refunded":
        from .loyalty import append_transaction
        order = await get_order_by_id(db, order_id)
        if order and order.get("user_id") and int(order.get("loyalty_coins_redeemed") or 0) > 0:
            await append_transaction(
                db,
                int(order["user_id"]),
                "REFUND_REVERSAL",
                int(order["loyalty_coins_redeemed"] or 0),
                int(order["loyalty_coins_redeemed"] or 0),
                0,
                0,
                f"REFUND_REVERSAL:ORDER:{order_id}",
                "AVAILABLE",
                order_id=order_id,
                description="Coins restored after order refund",
                allow_negative=True,
            )

    await record_order_event(
        db, order_id, new_status,
        titles.get(new_status, "Order updated"),
        note.strip() or "Status updated by the Gawdee fulfilment team.",
    )
    await db.commit()


async def release_order_inventory(db: aiosqlite.Connection, order_id: int, new_inventory_status: str = "released") -> bool:
    """Mirrors gawdee_release_order_inventory."""
    async with db.execute("SELECT inventory_status FROM orders WHERE id = ?", (order_id,)) as cur:
        row = await cur.fetchone()
    if not row or row["inventory_status"] not in ("reserved", "deducted"):
        return False

    items = await get_order_items(db, order_id)
    for item in items:
        pid = str(item["product_id"])
        qty = int(item["quantity"])
        if pid.startswith("combo-"):
            # Bundle line: release one unit of each backing product.
            # The combo itself may be inactive by now, so read its refs directly.
            async with db.execute("SELECT product_one_ref, product_two_ref FROM combos WHERE slug = ? LIMIT 1", (pid[len("combo-"):],)) as cur:
                combo_row = await cur.fetchone()
            if combo_row:
                for ref in (str(combo_row["product_one_ref"] or ""), str(combo_row["product_two_ref"] or "")):
                    if not ref:
                        continue
                    bundle_var = await get_variant_by_ref(db, ref, True)
                    if bundle_var:
                        await restore_variant_stock(db, bundle_var["id"], qty)
                        bal = await get_variant_stock(db, bundle_var["id"]) or 0
                        inv_ref = bundle_var.get("legacy_product_id") or str(bundle_var["id"])
                        await record_inventory_event(db, str(inv_ref), qty, bal, "Restocked from cancelled or failed order", order_id)
                    else:
                        await db.execute(
                            "UPDATE products SET stock = stock + ?, stock_status='in_stock' WHERE id = ?",
                            (qty, ref),
                        )
                        async with db.execute("SELECT stock FROM products WHERE id = ?", (ref,)) as cur:
                            stock_r = await cur.fetchone()
                            balance = int(stock_r["stock"]) if stock_r else 0
                        await record_inventory_event(
                            db, ref, qty, balance,
                            "Restocked from cancelled or failed order", order_id,
                        )
            continue
        variant = await get_variant_by_ref(db, pid, True)
        if variant:
            await restore_variant_stock(db, variant["id"], qty)
            bal = await get_variant_stock(db, variant["id"]) or 0
            # inventory_events.product_id references products(id) — use the legacy product id for variant rows.
            inv_ref = variant.get("legacy_product_id") or pid
            await record_inventory_event(db, str(inv_ref), qty, bal, "Restocked from cancelled or failed order", order_id)
        else:
            await db.execute(
                "UPDATE products SET stock = stock + ?, stock_status='in_stock' WHERE id = ?",
                (qty, pid),
            )
            async with db.execute("SELECT stock FROM products WHERE id = ?", (pid,)) as cur:
                stock_r = await cur.fetchone()
                balance = int(stock_r["stock"]) if stock_r else 0
            await record_inventory_event(
                db, pid, qty, balance,
                "Restocked from cancelled or failed order", order_id,
            )
    await db.execute(
        "UPDATE orders SET inventory_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (new_inventory_status, order_id),
    )
    return True


async def mark_payment_failed(db: aiosqlite.Connection, order_id: int, message: str) -> None:
    """Mirrors gawdee_mark_payment_failed."""
    order = await get_order_by_id(db, order_id)
    if not order or order["payment_status"] == "paid":
        return
    await release_order_inventory(db, order_id, "released")
    await db.execute(
        "UPDATE orders SET payment_status='failed', status='on_hold', payment_error=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (message[:500], order_id),
    )
    await record_order_event(
        db, order_id, "on_hold", "Payment not completed",
        "The order remains visible to the store team. Inventory was released and the customer may try again.",
    )
    await db.commit()


async def mark_order_paid(db: aiosqlite.Connection, order_id: int, payment_id: str = "", signature: str = "") -> None:
    """Mirrors gawdee_mark_order_paid."""
    async with db.execute("SELECT payment_status, inventory_status, user_id, loyalty_coins_redeemed FROM orders WHERE id = ?", (order_id,)) as cur:
        order = await cur.fetchone()
    if not order:
        raise ValueError("Order not found.")

    if order["payment_status"] != "paid":
        if order["inventory_status"] not in ("reserved", "deducted"):
            # A capture can arrive after the reservation expired. Restore the
            # reservation atomically, including the canonical variant stock.
            items = await get_order_items(db, order_id)
            await db.execute("SAVEPOINT paid_inventory")
            try:
                for item in items:
                    pid = str(item["product_id"])
                    qty = int(item["quantity"])
                    variant = await get_variant_by_ref(db, pid, True)
                    if variant:
                        async with db.execute(
                            "UPDATE variant SET stock=stock-? WHERE id=? AND stock>=?",
                            (qty, variant["id"], qty),
                        ) as cur:
                            if cur.rowcount != 1:
                                raise ValueError("Insufficient stock after payment capture")
                        async with db.execute("SELECT stock FROM variant WHERE id=?", (variant["id"],)) as cur:
                            balance = int((await cur.fetchone())["stock"])
                        mirror_id = str(variant.get("legacy_product_id") or variant["id"])
                        await db.execute(
                            "UPDATE products SET stock=?, stock_status=CASE WHEN ?<=0 THEN 'out_of_stock' ELSE 'in_stock' END WHERE id=?",
                            (balance, balance, mirror_id),
                        )
                        await record_inventory_event(db, mirror_id, -qty, balance, "Reserved after late payment capture", order_id)
                    else:
                        async with db.execute(
                            "UPDATE products SET stock=stock-?, stock_status=CASE WHEN stock-?<=0 THEN 'out_of_stock' ELSE 'in_stock' END WHERE id=? AND stock>=?",
                            (qty, qty, pid, qty),
                        ) as cur:
                            if cur.rowcount != 1:
                                raise ValueError("Insufficient stock after payment capture")
                        async with db.execute("SELECT stock FROM products WHERE id=?", (pid,)) as cur:
                            balance = int((await cur.fetchone())["stock"])
                        await record_inventory_event(db, pid, -qty, balance, "Reserved after late payment capture", order_id)
                await db.execute("RELEASE SAVEPOINT paid_inventory")
            except ValueError:
                await db.execute("ROLLBACK TO SAVEPOINT paid_inventory")
                await db.execute("RELEASE SAVEPOINT paid_inventory")
                await db.execute(
                    "UPDATE orders SET payment_status='paid', status='on_hold', payment_error='Payment received, but stock needs manual review.', paid_at=CURRENT_TIMESTAMP, cancelled_at=NULL, razorpay_payment_id=CASE WHEN ?='' THEN razorpay_payment_id ELSE ? END, razorpay_signature=CASE WHEN ?='' THEN razorpay_signature ELSE ? END, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                    (payment_id, payment_id, signature, signature, order_id),
                )
                await record_order_event(db, order_id, "on_hold", "Payment received — stock review needed",
                    "Payment is secure, but fulfilment needs an inventory check by the store team.")
                await db.commit()
                return
            except Exception:
                await db.execute("ROLLBACK TO SAVEPOINT paid_inventory")
                await db.execute("RELEASE SAVEPOINT paid_inventory")
                raise

        await db.execute(
            "UPDATE orders SET payment_status='paid', status='processing', shipment_status='awaiting_fulfillment', inventory_status='deducted', payment_error='', paid_at=CURRENT_TIMESTAMP, cancelled_at=NULL, razorpay_payment_id=CASE WHEN ?='' THEN razorpay_payment_id ELSE ? END, razorpay_signature=CASE WHEN ?='' THEN razorpay_signature ELSE ? END, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (payment_id, payment_id, signature, signature, order_id),
        )
        user_id = int(order["user_id"]) if order["user_id"] is not None else None
        if user_id is not None:
            await create_pending_purchase_reward(db, order_id)
        if user_id is not None and int(order["loyalty_coins_redeemed"] or 0) > 0:
            await redeem_reservation(db, order_id)
        await record_order_event(db, order_id, "processing", "Payment confirmed",
            "Secure online payment was verified and the order moved to processing.")
    elif payment_id or signature:
        await db.execute(
            "UPDATE orders SET razorpay_payment_id=CASE WHEN ?='' THEN razorpay_payment_id ELSE ? END, razorpay_signature=CASE WHEN ?='' THEN razorpay_signature ELSE ? END, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (payment_id, payment_id, signature, signature, order_id),
        )
    await db.commit()


async def expire_stale_payment_orders(db: aiosqlite.Connection, minutes: int = 0) -> int:
    """Mirrors gawdee_expire_stale_payment_orders."""
    minutes = minutes or settings.STALE_ORDER_MINUTES
    minutes = min(1440, max(15, minutes))
    async with db.execute(
        "SELECT id FROM orders WHERE payment_method='razorpay' AND payment_status IN ('initializing','pending') AND created_at <= datetime('now', ?)",
        (f"-{minutes} minutes",),
    ) as cur:
        rows = await cur.fetchall()

    expired = 0
    for row in rows:
        oid = int(row["id"])
        await release_order_inventory(db, oid, "released")
        await db.execute(
            "UPDATE orders SET payment_status='expired', status='cancelled', shipment_status='cancelled', payment_error='Payment window expired.', cancelled_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=? AND payment_status!='paid'",
            (oid,),
        )
        await record_order_event(db, oid, "cancelled", "Payment window expired",
            "No payment was captured. Reserved inventory was returned to the catalogue.")
        expired += 1
    if expired:
        await db.commit()
    return expired


async def set_manual_shipment(db: aiosqlite.Connection, order_id: int, courier_name: str, tracking_number: str = "", tracking_url: str = "") -> None:
    """Mirrors gawdee_set_manual_shipment."""
    order = await get_order_by_id(db, order_id)
    if not order:
        raise ValueError("Order not found.")
    if order["status"] not in ("processing", "packed"):
        raise ValueError("Confirm and pack the order before dispatch.")
    if order["payment_method"] == "razorpay" and order["payment_status"] != "paid":
        raise ValueError("Online payment must be confirmed before dispatch.")
    if tracking_url and not tracking_url.startswith(("http://", "https://")):
        raise ValueError("Enter a valid tracking URL or leave it blank.")
    courier_name = courier_name.strip() or "Manual delivery"
    await db.execute(
        "UPDATE orders SET status='shipped', shipment_status='in_transit', fulfillment_mode='manual', courier_name=?, tracking_number=?, tracking_url=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (courier_name, tracking_number.strip(), tracking_url.strip(), order_id),
    )
    desc = (
        f"{courier_name} tracking reference {tracking_number.strip()}."
        if tracking_number.strip()
        else f"Dispatched through {courier_name}."
    )
    await record_order_event(db, order_id, "shipped", "Shipment dispatched", desc)
    await db.commit()


async def admin_orders(db: aiosqlite.Connection, filters: dict = {}, limit: int = 250) -> list[dict]:
    """Mirrors gawdee_admin_orders."""
    where = []
    params = []
    query = (filters.get("q") or "").strip()
    if query:
        where.append("(order_number LIKE ? OR customer_name LIKE ? OR email LIKE ? OR phone LIKE ? OR tracking_number LIKE ?)")
        needle = f"%{query}%"
        params += [needle, needle, needle, needle, needle]
    for key in ("status", "payment_status", "fulfillment_mode"):
        value = (filters.get(key) or "").strip()
        if value:
            where.append(f"{key} = ?")
            params.append(value)
    limit = min(10000, max(1, limit))
    sql = "SELECT * FROM orders" + (" WHERE " + " AND ".join(where) if where else "") + f" ORDER BY id DESC LIMIT {limit}"
    async with db.execute(sql, params) as cur:
        rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def adjust_product_stock(db: aiosqlite.Connection, product_id: str, adjustment: int, reason: str, created_by: Optional[int] = None) -> dict:
    """Mirrors gawdee_adjust_product_stock."""
    if adjustment == 0 or not (-100000 <= adjustment <= 100000):
        raise ValueError("Enter a non-zero stock adjustment within the allowed range.")
    reason = reason.strip()
    if len(reason) < 3:
        raise ValueError("Add a short reason for the inventory audit trail.")

    async with db.execute("SELECT id, name, stock FROM products WHERE id = ?", (product_id,)) as cur:
        product = await cur.fetchone()
    if not product:
        raise ValueError("Product not found.")

    new_balance = int(product["stock"]) + adjustment
    if new_balance < 0:
        raise ValueError("This adjustment would make stock negative.")

    await db.execute(
        "UPDATE products SET stock=?, stock_status=CASE WHEN ? > 0 THEN 'in_stock' ELSE 'out_of_stock' END, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (new_balance, new_balance, product_id),
    )
    await record_inventory_event(db, product_id, adjustment, new_balance, reason, None, created_by)
    await db.commit()
    return {"id": product["id"], "name": product["name"], "stock": new_balance}
