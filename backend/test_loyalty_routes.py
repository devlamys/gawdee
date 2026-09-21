import asyncio
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

import aiosqlite
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.commerce import create_local_order, mark_order_paid
from app.database import CREATE_TABLES_SQL
from app.main import app
from app.routers.account import db_dep, get_current_customer
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
            await db.execute("INSERT INTO loyalty_wallets (customer_id, available_coins, pending_coins, reserved_coins, lifetime_earned, lifetime_redeemed, lifetime_expired, lifetime_reversed) VALUES (1, 12, 0, 0, 12, 0, 0, 0)")
            await db.execute(
                "INSERT INTO loyalty_transactions (customer_id, transaction_type, direction, coins, delta_available, delta_pending, delta_reserved, status, reference_id, source, description, available_at, expires_at) VALUES (1, 'PURCHASE_EARN', 'CREDIT', 12, 12, 0, 0, 'AVAILABLE', 'LOT:EXPIRING:1', 'system', 'Expiring reward', datetime('now'), datetime('now', '+7 days'))"
            )
            await db.execute(
                "INSERT INTO loyalty_lots (customer_id, earn_transaction_id, total_coins, pending_coins, available_coins, reserved_coins, spent_coins, expired_coins, reversed_coins, debt_offset_coins, available_at, expires_at) VALUES (1, 1, 12, 0, 12, 0, 0, 0, 0, 0, datetime('now'), datetime('now', '+7 days'))"
            )
            from app.routers.account import loyalty_wallet
            response = await loyalty_wallet(customer={"id": 1}, db=db)
            self.assertEqual(response["wallet"]["available_coins"], 12)
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

    def test_quote_returns_validation_error_instead_of_server_error(self):
        with tempfile.TemporaryDirectory() as directory:
            db_path = f"{directory}/quote.sqlite"
            connection = sqlite3.connect(db_path)
            try:
                connection.executescript(CREATE_TABLES_SQL)
                connection.execute("INSERT INTO users (id,name,email,password_hash,role) VALUES (1,'Asha','asha@example.com','hash','customer')")
                connection.execute(
                    """INSERT INTO products (id,slug,name,full_name,category,category_key,price,
                    original_price,stock) VALUES ('p-1','ghee','Ghee','Ghee','Food','food',200,200,10)"""
                )
                connection.execute("INSERT INTO loyalty_wallets (customer_id,pending_coins) VALUES (1,2)")
                connection.commit()
            finally:
                connection.close()

            async def test_db():
                db = await aiosqlite.connect(db_path)
                db.row_factory = aiosqlite.Row
                try:
                    yield db
                finally:
                    await db.close()

            app.dependency_overrides[db_dep] = test_db
            app.dependency_overrides[get_current_customer] = lambda: {"id": 1}
            try:
                unavailable = self.client.post(
                    "/api/loyalty/calculate-redemption",
                    json={"items": [{"id": "p-1", "quantity": 1}], "requested_coins": 100},
                )
                self.assertEqual(unavailable.status_code, 422)
                self.assertIn("Pending coins cannot be redeemed", unavailable.json()["detail"]["message"])

                missing_product = self.client.post(
                    "/api/loyalty/calculate-redemption",
                    json={"items": [{"id": "missing", "quantity": 1}], "requested_coins": 0},
                )
                self.assertEqual(missing_product.status_code, 422)

                valid_quote = self.client.post(
                    "/api/loyalty/calculate-redemption",
                    json={"items": [{"id": "p-1", "quantity": 1}], "requested_coins": 0},
                )
                self.assertEqual(valid_quote.status_code, 200)
                self.assertEqual(valid_quote.json()["max_redeemable_coins"], 0)

                connection = sqlite3.connect(db_path)
                try:
                    connection.execute("UPDATE loyalty_wallets SET available_coins=300000 WHERE customer_id=1")
                    connection.commit()
                finally:
                    connection.close()
                wallet_response = self.client.get("/api/loyalty/wallet")
                self.assertEqual(wallet_response.status_code, 200)
                self.assertEqual(wallet_response.json()["wallet"]["available_coins"], 0)
                self.assertTrue(wallet_response.json()["wallet"]["balance_review"])
                unbacked = self.client.post(
                    "/api/loyalty/calculate-redemption",
                    json={"items": [{"id": "p-1", "quantity": 1}], "requested_coins": 500},
                )
                self.assertEqual(unbacked.status_code, 422)
            finally:
                app.dependency_overrides.pop(db_dep, None)
                app.dependency_overrides.pop(get_current_customer, None)

    def test_admin_report_flags_unbacked_balance_and_adjustment_refuses_it(self):
        async def run_case():
            with tempfile.TemporaryDirectory() as directory:
                db_path = f"{directory}/admin.sqlite"
                connection = sqlite3.connect(db_path)
                try:
                    connection.executescript(CREATE_TABLES_SQL)
                    connection.execute("INSERT INTO users (id,name,email,password_hash,role) VALUES (1,'Asha','asha@example.com','hash','customer')")
                    connection.execute("INSERT INTO loyalty_wallets (customer_id,available_coins) VALUES (1,300000)")
                    connection.commit()
                finally:
                    connection.close()

                async def test_get_db():
                    db = await aiosqlite.connect(db_path)
                    db.row_factory = aiosqlite.Row
                    return db

                from app.routers import admin as admin_router
                with patch.object(admin_router, "get_db", test_get_db):
                    report = await admin_router.admin_get_loyalty_reports(admin={"id": 7})
                    self.assertEqual(report["reports"]["available_coins"], 0)
                    self.assertEqual(report["reports"]["balance_mismatch_count"], 1)
                    with self.assertRaises(HTTPException) as failure:
                        await admin_router.admin_adjust_loyalty_wallet(
                            {"customer_id": 1, "coins": 100, "reason": "Testing credit", "reference_id": "ADMIN:UNBACKED:1"},
                            admin={"id": 7},
                        )
                    self.assertEqual(failure.exception.status_code, 409)

        asyncio.run(run_case())


class LoyaltyLifecycleTests(unittest.TestCase):
    def test_reconciliation_records_cache_repair_before_audited_credit(self):
        async def run_case():
            import os
            fd, db_path = tempfile.mkstemp(suffix=".sqlite")
            os.close(fd)
            db = await aiosqlite.connect(db_path)
            try:
                db.row_factory = aiosqlite.Row
                await db.execute("PRAGMA foreign_keys=ON")
                await db.executescript(CREATE_TABLES_SQL)
                await db.execute("INSERT INTO users (id,name,email,password_hash,role) VALUES (1,'Asha','asha@example.com','hash','customer')")
                await db.execute("INSERT INTO loyalty_wallets (customer_id,available_coins) VALUES (1,300000)")
                await db.commit()
                from app.loyalty import apply_admin_adjustment, reconcile_wallet_cache, spendable_balance
                await db.execute("BEGIN IMMEDIATE")
                self.assertTrue(await reconcile_wallet_cache(
                    db, 1, 300000, "RECONCILE:TEST:1", "Review of unbacked test wallet", 7,
                ))
                await db.commit()
                balance = await spendable_balance(db, 1)
                self.assertEqual(balance["wallet_coins"], 0)
                self.assertFalse(balance["balance_mismatch"])
                async with db.execute("SELECT metadata FROM loyalty_transactions WHERE reference_id='RECONCILE:TEST:1'") as cur:
                    self.assertIn('"wallet_before":300000', (await cur.fetchone())["metadata"])
                await db.commit()
                await db.execute("BEGIN IMMEDIATE")
                self.assertTrue(await apply_admin_adjustment(
                    db, 1, 300000, "ADMIN:TEST:RESTORE", "Approved local test credit", 7,
                ))
                await db.commit()
                balance = await spendable_balance(db, 1)
                self.assertEqual(balance["available_coins"], 300000)
                self.assertFalse(balance["balance_mismatch"])
            finally:
                await db.close()
                os.unlink(db_path)

        asyncio.run(run_case())

    def test_admin_adjustments_keep_ledger_wallet_and_lots_aligned(self):
        async def run_case():
            import os
            fd, db_path = tempfile.mkstemp(suffix=".sqlite")
            os.close(fd)
            db = await aiosqlite.connect(db_path)
            try:
                db.row_factory = aiosqlite.Row
                await db.execute("PRAGMA foreign_keys=ON")
                await db.executescript(CREATE_TABLES_SQL)
                await db.execute("INSERT INTO users (id,name,email,password_hash,role) VALUES (1,'Asha','asha@example.com','hash','customer')")
                await db.commit()
                from app.loyalty import apply_admin_adjustment, spendable_balance
                await db.execute("BEGIN IMMEDIATE")
                self.assertTrue(await apply_admin_adjustment(db, 1, 500, "ADMIN:TEST:CREDIT", "Testing credit", 7))
                await db.commit()
                self.assertFalse(await apply_admin_adjustment(db, 1, 500, "ADMIN:TEST:CREDIT", "Testing credit", 7))
                balance = await spendable_balance(db, 1)
                self.assertEqual(balance["available_coins"], 500)
                self.assertFalse(balance["balance_mismatch"])
                await db.commit()
                await db.execute("BEGIN IMMEDIATE")
                self.assertTrue(await apply_admin_adjustment(db, 1, -200, "ADMIN:TEST:DEBIT", "Testing debit", 7))
                await db.commit()
                balance = await spendable_balance(db, 1)
                self.assertEqual(balance["available_coins"], 300)
                self.assertFalse(balance["balance_mismatch"])
                async with db.execute("SELECT metadata FROM loyalty_transactions WHERE reference_id='ADMIN:TEST:CREDIT'") as cur:
                    self.assertIn('"admin_id":7', (await cur.fetchone())["metadata"])

                await db.execute("UPDATE loyalty_wallets SET available_coins=300000 WHERE customer_id=1")
                await db.commit()
                with self.assertRaisesRegex(ValueError, "Reconcile"):
                    await apply_admin_adjustment(db, 1, 100, "ADMIN:TEST:UNBACKED", "Unbacked credit", 7)
            finally:
                await db.close()
                os.unlink(db_path)

        asyncio.run(run_case())

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
                loyalty_coins=100,
            )
            self.assertGreater(int(order["loyalty_eligible_paise"]), 0)
            self.assertEqual(int(order["loyalty_coins_redeemed"]), 100)
            await mark_order_paid(db, int(order["id"]), "pay_test")
            async with db.execute("SELECT * FROM loyalty_wallets WHERE customer_id=1") as cur:
                wallet_row = await cur.fetchone()
            wallet = dict(wallet_row)
            self.assertGreater(int(wallet["pending_coins"]), 0)
            await db.close()
            import os
            os.unlink(db_path)

        asyncio.run(run_case())

    def test_cod_order_persists_exact_payable_paise_and_rejects_excess_coins(self):
        async def run_case():
            import os
            from app.integrations import order_payable_paise

            fd, db_path = tempfile.mkstemp(suffix=".sqlite")
            os.close(fd)
            db = await aiosqlite.connect(db_path)
            try:
                db.row_factory = aiosqlite.Row
                await db.execute("PRAGMA foreign_keys=ON")
                await db.executescript(CREATE_TABLES_SQL)
                await db.execute("INSERT INTO users (id,name,email,password_hash,role) VALUES (1,'Asha','asha@example.com','hash','customer')")
                await db.execute(
                    "INSERT INTO products (id,slug,name,full_name,category,category_key,price,original_price,stock) "
                    "VALUES ('honey','honey','Honey','Honey 250g','Food','food',350,350,10)"
                )
                await db.execute("INSERT INTO loyalty_wallets (customer_id,available_coins) VALUES (1,8000)")
                await db.execute(
                    "INSERT INTO loyalty_transactions (customer_id,transaction_type,direction,coins,delta_available,delta_pending,delta_reserved,status,reference_id,source,description) "
                    "VALUES (1,'ADMIN_CREDIT','CREDIT',8000,8000,0,0,'AVAILABLE','TEST:CREDIT:8000','admin','Test balance')"
                )
                await db.execute(
                    "INSERT INTO loyalty_lots (customer_id,earn_transaction_id,total_coins,pending_coins,available_coins,debt_offset_coins,available_at) "
                    "VALUES (1,1,8000,0,8000,0,CURRENT_TIMESTAMP)"
                )
                await db.commit()
                fields = {"name": "Asha", "email": "asha@example.com", "phone": "9123456789",
                          "address1": "Main Road", "city": "Bengaluru", "state": "Karnataka", "pincode": "560001"}
                with self.assertRaisesRegex(ValueError, "permitted redemption"):
                    await create_local_order(db, fields, [{"id": "honey", "quantity": 1}],
                                             "cod", 1, "checkouttoken_excess", loyalty_coins=7001)
                async with db.execute("SELECT COUNT(*) FROM orders") as cur:
                    self.assertEqual((await cur.fetchone())[0], 0)

                order = await create_local_order(db, fields, [{"id": "honey", "quantity": 1}],
                                                 "cod", 1, "checkouttoken_exact", loyalty_coins=7000)
                self.assertEqual(order["subtotal_paise"], 35000)
                self.assertEqual(order["shipping_paise"], 9900)
                self.assertEqual(order["loyalty_discount_paise"], 7000)
                self.assertEqual(order["total_paise"], 37900)
                self.assertEqual(order_payable_paise(order), 37900)
                async with db.execute("SELECT redeemed_coins_allocated FROM loyalty_order_lines WHERE order_id=?", (order["id"],)) as cur:
                    self.assertEqual((await cur.fetchone())[0], 7000)
                duplicate = await create_local_order(db, fields, [{"id": "honey", "quantity": 1}],
                                                     "cod", 1, "checkouttoken_exact", loyalty_coins=7000)
                self.assertTrue(duplicate["is_duplicate"])
                with self.assertRaisesRegex(ValueError, "different order"):
                    await create_local_order(db, fields, [{"id": "honey", "quantity": 1}],
                                             "cod", 1, "checkouttoken_exact", loyalty_coins=100)
                async with db.execute("SELECT available_coins,reserved_coins FROM loyalty_wallets WHERE customer_id=1") as cur:
                    wallet = await cur.fetchone()
                self.assertEqual((wallet["available_coins"], wallet["reserved_coins"]), (1000, 7000))
                fractional = await create_local_order(db, fields, [{"id": "honey", "quantity": 1}],
                                                      "cod", 1, "checkouttoken_fractional", loyalty_coins=150)
                self.assertEqual(fractional["total_paise"], 44750)
                self.assertEqual(fractional["total"], 447)  # Legacy display; paise snapshot is authoritative.
                self.assertEqual(order_payable_paise(fractional), 44750)
            finally:
                await db.close()
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

    def test_cod_delivered_order_creates_pending_loyalty_reward(self):
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
            await db.execute("INSERT INTO variant (id, item_id, variant_name, slug, stock, legacy_product_id) VALUES (1, 1, '500ml', 'ghee-500', 10, 'legacy-ghee')")
            await db.execute("INSERT INTO products (id, slug, name, full_name, category, category_key, price, original_price, stock) VALUES ('legacy-ghee', 'ghee-500', 'Ghee', 'Ghee 500ml', 'Food', 'food', 899, 999, 10)")
            order = await create_local_order(
                db,
                {"name": "Asha", "email": "asha@example.com", "phone": "9123456789", "address1": "Main Road", "city": "Bengaluru", "state": "Karnataka", "pincode": "560001"},
                [{"id": "legacy-ghee", "quantity": 2}],
                "cod",
                1,
                "codcheckouttoken1234",
            )
            from app.commerce import update_order_status
            await update_order_status(db, int(order["id"]), "delivered", "Delivered")
            async with db.execute("SELECT payment_status, loyalty_earn_status, loyalty_coins_earned FROM orders WHERE id=?", (order["id"],)) as cur:
                row = dict(await cur.fetchone())
            self.assertEqual(row["payment_status"], "paid")
            self.assertEqual(row["loyalty_earn_status"], "PENDING")
            self.assertGreater(int(row["loyalty_coins_earned"]), 0)
            await db.close()
            os.unlink(db_path)

        asyncio.run(run_case())

    def test_legacy_delivered_cod_repair_is_idempotent(self):
        async def run_case():
            import os
            fd, db_path = tempfile.mkstemp(suffix=".sqlite")
            os.close(fd)
            db = await aiosqlite.connect(db_path)
            try:
                db.row_factory = aiosqlite.Row
                await db.execute("PRAGMA foreign_keys=ON")
                await db.executescript(CREATE_TABLES_SQL)
                await db.execute("INSERT INTO users (id,name,email,password_hash,role) VALUES (1,'Asha','asha@example.com','hash','customer')")
                await db.execute(
                    """INSERT INTO orders (id,user_id,order_number,status,payment_method,payment_status,
                    shipment_status,subtotal,shipping,total,currency,customer_name,email,phone,address1,
                    city,state,pincode,checkout_token,loyalty_eligible_paise)
                    VALUES (1,1,'GD-COD-OLD','delivered','cod','cod_pending','delivered',180,99,279,
                    'INR','Asha','asha@example.com','9123456789','Main Road','Bengaluru','Karnataka',
                    '560001','legacycodtoken12345',18000)"""
                )
                await db.commit()
                from app.commerce import update_order_status
                await update_order_status(db, 1, "delivered", "COD collected")
                await update_order_status(db, 1, "delivered", "COD collected")
                async with db.execute("SELECT payment_status,loyalty_coins_earned,loyalty_earn_status,loyalty_release_at FROM orders WHERE id=1") as cur:
                    order = dict(await cur.fetchone())
                async with db.execute("SELECT pending_coins,lifetime_earned FROM loyalty_wallets WHERE customer_id=1") as cur:
                    wallet = dict(await cur.fetchone())
                async with db.execute("SELECT COUNT(*) AS n FROM loyalty_transactions WHERE order_id=1 AND transaction_type='PURCHASE_EARN'") as cur:
                    rewards = int((await cur.fetchone())["n"])
                self.assertEqual(order["payment_status"], "paid")
                self.assertEqual(order["loyalty_coins_earned"], 1)
                self.assertEqual(order["loyalty_earn_status"], "PENDING")
                self.assertIsNotNone(order["loyalty_release_at"])
                self.assertEqual(wallet, {"pending_coins": 1, "lifetime_earned": 1})
                self.assertEqual(rewards, 1)
            finally:
                await db.close()
                os.unlink(db_path)

        asyncio.run(run_case())

    def test_due_rewards_release_once(self):
        async def run_case():
            import os
            fd, db_path = tempfile.mkstemp(suffix=".sqlite")
            os.close(fd)
            db = await aiosqlite.connect(db_path)
            try:
                db.row_factory = aiosqlite.Row
                await db.execute("PRAGMA foreign_keys=ON")
                await db.executescript(CREATE_TABLES_SQL)
                await db.execute("INSERT INTO users (id,name,email,password_hash,role) VALUES (1,'Asha','asha@example.com','hash','customer')")
                await db.execute(
                    """INSERT INTO orders (id,user_id,order_number,status,payment_method,payment_status,
                    shipment_status,subtotal,total,currency,customer_name,email,phone,address1,city,
                    state,pincode,checkout_token,loyalty_earn_status)
                    VALUES (1,1,'GD-DUE','delivered','cod','paid','delivered',100,100,'INR',
                    'Asha','asha@example.com','9123456789','Main Road','Bengaluru','Karnataka',
                    '560001','duecodtoken1234567','PENDING')"""
                )
                await db.execute("INSERT INTO loyalty_wallets (customer_id,pending_coins,lifetime_earned) VALUES (1,1,1)")
                await db.execute(
                    """INSERT INTO loyalty_transactions (id,customer_id,transaction_type,direction,
                    coins,delta_available,delta_pending,delta_reserved,status,order_id,reference_id,source)
                    VALUES (1,1,'PURCHASE_EARN','CREDIT',1,0,1,0,'PENDING',1,
                    'PURCHASE_EARN:ORDER:1','system')"""
                )
                await db.execute(
                    """INSERT INTO loyalty_lots (customer_id,earn_transaction_id,order_id,total_coins,
                    pending_coins,available_at) VALUES (1,1,1,1,1,datetime('now','-1 minute'))"""
                )
                await db.commit()
                from app.loyalty_jobs import release_due_batch
                self.assertEqual(await release_due_batch(db), 1)
                self.assertEqual(await release_due_batch(db), 0)
                async with db.execute("SELECT available_coins,pending_coins FROM loyalty_wallets WHERE customer_id=1") as cur:
                    wallet = dict(await cur.fetchone())
                self.assertEqual(wallet, {"available_coins": 1, "pending_coins": 0})
                async with db.execute("SELECT COUNT(*) AS n FROM loyalty_transactions WHERE transaction_type='EARN_RELEASE' AND order_id=1") as cur:
                    self.assertEqual(int((await cur.fetchone())["n"]), 1)
            finally:
                await db.close()
                os.unlink(db_path)

        asyncio.run(run_case())


if __name__ == "__main__":
    unittest.main()
