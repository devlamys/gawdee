import asyncio

import aiosqlite

from app import integrations
from app.database import CREATE_TABLES_SQL
from app.integrations import (
    build_order_whatsapp_payload,
    build_product_query_answer,
    build_whatsapp_support_event,
    build_checkout_abandoned_event,
    build_campaign_offer_event,
)


async def _create_test_db():
    db = await aiosqlite.connect(":memory:")
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA foreign_keys = ON")
    await db.executescript(CREATE_TABLES_SQL)
    await db.commit()
    return db


async def _insert_user(db, *, email="test@example.com", phone="8891066981", whatsapp=1, sms=1, email_opt=1, followup=1):
    await db.execute(
        """
        INSERT INTO users (
            name, email, password_hash, role, phone,
            whatsapp_marketing_opt_in, sms_marketing_opt_in, email_marketing_opt_in,
            whatsapp_followup_opt_in, whatsapp_opt_out_at, sms_opt_out_at, email_opt_out_at
        ) VALUES (?, ?, ?, 'customer', ?, ?, ?, ?, ?, NULL, NULL, NULL)
        """,
        (
            "Test User",
            email,
            "hashed-password",
            phone,
            whatsapp,
            sms,
            email_opt,
            followup,
        ),
    )
    await db.commit()
    async with db.execute("SELECT id FROM users WHERE email=?", (email,)) as cur:
        row = await cur.fetchone()
    return int(row["id"])


def test_build_order_whatsapp_payload_includes_order_and_image():
    payload = build_order_whatsapp_payload(
        {
            "order_number": "GWD-1001",
            "customer_name": "Asha",
            "total": 1499,
            "payment_method": "razorpay",
        },
        [{
            "quantity": 1,
            "product_name": "A2 Gir Cow Ghee",
            "variant_name": "500ml",
            "image_url": "https://cdn.example.com/ghee-500ml.jpg",
        }],
    )

    assert "GWD-1001" in payload["text"]
    assert "Asha" in payload["text"]
    assert payload["image_url"] == "https://cdn.example.com/ghee-500ml.jpg"
    assert "ghee" in payload["text"].lower()


def test_build_product_query_answer_handles_variant_question():
    products = [{
        "full_name": "A2 Gir Cow Ghee",
        "price": 899,
        "description": "Traditional bilona ghee made from A2 Gir cow milk.",
        "image": "https://cdn.example.com/ghee.jpg",
    }]

    reply = build_product_query_answer(
        "what variants do you have for ghee?",
        products,
        "999",
        "care@gawdee.com",
    )

    assert "A2 Gir Cow Ghee" in reply
    assert "variant" in reply.lower()
    assert "care@gawdee.com" in reply


def test_build_whatsapp_support_event_uses_meta_receive_time():
    event = build_whatsapp_support_event({
        "id": "wamid.test-1",
        "from": "8891066981",
        "timestamp": "1760000000",
        "text": {"body": "What ghee sizes are available?"},
    })

    assert event == {
        "type": "whatsapp.message",
        "message_id": "wamid.test-1",
        "from": "918891066981",
        "text": "What ghee sizes are available?",
        "received_at": "2025-10-09T08:53:20Z",
    }
    assert build_whatsapp_support_event({"id": "wamid.test-2", "from": "8891066981", "text": {"body": "Hi"}}) is None


def test_forward_whatsapp_support_event_uses_header_auth(monkeypatch):
    calls = []

    async def fake_get_setting(_db, key):
        return {
            "n8n_support_webhook_url": "http://127.0.0.1:5678/webhook/gawdee/support",
            "n8n_support_webhook_key": "test-secret",
        }[key]

    async def fake_http_request(method, url, headers, body):
        calls.append((method, url, headers, body))
        return {"status": 200, "data": {}}

    async def fake_log_integration(*_args):
        pass

    monkeypatch.setattr(integrations, "get_setting", fake_get_setting)
    monkeypatch.setattr(integrations, "http_request", fake_http_request)
    monkeypatch.setattr(integrations, "log_integration", fake_log_integration)

    event = {"type": "whatsapp.message", "message_id": "wamid.test-1"}
    assert asyncio.run(integrations.forward_whatsapp_support_event(None, event)) is True
    assert calls == [(
        "POST",
        "http://127.0.0.1:5678/webhook/gawdee/support",
        {"Content-Type": "application/json", "X-Gawdee-Automation-Key": "test-secret"},
        event,
    )]


def test_build_checkout_abandoned_event_uses_phone_and_followup_flag():
    payload = build_checkout_abandoned_event({
        "phone": "8891066981",
        "whatsapp_followup_opt_in": True,
        "purchased": False,
        "abandoned_at": "2026-09-21T10:00:00Z",
        "checkout_url": "https://shop.example.com/checkout",
        "product_name": "A2 Gir Cow Ghee 500ml",
        "image_url": "https://cdn.example.com/ghee-500ml.jpg",
    })

    assert payload["type"] == "checkout.abandoned"
    assert payload["lead"]["phone"] == "918891066981"
    assert payload["lead"]["whatsapp_followup_opt_in"] is True
    assert payload["lead"]["product_name"] == "A2 Gir Cow Ghee 500ml"
    assert payload["lead"]["checkout_url"] == "https://shop.example.com/checkout"


def test_build_campaign_offer_event_includes_offer_and_recipient_consent():
    payload = build_campaign_offer_event({
        "phone": "+91 88910 66981",
        "email": "asha@example.com",
        "whatsapp_marketing_opt_in": True,
        "sms_marketing_opt_in": True,
        "email_marketing_opt_in": True,
        "whatsapp_opted_out": False,
        "sms_opted_out": False,
        "email_opted_out": False,
        "unsubscribe_url": "https://shop.example.com/unsubscribe/token",
    }, {
        "title": "Autumn offer",
        "description": "Save on selected Gawdee products this week.",
        "url": "https://shop.example.com/offers/autumn",
        "image_url": "https://shop.example.com/assets/autumn-offer.jpg",
    })

    assert payload["type"] == "campaign.offer"
    assert payload["recipient"]["phone"] == "918891066981"
    assert payload["recipient"]["email"] == "asha@example.com"
    assert payload["offer"]["title"] == "Autumn offer"
    assert payload["recipient"]["whatsapp_marketing_opt_in"] is True


def test_dispatch_n8n_event_sends_payload_to_configured_url(monkeypatch):
    calls = []

    async def fake_get_setting(_db, key, default=""):
        values = {
            "n8n_order_webhook_url": "https://n8n.example.com/webhook/gawdee/order",
            "n8n_order_webhook_key": "test-order-key",
        }
        return values.get(key, default)

    async def fake_http_request(method, url, headers, body, **kwargs):
        calls.append((method, url, headers, body))
        return {"status": 200, "data": {}}

    async def fake_log_integration(*_args, **_kwargs):
        return None

    monkeypatch.setattr(integrations, "get_setting", fake_get_setting)
    monkeypatch.setattr(integrations, "http_request", fake_http_request)
    monkeypatch.setattr(integrations, "log_integration", fake_log_integration)

    event = {"type": "order.confirmed", "event_id": "evt-1"}
    assert asyncio.run(integrations.dispatch_n8n_event(None, "gawdee/order", event)) is True
    assert calls[0][0] == "POST"
    assert calls[0][1] == "https://n8n.example.com/webhook/gawdee/order"
    assert calls[0][2]["X-Gawdee-Automation-Key"] == "test-order-key"


def test_abandoned_checkout_flow_dispatches_followup_event(monkeypatch):
    async def run():
        db = await _create_test_db()
        calls = []

        async def fake_dispatch(_db, path, payload):
            calls.append((path, payload))
            return True

        monkeypatch.setattr(integrations, "dispatch_n8n_event", fake_dispatch)
        await integrations.trigger_checkout_abandoned_event(db, {
            "phone": "8891066981",
            "whatsapp_followup_opt_in": True,
            "purchased": False,
            "abandoned_at": "2026-09-21T10:00:00Z",
            "checkout_url": "https://shop.example.com/checkout",
            "product_name": "A2 Gir Cow Ghee 500ml",
            "image_url": "https://cdn.example.com/ghee-500ml.jpg",
        })
        assert len(calls) == 1
        assert calls[0][0] == "gawdee/followup"
        assert calls[0][1]["lead"]["phone"] == "918891066981"
        assert calls[0][1]["lead"]["whatsapp_followup_opt_in"] is True

    asyncio.run(run())


def test_dispatch_offer_campaigns_sends_only_opted_in_customers(monkeypatch):
    async def run():
        db = await _create_test_db()
        user1 = await _insert_user(db, email="opted@example.com", phone="8891066981", whatsapp=1, sms=1, email_opt=1, followup=1)
        user2 = await _insert_user(db, email="notopted@example.com", phone="9988776655", whatsapp=0, sms=0, email_opt=0, followup=0)

        calls = []

        async def fake_trigger(_db, recipient, offer, channel):
            calls.append((channel, recipient, offer))
            return True

        monkeypatch.setattr(integrations, "trigger_campaign_offer_event", fake_trigger)
        sent = await integrations.dispatch_offer_campaigns(db, {
            "title": "Summer offer",
            "description": "Save on wellness essentials.",
            "url": "https://shop.example.com/offers/summer",
            "image_url": "https://shop.example.com/assets/offer.jpg",
        })

        assert sent == 1
        assert len(calls) == 1
        assert calls[0][0] == "whatsapp"
        assert calls[0][1]["phone"] == "918891066981"
        assert calls[0][1]["whatsapp_marketing_opt_in"] is True
        assert user2 is not None

    asyncio.run(run())


def test_process_notification_queue_blocks_consent_and_suppresses_provider_call(monkeypatch):
    async def run():
        db = await _create_test_db()
        user_id = await _insert_user(db, email="blocked@example.com", phone="8891066981", whatsapp=0, sms=0, email_opt=0, followup=0)
        await db.execute(
            "INSERT INTO notification_queue (user_id, channel, notification_type, recipient, template_name, language, variables_json, dedupe_key, status, attempts, scheduled_at, updated_at, created_at) VALUES (?, 'sms', 'marketing', ?, 'campaign_welcome', 'en_US', '[\"Hello\"]', ?, 'queued', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            (user_id, "+91 88910 66981", f"marketing:{user_id}:sms:blocked"),
        )
        await db.commit()

        called = {"count": 0}

        async def fake_sms_send(_db, phone, text):
            called["count"] += 1
            return {"message_id": "sms-123"}

        monkeypatch.setattr(integrations, "get_setting", lambda _db, key, default="": {
            "sms_provider": "twilio",
            "sms_enabled": "1",
            "sms_account_sid": "sid",
            "sms_auth_token": "token",
            "sms_from_number": "+15551234567",
            "whatsapp_cloud_enabled": "1",
            "whatsapp_phone_number_id": "phone-id",
            "whatsapp_access_token": "token",
            "whatsapp_marketing_enabled": "1",
            "sms_marketing_enabled": "1",
            "email_marketing_enabled": "1",
            "email_provider": "sendgrid",
            "email_enabled": "1",
            "email_api_key": "key",
            "email_from_email": "info@gawdee.com",
            "email_from_name": "Gawdee",
        }.get(key, default))
        monkeypatch.setattr(integrations, "sms_send_message", fake_sms_send)

        result = await integrations.process_notification_queue(db, 10)
        assert result["skipped"] == 1
        assert called["count"] == 0

        async with db.execute("SELECT status, attempts FROM notification_queue WHERE user_id=?", (user_id,)) as cur:
            row = await cur.fetchone()
        assert row["status"] == "cancelled"

    asyncio.run(run())


def test_queue_marketing_notification_prevents_duplicate_campaign_entries():
    async def run():
        db = await _create_test_db()
        user_id = await _insert_user(db, email="dup@example.com", phone="8891066981", whatsapp=1, sms=1, email_opt=1, followup=1)

        first = await integrations.queue_marketing_notification(db, user_id, "sms", "Campaign hello", "Offer")
        second = await integrations.queue_marketing_notification(db, user_id, "sms", "Campaign hello", "Offer")

        async with db.execute("SELECT COUNT(*) AS c FROM notification_queue WHERE user_id=?", (user_id,)) as cur:
            count = (await cur.fetchone())["c"]
        assert first is True
        assert second is False
        assert count == 1

    asyncio.run(run())


def test_failed_provider_retries_mark_queue_as_failed_after_retry_limit(monkeypatch):
    async def run():
        db = await _create_test_db()
        user_id = await _insert_user(db, email="retry@example.com", phone="8891066981", whatsapp=1, sms=1, email_opt=1, followup=1)
        await db.execute(
            "INSERT INTO notification_queue (user_id, channel, notification_type, recipient, template_name, language, variables_json, dedupe_key, status, attempts, scheduled_at, updated_at, created_at) VALUES (?, 'sms', 'marketing', ?, 'campaign_retry', 'en_US', '[\"Hi\"]', ?, 'retry', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            (user_id, "+91 88910 66981", f"marketing:{user_id}:sms:retry"),
        )
        await db.commit()

        async def fake_sms_send(_db, phone, text):
            raise RuntimeError("provider down")

        monkeypatch.setattr(integrations, "get_setting", lambda _db, key, default="": {
            "sms_provider": "twilio",
            "sms_enabled": "1",
            "sms_account_sid": "sid",
            "sms_auth_token": "token",
            "sms_from_number": "+15551234567",
        }.get(key, default))
        monkeypatch.setattr(integrations, "sms_send_message", fake_sms_send)

        result = await integrations.process_notification_queue(db, 10)
        assert result["failed"] == 1

        async with db.execute("SELECT status, attempts FROM notification_queue WHERE user_id=?", (user_id,)) as cur:
            row = await cur.fetchone()
        assert row["status"] == "failed"
        assert row["attempts"] == 5

    asyncio.run(run())
