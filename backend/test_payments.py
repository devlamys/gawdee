"""Local payment regression checks; no gateway calls or real customer data."""

import asyncio
import hashlib
import hmac
import json
import tempfile
from pathlib import Path

import aiosqlite
from starlette.requests import Request

from app.commerce import create_local_order, mark_order_paid, mark_payment_failed, update_order_status
from app.database import CREATE_TABLES_SQL
from app.integrations import razorpay_payment_matches_order, razorpay_verify_payment, razorpay_verify_webhook
from app.routers import storefront, webhooks
from app import integrations
from fastapi import HTTPException


async def make_db(path: Path, stock: int = 4):
    db = await aiosqlite.connect(path)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA foreign_keys=ON")
    await db.executescript(CREATE_TABLES_SQL)
    await db.execute("INSERT INTO items (id,slug,name) VALUES (1,'ghee','Ghee')")
    await db.execute(
        "INSERT INTO variant (id,item_id,variant_name,slug,stock,legacy_product_id) VALUES (1,1,'500ml','ghee-500',?,'legacy-ghee')",
        (stock,),
    )
    await db.execute(
        "INSERT INTO products (id,slug,name,full_name,category,category_key,price,original_price,stock) VALUES ('legacy-ghee','ghee-500','Ghee','Ghee 500ml','Food','food',899,999,?)",
        (stock,),
    )
    await db.execute(
        """INSERT INTO orders
        (id,order_number,status,payment_method,payment_status,inventory_status,subtotal,total,
         customer_name,email,phone,address1,city,state,pincode,razorpay_order_id)
        VALUES (1,'GD-TEST','cancelled','razorpay','expired','released',1798,1798,
                'Test','test@example.com','919999999999','Test road','Delhi','Delhi','110001','order_test')"""
    )
    await db.execute(
        "INSERT INTO order_items (order_id,product_id,product_name,quantity,unit_price) VALUES (1,'legacy-ghee','Ghee 500ml',2,899)"
    )
    await db.commit()
    return db


async def row(db, sql, params=()):
    async with db.execute(sql, params) as cur:
        result = await cur.fetchone()
    return dict(result) if result else None


async def check_late_capture(tmp: Path):
    db = await make_db(tmp / 'capture.sqlite')
    try:
        await mark_order_paid(db, 1, 'pay_test')
        order = await row(db, 'SELECT status,payment_status,inventory_status,razorpay_payment_id FROM orders WHERE id=1')
        assert order == {'status': 'processing', 'payment_status': 'paid', 'inventory_status': 'deducted', 'razorpay_payment_id': 'pay_test'}
        assert (await row(db, 'SELECT stock FROM variant WHERE id=1'))['stock'] == 2
        assert (await row(db, "SELECT stock FROM products WHERE id='legacy-ghee'"))['stock'] == 2
        await mark_order_paid(db, 1, 'pay_test')
        assert (await row(db, 'SELECT stock FROM variant WHERE id=1'))['stock'] == 2
    finally:
        await db.close()


async def check_short_stock(tmp: Path):
    db = await make_db(tmp / 'short.sqlite', stock=1)
    try:
        await mark_order_paid(db, 1, 'pay_test')
        order = await row(db, 'SELECT status,payment_status,inventory_status FROM orders WHERE id=1')
        assert order == {'status': 'on_hold', 'payment_status': 'paid', 'inventory_status': 'released'}
        assert (await row(db, 'SELECT stock FROM variant WHERE id=1'))['stock'] == 1
        assert (await row(db, 'SELECT count(*) AS n FROM order_status_events WHERE order_id=1'))['n'] == 1
    finally:
        await db.close()


async def check_migration_self_heals_missing_loyalty_columns(tmp: Path):
    db = await aiosqlite.connect(tmp / 'migration_self_heal.sqlite')
    db.row_factory = aiosqlite.Row
    await db.execute('PRAGMA foreign_keys=ON')
    await db.execute("""
        CREATE TABLE orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_number TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            payment_method TEXT NOT NULL DEFAULT 'razorpay',
            payment_status TEXT NOT NULL DEFAULT 'pending',
            shipment_status TEXT NOT NULL DEFAULT 'awaiting_fulfillment',
            currency TEXT NOT NULL DEFAULT 'INR',
            subtotal INTEGER NOT NULL DEFAULT 0,
            shipping INTEGER NOT NULL DEFAULT 0,
            discount INTEGER NOT NULL DEFAULT 0,
            total INTEGER NOT NULL DEFAULT 0,
            coupon_code TEXT NOT NULL DEFAULT '',
            checkout_token TEXT NOT NULL DEFAULT '',
            customer_name TEXT NOT NULL DEFAULT '',
            email TEXT NOT NULL DEFAULT '',
            phone TEXT NOT NULL DEFAULT '',
            address1 TEXT NOT NULL DEFAULT '',
            address2 TEXT NOT NULL DEFAULT '',
            city TEXT NOT NULL DEFAULT '',
            state TEXT NOT NULL DEFAULT '',
            pincode TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
    await db.execute('PRAGMA user_version = 7')
    await db.commit()
    try:
        from app.database import migrate_loyalty_v6
        await migrate_loyalty_v6(db)
        async with db.execute('PRAGMA table_info(orders)') as cur:
            columns = [r['name'] for r in await cur.fetchall()]
        assert 'loyalty_eligible_paise' in columns
        assert 'loyalty_coins_redeemed' in columns
    finally:
        await db.close()


async def check_checkout_reservation(tmp: Path):
    db = await make_db(tmp / 'checkout.sqlite')
    fields = {'name': 'Test', 'email': 'test@example.com', 'phone': '919999999999',
              'address1': 'Test road', 'city': 'Delhi', 'state': 'Delhi', 'pincode': '110001'}
    try:
        order = await create_local_order(db, fields, [{'id': 'legacy-ghee', 'quantity': 2}],
                                         'razorpay', None, 'checkouttoken12345')
        assert order['payment_status'] == 'initializing'
        assert order['inventory_status'] == 'reserved'
        assert (await row(db, 'SELECT stock FROM variant WHERE id=1'))['stock'] == 2
        assert (await row(db, "SELECT stock FROM products WHERE id='legacy-ghee'"))['stock'] == 2
        await mark_payment_failed(db, order['id'], 'Gateway order creation failed')
        assert (await row(db, 'SELECT stock FROM variant WHERE id=1'))['stock'] == 4
        assert (await row(db, "SELECT stock FROM products WHERE id='legacy-ghee'"))['stock'] == 4
    finally:
        await db.close()


async def check_checkout_accepts_item_id(tmp: Path):
    db = await make_db(tmp / 'itemid_checkout.sqlite')
    fields = {'name': 'Test', 'email': 'test@example.com', 'phone': '919999999999',
              'address1': 'Test road', 'city': 'Delhi', 'state': 'Delhi', 'pincode': '110001'}
    try:
        order = await create_local_order(db, fields, [{'id': 1, 'quantity': 1}], 'razorpay', None, 'checkouttoken_itemid')
        assert order['payment_status'] == 'initializing'
        assert order['total'] == 998
    finally:
        await db.close()


async def check_checkout_rollback(tmp: Path):
    db = await make_db(tmp / 'rollback.sqlite')
    fields = {'name': 'Test', 'email': 'test@example.com', 'phone': '919999999999',
              'address1': 'Test road', 'city': 'Delhi', 'state': 'Delhi', 'pincode': '110001'}
    try:
        try:
            await create_local_order(db, fields,
                                     [{'id': 'legacy-ghee', 'quantity': 3}, {'id': 'legacy-ghee', 'quantity': 3}],
                                     'razorpay', None, 'checkouttoken54321')
            raise AssertionError('Expected stock reservation to fail')
        except ValueError as exc:
            assert 'sold out' in str(exc)
        assert (await row(db, 'SELECT stock FROM variant WHERE id=1'))['stock'] == 4
        assert (await row(db, "SELECT stock FROM products WHERE id='legacy-ghee'"))['stock'] == 4
        assert (await row(db, 'SELECT count(*) AS n FROM orders'))['n'] == 1
    finally:
        await db.close()


async def check_cod_checkout(tmp: Path):
    db = await make_db(tmp / 'cod.sqlite')
    fields = {'name': 'Test', 'email': 'test@example.com', 'phone': '919999999999',
              'address1': 'Test road', 'city': 'Delhi', 'state': 'Delhi', 'pincode': '110001'}
    try:
        order = await create_local_order(db, fields, [{'id': 'legacy-ghee', 'quantity': 2}],
                                         'cod', None, 'codcheckouttoken123')
        assert order['status'] == 'processing'
        assert order['payment_status'] == 'cod_pending'
        assert order['inventory_status'] == 'deducted'
        assert (await row(db, 'SELECT stock FROM variant WHERE id=1'))['stock'] == 2
    finally:
        await db.close()


async def check_admin_cod_delivery_marks_paid(tmp: Path):
    db = await make_db(tmp / 'admin_cod_delivery.sqlite')
    try:
        order = await create_local_order(db, {'name': 'Test', 'email': 'test@example.com', 'phone': '919999999999',
                                            'address1': 'Test road', 'city': 'Delhi', 'state': 'Delhi', 'pincode': '110001'},
                                        [{'id': 'legacy-ghee', 'quantity': 1}], 'cod', None, 'admin_cod_delivery_token')
        await update_order_status(db, order['id'], 'delivered', 'Delivered and cash received')
        updated = await row(db, "SELECT status, payment_status FROM orders WHERE id=?", (order['id'],))
        assert updated['status'] == 'delivered'
        assert updated['payment_status'] == 'paid'
    finally:
        await db.close()


async def check_gateway_order_and_verify(tmp: Path):
    db = await make_db(tmp / 'gateway.sqlite')
    await db.execute("UPDATE orders SET status='pending',payment_status='pending',inventory_status='reserved' WHERE id=1")
    await db.executemany(
        'INSERT INTO settings (setting_key,setting_value) VALUES (?,?)',
        [('razorpay_key_id', 'rzp_test_example'), ('razorpay_key_secret', 'test-secret')],
    )
    await db.commit()
    original_http = integrations.http_request
    original_fetch = storefront.razorpay_fetch_payment
    original_session = storefront.set_session_value
    original_process = storefront.process_notification_queue
    calls = []

    async def fake_http(method, url, headers, body, timeout, auth):
        calls.append((method, url, body, auth))
        return {'data': {'id': 'order_test'}}

    async def fake_fetch(_db, payment_id):
        assert payment_id == 'pay_test'
        return {'order_id': 'order_test', 'amount': 179800, 'currency': 'INR', 'status': 'captured'}

    async def noop(*_args):
        return None

    integrations.http_request = fake_http
    storefront.razorpay_fetch_payment = fake_fetch
    storefront.set_session_value = noop
    storefront.process_notification_queue = noop
    try:
        created = await integrations.razorpay_create_order(db, 1798, 'GD-TEST')
        assert created['id'] == 'order_test'
        assert calls[0][0] == 'POST' and calls[0][2]['amount'] == 179800
        assert calls[0][2]['currency'] == 'INR' and calls[0][3] == ('rzp_test_example', 'test-secret')

        bad = storefront.VerifyPaymentRequest(order_number='GD-TEST', razorpay_payment_id='pay_test', razorpay_signature='bad')
        try:
            await storefront.verify_payment(bad, request(b'', '', ''), db)
            raise AssertionError('Invalid checkout signature accepted')
        except HTTPException as exc:
            assert exc.status_code == 422
        assert (await row(db, 'SELECT payment_status FROM orders WHERE id=1'))['payment_status'] == 'pending'

        digest = hmac.new(b'test-secret', b'order_test|pay_test', hashlib.sha256).hexdigest()
        valid = storefront.VerifyPaymentRequest(order_number='GD-TEST', razorpay_payment_id='pay_test', razorpay_signature=digest)
        assert (await storefront.verify_payment(valid, request(b'', '', ''), db))['ok']
        assert (await row(db, 'SELECT payment_status FROM orders WHERE id=1'))['payment_status'] == 'paid'
    finally:
        integrations.http_request = original_http
        storefront.razorpay_fetch_payment = original_fetch
        storefront.set_session_value = original_session
        storefront.process_notification_queue = original_process
        await db.close()


def request(body: bytes, signature: str, event_id: str):
    sent = False

    async def receive():
        nonlocal sent
        if sent:
            return {'type': 'http.request', 'body': b'', 'more_body': False}
        sent = True
        return {'type': 'http.request', 'body': body, 'more_body': False}

    scope = {'type': 'http', 'method': 'POST', 'path': '/api/webhooks/razorpay',
             'headers': [(b'x-razorpay-signature', signature.encode()), (b'x-razorpay-event-id', event_id.encode())]}
    return Request(scope, receive)


async def check_webhooks(tmp: Path):
    path = tmp / 'webhook.sqlite'
    db = await make_db(path)
    await db.execute("UPDATE orders SET status='pending',payment_status='pending',inventory_status='reserved' WHERE id=1")
    await db.commit()
    await db.close()
    original_get_db, original_migrate, original_get_setting = webhooks.get_db, webhooks.migrate, webhooks.get_setting
    original_process = webhooks.process_notification_queue

    async def local_db():
        conn = await aiosqlite.connect(path)
        conn.row_factory = aiosqlite.Row
        await conn.execute('PRAGMA foreign_keys=ON')
        return conn

    async def setting(_db, key):
        assert key == 'razorpay_webhook_secret'
        return 'webhook-secret'

    async def noop(*_args):
        return None

    webhooks.get_db, webhooks.migrate, webhooks.get_setting = local_db, noop, setting
    webhooks.process_notification_queue = noop
    try:
        failed = {'event': 'payment.failed', 'payload': {'payment': {'entity': {
            'id': 'pay_failed', 'order_id': 'order_test', 'error_description': 'Card declined',
        }}}}
        raw = json.dumps(failed).encode()
        signature = hmac.new(b'webhook-secret', raw, hashlib.sha256).hexdigest()
        assert (await webhooks.razorpay_webhook(request(raw, signature, 'event-failed')))['ok']
        db = await local_db()
        try:
            order = await row(db, 'SELECT status,payment_status,inventory_status FROM orders WHERE id=1')
            assert order == {'status': 'pending', 'payment_status': 'pending', 'inventory_status': 'reserved'}
        finally:
            await db.close()

        captured = {'event': 'payment.captured', 'payload': {'payment': {'entity': {
            'id': 'pay_captured', 'order_id': 'order_test', 'amount': 179800,
            'currency': 'INR', 'status': 'captured',
        }}}}
        raw = json.dumps(captured).encode()
        signature = hmac.new(b'webhook-secret', raw, hashlib.sha256).hexdigest()
        assert (await webhooks.razorpay_webhook(request(raw, signature, 'event-captured')))['ok']
        db = await local_db()
        try:
            order = await row(db, 'SELECT status,payment_status,razorpay_payment_id FROM orders WHERE id=1')
            assert order == {'status': 'processing', 'payment_status': 'paid', 'razorpay_payment_id': 'pay_captured'}
        finally:
            await db.close()
    finally:
        webhooks.get_db, webhooks.migrate, webhooks.get_setting = original_get_db, original_migrate, original_get_setting
        webhooks.process_notification_queue = original_process


async def main():
    digest = hmac.new(b'test-secret', b'order_test|pay_test', hashlib.sha256).hexdigest()
    assert razorpay_verify_payment('order_test', 'pay_test', digest, 'test-secret')
    assert not razorpay_verify_payment('order_other', 'pay_test', digest, 'test-secret')
    body = '{"event":"payment.captured"}'
    signature = hmac.new(b'webhook-secret', body.encode(), hashlib.sha256).hexdigest()
    assert razorpay_verify_webhook(body, signature, 'webhook-secret')
    assert not razorpay_verify_webhook(body + ' ', signature, 'webhook-secret')
    order = {'razorpay_order_id': 'order_test', 'total': 1798}
    payment = {'order_id': 'order_test', 'amount': 179800, 'currency': 'INR', 'status': 'captured'}
    assert razorpay_payment_matches_order(payment, order)
    assert not razorpay_payment_matches_order({**payment, 'amount': 100}, order)
    assert not razorpay_payment_matches_order({**payment, 'status': 'authorized'}, order)
    paise_order = {**order, 'total': 379, 'total_paise': 37950, 'subtotal_paise': 40000}
    assert razorpay_payment_matches_order({**payment, 'amount': 37950}, paise_order)
    assert not razorpay_payment_matches_order({**payment, 'amount': 37900}, paise_order)
    with tempfile.TemporaryDirectory() as directory:
        tmp = Path(directory)
        await check_late_capture(tmp)
        await check_short_stock(tmp)
        await check_checkout_reservation(tmp)
        await check_checkout_accepts_item_id(tmp)
        await check_checkout_rollback(tmp)
        await check_cod_checkout(tmp)
        await check_admin_cod_delivery_marks_paid(tmp)
        await check_gateway_order_and_verify(tmp)
        await check_webhooks(tmp)
    print('Payment checks passed: COD, mocked gateway order/verification, signatures, webhooks, retry, stock rollback and late recovery.')


if __name__ == '__main__':
    asyncio.run(main())
