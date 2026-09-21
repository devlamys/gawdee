import asyncio
import tempfile
import unittest

import aiosqlite
from fastapi.testclient import TestClient

from app.commerce import create_local_order, mark_order_paid
from app.database import CREATE_TABLES_SQL
from app.main import app
from app.routers.storefront import CreateOrderRequest


class LoyaltyRoutesAuthTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_customer_loyalty_wallet_requires_auth(self):
        response = self.client.get("/api/loyalty/wallet")
        self.assertEqual(response.status_code, 401)

    def test_customer_loyalty_wallet_reads_expiring_coins(self):
        async def run_case():
            fd, db_path = tempfile.mkstemp(suffix=".sqlite")
            import os
            os.close(fd)
            db = await aiosqlite.connect(db_path)
            db.row_factory = aiosqlite.Row
            await db.execute("PRAGMA foreign_keys=ON")
            await db.executescript(CREATE_TABLES_SQL)
            await db.execute("INSERT INTO users (id, name, email, password_hash, phone, role) VALUES (1, 'Asha', 'asha@example.com', 'hash', '9123456789', 'customer')")
            await db.execute("INSERT INTO loyalty_wallets (customer_id, available_coins, pending_coins, reserved_coins, lifetime_earned, lifetime_redeemed, lifetime_expired, lifetime_reversed) VALUES (1, 120, 0, 0, 120, 0, 0, 0)")
            await db.execute(
                "INSERT INTO loyalty_transactions (customer_id, transaction_type, direction, coins, delta_available, delta_pending, delta_reserved, status, reference_id, source, description, available_at, expires_at) VALUES (1, 'PURCHASE_EARN', 'CREDIT', 12, 12, 0, 0, 'AVAILABLE', 'LOT:EXPIRING:1', 'system', 'Expiring reward', datetime('now'), datetime('now', '+7 days'))"
            )
            await db.execute(
                "INSERT INTO loyalty_lots (customer_id, earn_transaction_id, total_coins, pending_coins, available_coins, reserved_coins, spent_coins, expired_coins, reversed_coins, debt_offset_coins, available_at, expires_at) VALUES (1, 1, 12, 0, 12, 0, 0, 0, 0, 0, datetime('now'), datetime('now', '+7 days'))"
            )
            from app.routers.account import loyalty_wallet
            response = await loyalty_wallet(customer={"id": 1}, db=db)
            self.assertEqual(response["wallet"]["available_coins"], 120)
            self.assertEqual(response["wallet"]["expiring_soon_coins"], 12)
            await db.close()
            os.unlink(db_path)

        asyncio.run(run_case())

    def test_admin_loyalty_settings_requires_auth(self):
        response = self.client.get("/api/admin/loyalty/settings")
        self.assertEqual(response.status_code, 401)

    def test_create_order_request_accepts_loyalty_coins(self):
        payload = CreateOrderRequest(
            customer={
                "name": "Asha",
                "email": "asha@example.com",
                "phone": "9123456789",
                "address1": "Main Road",
                "city": "Bengaluru",
                "state": "Karnataka",
                "pincode": "560001",
            },
            items=[{"id": "p-1", "quantity": 1}],
            payment_method="razorpay",
            checkout_token="abc123def456ghi789",
            loyalty_coins=25,
        )
        self.assertEqual(payload.loyalty_coins, 25)


class LoyaltyLifecycleTests(unittest.TestCase):
    def test_paid_order_tracks_loyalty_eligibility_and_pending_reward(self):
        async def run_case():
            fd, db_path = tempfile.mkstemp(suffix=".sqlite")
            import os
            os.close(fd)
            db = await aiosqlite.connect(db_path)
            db.row_factory = aiosqlite.Row
            await db.execute("PRAGMA foreign_keys=ON")
            await db.executescript(CREATE_TABLES_SQL)
            await db.execute("INSERT INTO users (id, name, email, password_hash, phone, role) VALUES (1, 'Asha', 'asha@example.com', 'hash', '9123456789', 'customer')")
            await db.execute("INSERT INTO items (id, slug, name) VALUES (1, 'ghee', 'Ghee')")
            await db.execute(
                "INSERT INTO variant (id, item_id, variant_name, slug, stock, legacy_product_id) VALUES (1, 1, '500ml', 'ghee-500', 10, 'legacy-ghee')"
            )
            await db.execute(
                "INSERT INTO products (id, slug, name, full_name, category, category_key, price, original_price, stock) VALUES ('legacy-ghee', 'ghee-500', 'Ghee', 'Ghee 500ml', 'Food', 'food', 899, 999, 10)"
            )
            await db.execute("INSERT INTO loyalty_wallets (customer_id, available_coins) VALUES (1, 250)")
            await db.execute(
                "INSERT INTO loyalty_transactions (customer_id, transaction_type, direction, coins, delta_available, delta_pending, delta_reserved, status, reference_id, source, description) VALUES (1, 'PURCHASE_EARN', 'CREDIT', 250, 250, 0, 0, 'AVAILABLE', 'LOT:INITIAL:1', 'system', 'Initial wallet balance')"
            )
            await db.execute(
                "INSERT INTO loyalty_lots (customer_id, earn_transaction_id, total_coins, pending_coins, available_coins, debt_offset_coins, available_at, expires_at) VALUES (1, 1, 250, 0, 250, 0, CURRENT_TIMESTAMP, NULL)"
            )
            order = await create_local_order(
                db,
                {"name": "Asha", "email": "asha@example.com", "phone": "9123456789", "address1": "Main Road", "city": "Bengaluru", "state": "Karnataka", "pincode": "560001"},
                [{"id": "legacy-ghee", "quantity": 2}],
                "razorpay",
                1,
                "checkouttoken12345",
                loyalty_coins=25,
            )
            self.assertGreater(int(order["loyalty_eligible_paise"]), 0)
            self.assertEqual(int(order["loyalty_coins_redeemed"]), 25)
            await mark_order_paid(db, int(order["id"]), "pay_test")
            async with db.execute("SELECT * FROM loyalty_wallets WHERE customer_id=1") as cur:
                wallet_row = await cur.fetchone()
            wallet = dict(wallet_row)
            self.assertGreater(int(wallet["pending_coins"]), 0)
            await db.close()
            import os
            os.unlink(db_path)

        asyncio.run(run_case())

    def test_delivered_order_schedules_loyalty_release(self):
        async def run_case():
            fd, db_path = tempfile.mkstemp(suffix=".sqlite")
            import os
            os.close(fd)
            db = await aiosqlite.connect(db_path)
            db.row_factory = aiosqlite.Row
            await db.execute("PRAGMA foreign_keys=ON")
            await db.executescript(CREATE_TABLES_SQL)
            await db.execute("INSERT INTO users (id, name, email, password_hash, phone, role) VALUES (1, 'Asha', 'asha@example.com', 'hash', '9123456789', 'customer')")
            await db.execute("INSERT INTO orders (id, user_id, order_number, status, payment_method, payment_status, shipment_status, subtotal, shipping, discount, total, currency, customer_name, email, phone, address1, city, state, pincode, checkout_token, loyalty_earn_status) VALUES (1, 1, 'GD-DELIVERED', 'processing', 'razorpay', 'paid', 'awaiting_fulfillment', 899, 0, 0, 899, 'INR', 'Asha', 'asha@example.com', '9123456789', 'Main Road', 'Bengaluru', 'Karnataka', '560001', 'deliveredtoken12345', 'PENDING')")
            await db.execute("INSERT INTO loyalty_wallets (customer_id, available_coins, pending_coins) VALUES (1, 0, 0)")
            await db.execute("INSERT INTO loyalty_transactions (customer_id, transaction_type, direction, coins, delta_available, delta_pending, delta_reserved, status, reference_id, source, description) VALUES (1, 'PURCHASE_EARN', 'CREDIT', 10, 0, 10, 0, 'PENDING', 'LOT:RELEASE:1', 'system', 'Pending reward')")
            await db.execute("INSERT INTO loyalty_lots (customer_id, earn_transaction_id, order_id, total_coins, pending_coins, available_coins, reserved_coins, debt_offset_coins, available_at, expires_at) VALUES (1, 1, 1, 10, 10, 0, 0, 0, NULL, NULL)")
            from app.commerce import update_order_status
            await update_order_status(db, 1, "delivered", "Delivered")
            async with db.execute("SELECT loyalty_release_at FROM orders WHERE id=1") as cur:
                row = await cur.fetchone()
            self.assertIsNotNone(row["loyalty_release_at"])
            await db.close()
            os.unlink(db_path)

        asyncio.run(run_case())

    def test_refunded_order_restores_redeemed_loyalty(self):
        async def run_case():
            fd, db_path = tempfile.mkstemp(suffix=".sqlite")
            import os
            os.close(fd)
            db = await aiosqlite.connect(db_path)
            db.row_factory = aiosqlite.Row
            await db.execute("PRAGMA foreign_keys=ON")
            await db.executescript(CREATE_TABLES_SQL)
            await db.execute("INSERT INTO users (id, name, email, password_hash, phone, role) VALUES (1, 'Asha', 'asha@example.com', 'hash', '9123456789', 'customer')")
            await db.execute("INSERT INTO orders (id, user_id, order_number, status, payment_method, payment_status, shipment_status, subtotal, shipping, discount, total, currency, customer_name, email, phone, address1, city, state, pincode, checkout_token, loyalty_coins_redeemed, loyalty_discount_paise) VALUES (1, 1, 'GD-REFUND', 'processing', 'razorpay', 'paid', 'awaiting_fulfillment', 899, 0, 0, 899, 'INR', 'Asha', 'asha@example.com', '9123456789', 'Main Road', 'Bengaluru', 'Karnataka', '560001', 'refundtoken123', 10, 10)")
            await db.execute("INSERT INTO loyalty_wallets (customer_id, available_coins, reserved_coins) VALUES (1, 20, 0)")
            await db.execute("INSERT INTO loyalty_reservations (id, customer_id, order_id, coins, status, reference_id, expires_at) VALUES (1, 1, 1, 10, 'REDEEMED', 'REFUND:RES:1', datetime('now','+1 day'))")
            await db.execute("INSERT INTO loyalty_transactions (customer_id, transaction_type, direction, coins, delta_available, delta_pending, delta_reserved, status, reference_id, source, description) VALUES (1, 'REDEMPTION', 'DEBIT', 10, 0, 0, -10, 'REDEEMED', 'TX:RED:1', 'system', 'Used coins')")
            from app.commerce import update_order_status
            await update_order_status(db, 1, "refunded", "Refunded")
            async with db.execute("SELECT available_coins, lifetime_reversed FROM loyalty_wallets WHERE customer_id=1") as cur:
                wallet = dict(await cur.fetchone())
            self.assertGreaterEqual(int(wallet["available_coins"]), 30)
            self.assertGreaterEqual(int(wallet["lifetime_reversed"]), 10)
            await db.close()
            os.unlink(db_path)

        asyncio.run(run_case())


if __name__ == "__main__":
    unittest.main()
