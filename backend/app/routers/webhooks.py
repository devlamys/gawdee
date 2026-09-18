"""
Gawdee FastAPI Backend
Webhook routers — Razorpay, Delhivery, and WhatsApp webhooks
"""

import hashlib
import hmac
import json
import secrets
from fastapi import APIRouter, Request, Response, HTTPException

from ..database import get_db, migrate, get_setting, record_webhook_event, complete_webhook_event, log_integration
from ..integrations import (
    razorpay_verify_webhook, razorpay_payment_matches_order,
    whatsapp_verify_webhook, normalize_phone,
    process_notification_queue, delhivery_map_order_status,
)
from ..commerce import mark_order_paid, mark_payment_failed, update_order_status, order_allowed_transitions
from ..core.config import settings

router = APIRouter(prefix="/webhooks")


async def db_dep():
    db = await get_db()
    try:
        await migrate(db)
        yield db
    finally:
        await db.close()


# ── POST /api/webhooks/razorpay ───────────────────────────────────────────────

@router.post("/razorpay")
async def razorpay_webhook(request: Request):
    raw = (await request.body()).decode("utf-8", errors="replace")
    signature = request.headers.get("X-Razorpay-Signature", "")

    db = await get_db()
    try:
        await migrate(db)
        secret = await get_setting(db, "razorpay_webhook_secret")
        if not razorpay_verify_webhook(raw, signature, secret):
            await log_integration(db, "razorpay", "webhook", "failed", "Invalid webhook signature.")
            raise HTTPException(status_code=400, detail="Invalid signature.")

        import json
        event = json.loads(raw)
        event_name = str(event.get("event", ""))
        payment = event.get("payload", {}).get("payment", {}).get("entity", {})
        rp_order_id = str(payment.get("order_id") or event.get("payload", {}).get("order", {}).get("entity", {}).get("id", ""))
        payment_id = str(payment.get("id", ""))
        event_key = request.headers.get("X-Razorpay-Event-Id", "").strip() or hashlib.sha256(raw.encode()).hexdigest()

        if not await record_webhook_event(db, "razorpay", event_key, event_name, raw):
            return {"ok": True, "duplicate": True}

        try:
            if rp_order_id and event_name in ("payment.captured", "order.paid"):
                async with db.execute("SELECT * FROM orders WHERE razorpay_order_id=?", (rp_order_id,)) as cur:
                    order = await cur.fetchone()
                if order:
                    order = dict(order)
                    remote_amount = int(payment.get("amount") or event.get("payload", {}).get("order", {}).get("entity", {}).get("amount_paid", -1))
                    remote_currency = str(payment.get("currency") or event.get("payload", {}).get("order", {}).get("entity", {}).get("currency", settings.CURRENCY)).upper()
                    if remote_amount != int(order["total"]) * 100 or remote_currency != settings.CURRENCY:
                        raise RuntimeError("Signed webhook amount or currency did not match the local order.")
                    await mark_order_paid(db, int(order["id"]), payment_id)

            if rp_order_id and event_name == "payment.failed":
                async with db.execute("SELECT id FROM orders WHERE razorpay_order_id=?", (rp_order_id,)) as cur:
                    row = await cur.fetchone()
                if row:
                    reason = str(payment.get("error_description") or payment.get("error_reason") or "Razorpay reported that payment was not completed.")
                    await mark_payment_failed(db, int(row["id"]), reason)

            await process_notification_queue(db, settings.NOTIFICATION_BATCH_WEBHOOK)
            await complete_webhook_event(db, "razorpay", event_key)
        except Exception as error:
            await db.execute("DELETE FROM webhook_events WHERE provider=? AND event_key=?", ("razorpay", event_key))
            await db.commit()
            await log_integration(db, "razorpay", "webhook", "failed", str(error), payment_id or rp_order_id)
            raise HTTPException(status_code=500, detail="Webhook processing will be retried.")

        await log_integration(db, "razorpay", "webhook", "success", event_name, payment_id or rp_order_id)
        return {"ok": True}
    finally:
        await db.close()


# ── POST /api/webhooks/delhivery ──────────────────────────────────────────────

@router.post("/delhivery")
async def delhivery_webhook(request: Request):
    raw = (await request.body()).decode("utf-8", errors="replace")
    db = await get_db()
    try:
        await migrate(db)

        # ── Token auth (mirrors PHP: ?token= query param or Authorization: Bearer)
        secret = await get_setting(db, "delhivery_webhook_secret")
        provided = request.query_params.get("token", "").strip()
        if not provided:
            auth_header = request.headers.get("Authorization", "")
            import re as _re
            m = _re.match(r"Bearer\s+(.+)", auth_header, _re.IGNORECASE)
            if m:
                provided = m.group(1).strip()
        if not secret or not provided or not secrets.compare_digest(secret, provided):
            raise HTTPException(status_code=403, detail="Invalid webhook token.")

        try:
            payload = json.loads(raw)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON.")

        # ── Parse nested Shipment block (mirrors PHP exactly)
        shipment = payload.get("Shipment") if isinstance(payload.get("Shipment"), dict) else payload
        waybill = str(shipment.get("AWB") or shipment.get("Waybill") or shipment.get("waybill") or payload.get("waybill") or "").strip()
        status_block = shipment.get("Status") if isinstance(shipment.get("Status"), dict) else {}
        status_str = str(status_block.get("Status") or shipment.get("status") or payload.get("status") or "").strip()
        event_key = waybill + ":" + hashlib.sha256(raw.encode()).hexdigest()

        if not waybill or not await record_webhook_event(db, "delhivery", event_key, status_str, raw):
            return {"ok": True, "duplicate": waybill != ""}

        try:
            async with db.execute("SELECT * FROM orders WHERE delhivery_waybill=? LIMIT 1", (waybill,)) as cur:
                order = await cur.fetchone()
            if order:
                order = dict(order)
                mapped = delhivery_map_order_status(status_str)
                await db.execute(
                    "UPDATE orders SET delhivery_last_status=?, delhivery_last_sync_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                    (status_str, int(order["id"])),
                )
                await db.commit()
                if mapped and mapped != order["status"] and mapped in order_allowed_transitions(order):
                    await update_order_status(db, int(order["id"]), mapped, f"Updated by Delhivery: {status_str}.")
            await process_notification_queue(db, settings.NOTIFICATION_BATCH_WEBHOOK)
            await complete_webhook_event(db, "delhivery", event_key)
            await log_integration(db, "delhivery", "webhook", "success", status_str, waybill)
        except Exception as error:
            await db.execute("DELETE FROM webhook_events WHERE provider=? AND event_key=?", ("delhivery", event_key))
            await db.commit()
            await log_integration(db, "delhivery", "webhook", "failed", str(error), waybill)
            raise HTTPException(status_code=500, detail="Webhook processing will be retried.")

        return {"ok": True}
    finally:
        await db.close()


# ── GET+POST /api/webhooks/whatsapp ──────────────────────────────────────────
# GET  — Meta hub verification challenge
# POST — Delivery receipt status sync + marketing opt-out

@router.get("/whatsapp")
async def whatsapp_webhook_verify(request: Request):
    """Mirrors the GET handler in whatsapp-webhook.php."""
    db = await get_db()
    try:
        await migrate(db)
        mode = request.query_params.get("hub_mode") or request.query_params.get("hub.mode", "")
        token = request.query_params.get("hub_verify_token") or request.query_params.get("hub.verify_token", "")
        challenge = request.query_params.get("hub_challenge") or request.query_params.get("hub.challenge", "")
        verify_token = await get_setting(db, "whatsapp_verify_token")
        if mode == "subscribe" and challenge and verify_token and secrets.compare_digest(verify_token, token):
            from fastapi.responses import PlainTextResponse
            return PlainTextResponse(challenge)
        raise HTTPException(status_code=403, detail="Verification failed.")
    finally:
        await db.close()


@router.post("/whatsapp")
async def whatsapp_webhook_receive(request: Request):
    """Mirrors the POST handler in whatsapp-webhook.php."""
    raw = (await request.body()).decode("utf-8", errors="replace")
    signature = request.headers.get("X-Hub-Signature-256", "")

    db = await get_db()
    try:
        await migrate(db)
        app_secret = await get_setting(db, "whatsapp_app_secret")
        if not app_secret or not signature.startswith("sha256="):
            await log_integration(db, "whatsapp", "webhook", "failed", "Invalid Meta webhook signature.")
            raise HTTPException(status_code=400, detail="Invalid signature.")
        expected = "sha256=" + hmac.new(app_secret.encode(), raw.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature):
            await log_integration(db, "whatsapp", "webhook", "failed", "Invalid Meta webhook signature.")
            raise HTTPException(status_code=400, detail="Invalid signature.")

        try:
            event = json.loads(raw)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON.")

        event_key = hashlib.sha256(raw.encode()).hexdigest()
        if not await record_webhook_event(db, "whatsapp", event_key, "messages", raw):
            return {"ok": True, "duplicate": True}

        try:
            for entry in event.get("entry", []):
                for change in entry.get("changes", []):
                    value = change.get("value", {})

                    # ── Delivery receipt status updates
                    for status in value.get("statuses", []):
                        message_id = str(status.get("id", "")).strip()
                        state = str(status.get("status", "")).lower().strip()
                        if not message_id or state not in ("sent", "delivered", "read", "failed"):
                            continue
                        error_message = ""
                        if state == "failed":
                            errs = status.get("errors", [{}])
                            error_message = str(errs[0].get("title") or errs[0].get("message") or "WhatsApp reported delivery failure.")[:1000]
                        await db.execute(
                            "UPDATE notification_queue SET status=?, error_message=?, updated_at=CURRENT_TIMESTAMP WHERE provider_message_id=?",
                            (state, error_message, message_id),
                        )

                    # ── Marketing opt-out
                    for message in value.get("messages", []):
                        text = str(message.get("text", {}).get("body") or message.get("button", {}).get("text", "")).lower().strip()
                        if text not in ("stop", "unsubscribe", "cancel", "opt out"):
                            continue
                        phone = normalize_phone(str(message.get("from", "")))
                        if phone:
                            await db.execute(
                                "UPDATE users SET whatsapp_marketing_opt_in=0, whatsapp_opt_out_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE role='customer' AND phone LIKE ?",
                                (f"%{phone[-10:]}%",),
                            )

            await db.commit()
            await complete_webhook_event(db, "whatsapp", event_key)
            await log_integration(db, "whatsapp", "webhook", "success", "Delivery receipts processed.", event_key)
        except Exception as error:
            await db.execute("DELETE FROM webhook_events WHERE provider=? AND event_key=?", ("whatsapp", event_key))
            await db.commit()
            await log_integration(db, "whatsapp", "webhook", "failed", str(error), event_key)
            raise HTTPException(status_code=500, detail="Webhook processing will be retried.")

        return {"ok": True}
    finally:
        await db.close()
