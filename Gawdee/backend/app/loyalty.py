"""Loyalty accounting. All monetary inputs and outputs in this module are integer paise.

Call mutating functions within a short SQLite BEGIN IMMEDIATE transaction. The immutable
ledger is authoritative; wallet and lot rows are transactionally maintained read models.
"""

import calendar
import json
from datetime import datetime, timedelta, timezone
from typing import Optional

import aiosqlite

from .database import get_setting


COIN_EARN_BLOCK_PAISE = 10_000
PAISE_PER_COIN = 1

SETTING_DEFAULTS = {
    "enabled": 1,
    "release_delay_days": 7,
    "min_redemption_coins": 100,
    "max_redemption_coins": 100_000,
    "max_redemption_percent": 20,
    "min_cart_paise": 0,
    "expiry_months": 0,
    "expiry_reminder_days": 30,
    "max_earn_per_order": 100_000,
    "referral_bonus_coins": 0,
    "first_order_bonus_coins": 0,
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def sql_time(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=timezone.utc)


def add_months(value: datetime, months: int) -> datetime:
    index = (value.month - 1) + months
    year = value.year + index // 12
    month = index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


async def one(db: aiosqlite.Connection, sql: str, params: tuple = ()) -> Optional[dict]:
    async with db.execute(sql, params) as cur:
        row = await cur.fetchone()
    return dict(row) if row else None


async def all_rows(db: aiosqlite.Connection, sql: str, params: tuple = ()) -> list[dict]:
    async with db.execute(sql, params) as cur:
        return [dict(row) for row in await cur.fetchall()]


async def loyalty_settings(db: aiosqlite.Connection) -> dict[str, int]:
    result = {}
    limits = {
        "enabled": (0, 1),
        "release_delay_days": (0, 365),
        "min_redemption_coins": (0, 1_000_000_000),
        "max_redemption_coins": (0, 1_000_000_000),
        "max_redemption_percent": (0, 100),
        "min_cart_paise": (0, 1_000_000_000_000),
        "expiry_months": (0, 120),
        "expiry_reminder_days": (0, 365),
        "max_earn_per_order": (0, 1_000_000_000),
        "referral_bonus_coins": (0, 1_000_000),
        "first_order_bonus_coins": (0, 1_000_000),
    }
    for name, default in SETTING_DEFAULTS.items():
        raw = await get_setting(db, f"loyalty_{name}", str(default))
        try:
            value = int(raw)
        except (TypeError, ValueError):
            value = default
        low, high = limits[name]
        result[name] = min(high, max(low, value))
    return result


async def ensure_wallet(db: aiosqlite.Connection, customer_id: int) -> dict:
    await db.execute("INSERT OR IGNORE INTO loyalty_wallets(customer_id) VALUES (?)", (customer_id,))
    wallet = await one(db, "SELECT * FROM loyalty_wallets WHERE customer_id=?", (customer_id,))
    if wallet is None:
        raise ValueError("Customer wallet could not be created.")
    return wallet


async def spendable_balance(db: aiosqlite.Connection, customer_id: int, wallet: Optional[dict] = None) -> dict:
    """Compare the wallet cache with immutable ledger and unexpired earning lots."""
    wallet = wallet or await ensure_wallet(db, customer_id)
    ledger = await one(
        db,
        "SELECT COALESCE(SUM(delta_available),0) AS coins FROM loyalty_transactions WHERE customer_id=?",
        (customer_id,),
    )
    lots = await one(
        db,
        """SELECT COALESCE(SUM(available_coins),0) AS coins FROM loyalty_lots
        WHERE customer_id=? AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)""",
        (customer_id,),
    )
    wallet_coins = int(wallet["available_coins"])
    ledger_coins = int(ledger["coins"])
    lot_coins = int(lots["coins"])
    return {
        "available_coins": max(0, min(wallet_coins, ledger_coins, lot_coins)),
        "wallet_coins": wallet_coins,
        "ledger_coins": ledger_coins,
        "lot_coins": lot_coins,
        "balance_mismatch": wallet_coins != ledger_coins or max(0, ledger_coins) != lot_coins,
    }


async def append_transaction(
    db: aiosqlite.Connection, customer_id: int, transaction_type: str, coins: int,
    delta_available: int, delta_pending: int, delta_reserved: int,
    reference_id: str, status: str, *, order_id: Optional[int] = None,
    order_item_id: Optional[int] = None, source: str = "system", description: str = "",
    available_at: Optional[str] = None, expires_at: Optional[str] = None,
    metadata: Optional[dict] = None, allow_negative: bool = False,
) -> Optional[int]:
    """Append exactly once and update wallet in the same caller transaction."""
    if not isinstance(coins, int) or coins <= 0 or not reference_id or len(reference_id) > 255:
        raise ValueError("Invalid loyalty transaction.")
    await ensure_wallet(db, customer_id)
    delta_total = delta_available + delta_pending + delta_reserved
    direction = "CREDIT" if delta_total > 0 else ("DEBIT" if delta_total < 0 else "TRANSFER")
    async with db.execute(
        """INSERT OR IGNORE INTO loyalty_transactions
        (customer_id,transaction_type,direction,coins,delta_available,delta_pending,delta_reserved,
         status,order_id,order_item_id,reference_id,source,description,available_at,expires_at,metadata)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (customer_id, transaction_type, direction, coins, delta_available, delta_pending,
         delta_reserved, status, order_id, order_item_id, reference_id, source,
         description[:500], available_at, expires_at, json.dumps(metadata or {}, separators=(",", ":"))),
    ) as cur:
        if cur.rowcount != 1:
            return None
        transaction_id = cur.lastrowid
    earned = coins if transaction_type in ("PURCHASE_EARN", "FIRST_ORDER_BONUS", "SIGNUP_BONUS", "REFERRAL_REWARD", "REVIEW_REWARD", "BIRTHDAY_REWARD", "PROMOTIONAL_REWARD", "ADMIN_CREDIT") else 0
    redeemed = coins if transaction_type == "REDEMPTION" else 0
    expired = coins if transaction_type == "EXPIRY" else 0
    reversed_coins = coins if transaction_type in ("REFUND_REVERSAL", "CANCELLATION_REVERSAL", "ADMIN_DEBIT") else 0
    async with db.execute(
        """UPDATE loyalty_wallets SET available_coins=available_coins+?,
        pending_coins=pending_coins+?, reserved_coins=reserved_coins+?,
        lifetime_earned=lifetime_earned+?, lifetime_redeemed=lifetime_redeemed+?,
        lifetime_expired=lifetime_expired+?, lifetime_reversed=lifetime_reversed+?,
        updated_at=CURRENT_TIMESTAMP
        WHERE customer_id=? AND pending_coins+?>=0 AND reserved_coins+?>=0
          AND (?=1 OR available_coins+?>=0)""",
        (delta_available, delta_pending, delta_reserved, earned, redeemed, expired,
         reversed_coins, customer_id, delta_pending, delta_reserved, int(allow_negative), delta_available),
    ) as cur:
        if cur.rowcount != 1:
            raise ValueError("Insufficient loyalty balance or invalid state.")
    return int(transaction_id)


def allocate_discount(gross_paise: list[int], discount_paise: int) -> list[int]:
    """Allocate a whole-paise discount by largest remainder; sum stays exact."""
    gross_total = sum(gross_paise)
    if gross_total <= 0 or discount_paise <= 0:
        return [0] * len(gross_paise)
    discount_paise = min(discount_paise, gross_total)
    base = [discount_paise * value // gross_total for value in gross_paise]
    remainder = discount_paise - sum(base)
    ranked = sorted(range(len(base)), key=lambda i: (-(discount_paise * gross_paise[i] % gross_total), i))
    for i in ranked[:remainder]:
        base[i] += 1
    return base


async def price_loyalty_lines(db: aiosqlite.Connection, pricing: dict) -> dict:
    """Snapshot eligibility from server-priced products and allocated coupon discount."""
    gross = [int(line["product"]["price"]) * 100 * int(line["quantity"]) for line in pricing["items"]]
    discounts = allocate_discount(gross, int(pricing["discount"]) * 100)
    result = []
    for i, line in enumerate(pricing["items"]):
        product = line["product"]
        pid = str(product.get("variant_id") or product["id"])
        category = str(product.get("category_key") or "").lower()
        product_rule = await one(db, "SELECT * FROM loyalty_product_rules WHERE product_id=?", (pid,))
        category_rule = await one(db, "SELECT * FROM loyalty_category_rules WHERE category_key=?", (category,))
        gift_card = category in ("gift-card", "gift-cards", "gift_card", "gift_cards")
        earn_excluded = gift_card or bool((product_rule or {}).get("earn_excluded")) or bool((category_rule or {}).get("earn_excluded"))
        redeem_excluded = gift_card or bool((product_rule or {}).get("redeem_excluded")) or bool((category_rule or {}).get("redeem_excluded"))
        multiplier = max(int((product_rule or {}).get("multiplier") or 1), int((category_rule or {}).get("multiplier") or 1))
        net_paise = max(0, gross[i] - discounts[i])
        purchase_plan = str(line.get("purchase_plan") or "one_time")
        pack_bonus_coins = 0
        if not earn_excluded and net_paise > 0 and product.get("variant_id") and 1 <= int(line["quantity"]) <= 3:
            pack_rule = await one(
                db,
                "SELECT bonus_coins FROM loyalty_pack_bonuses WHERE variant_id=? AND pack_quantity=? AND purchase_plan=?",
                (int(product["variant_id"]), int(line["quantity"]), purchase_plan),
            )
            pack_bonus_coins = int(pack_rule["bonus_coins"]) if pack_rule else 0
        result.append({
            "product_id": pid, "quantity": int(line["quantity"]), "gross_paise": gross[i],
            "coupon_discount_paise": discounts[i],
            "eligible_paise": 0 if earn_excluded else net_paise,
            "redeemable_paise": 0 if redeem_excluded else net_paise,
            "earn_excluded": int(earn_excluded), "redeem_excluded": int(redeem_excluded),
            "multiplier": min(20, multiplier),
            "pack_bonus_coins": pack_bonus_coins, "purchase_plan": purchase_plan,
        })
    return {
        "lines": result,
        "eligible_paise": sum(line["eligible_paise"] for line in result),
        "redeemable_paise": sum(line["redeemable_paise"] for line in result),
    }


def earned_coins(eligible_paise: int) -> int:
    if not isinstance(eligible_paise, int) or eligible_paise < 0:
        raise ValueError("Eligible amount must be nonnegative integer paise.")
    return eligible_paise // COIN_EARN_BLOCK_PAISE


async def redemption_quote(
    db: aiosqlite.Connection, customer_id: int, pricing: dict,
    requested_coins: int = 0, line_pricing: Optional[dict] = None,
) -> dict:
    if not isinstance(requested_coins, int) or requested_coins < 0:
        raise ValueError("Coin amount must be a nonnegative integer.")
    config = await loyalty_settings(db)
    lines = line_pricing or await price_loyalty_lines(db, pricing)
    balance = await spendable_balance(db, customer_id)
    available = balance["available_coins"]
    eligible = int(lines["redeemable_paise"])
    max_coins = 0
    if config["enabled"] and eligible >= config["min_cart_paise"]:
        max_coins = min(
            available, config["max_redemption_coins"],
            eligible * config["max_redemption_percent"] // 100,
            int(pricing["total"]) * 100,
        )
        if max_coins < config["min_redemption_coins"]:
            max_coins = 0
    if requested_coins > available:
        raise ValueError(f"Only {available} coins are available. Pending coins cannot be redeemed yet.")
    if requested_coins and requested_coins < config["min_redemption_coins"]:
        raise ValueError(f"At least {config['min_redemption_coins']} available coins are required to redeem.")
    if requested_coins > max_coins:
        raise ValueError("Requested coins exceed the permitted redemption amount for this cart.")
    return {
        "eligible_paise": eligible,
        "available_coins": available,
        "max_redeemable_coins": max_coins,
        "requested_coins": requested_coins,
        "discount_paise": requested_coins * PAISE_PER_COIN,
        "lines": lines["lines"],
    }


async def create_earning_lot(
    db: aiosqlite.Connection, customer_id: int, coins: int, transaction_type: str,
    reference_id: str, *, order_id: Optional[int] = None, description: str = "",
    pending: bool = True, source: str = "system", metadata: Optional[dict] = None,
) -> bool:
    if coins <= 0:
        return False
    wallet = await ensure_wallet(db, customer_id)
    debt_offset = 0 if pending else min(coins, max(0, -int(wallet["available_coins"])))
    tid = await append_transaction(
        db, customer_id, transaction_type, coins,
        0 if pending else coins, coins if pending else 0, 0,
        reference_id, "PENDING" if pending else "AVAILABLE",
        order_id=order_id, source=source, description=description,
        metadata=metadata, allow_negative=True,
    )
    if tid is None:
        return False
    config = await loyalty_settings(db)
    expires_at = sql_time(add_months(utc_now(), config["expiry_months"])) if not pending and config["expiry_months"] else None
    await db.execute(
        """INSERT INTO loyalty_lots
        (customer_id,earn_transaction_id,order_id,total_coins,pending_coins,available_coins,
         debt_offset_coins,available_at,expires_at)
        VALUES (?,?,?,?,?,?,?,?,?)""",
        (customer_id, tid, order_id, coins, coins if pending else 0,
         0 if pending else coins - debt_offset, debt_offset,
         None if pending else sql_time(utc_now()), expires_at),
    )
    return True


async def apply_admin_adjustment(
    db: aiosqlite.Connection, customer_id: int, signed_coins: int,
    reference_id: str, reason: str, admin_id: int,
) -> bool:
    """Apply an audited admin adjustment and keep FEFO lots in sync."""
    if not signed_coins:
        raise ValueError("Adjustment must contain a nonzero whole coin amount.")
    transaction_type = "ADMIN_CREDIT" if signed_coins > 0 else "ADMIN_DEBIT"
    existing = await one(db, "SELECT customer_id,transaction_type,coins,source FROM loyalty_transactions WHERE reference_id=?", (reference_id,))
    if existing:
        if (int(existing["customer_id"]) != customer_id or existing["transaction_type"] != transaction_type
                or int(existing["coins"]) != abs(signed_coins) or existing["source"] != "admin"):
            raise ValueError("This adjustment reference was already used for a different transaction.")
        return False

    balance = await spendable_balance(db, customer_id)
    if balance["balance_mismatch"]:
        raise ValueError("Wallet, ledger, and coin batches disagree. Reconcile the wallet before adjusting coins.")
    metadata = {"admin_id": admin_id}
    if signed_coins > 0:
        return await create_earning_lot(
            db, customer_id, signed_coins, transaction_type, reference_id,
            description=reason, pending=False, source="admin", metadata=metadata,
        )

    coins = -signed_coins
    transaction_id = await append_transaction(
        db, customer_id, transaction_type, coins, -coins, 0, 0,
        reference_id, "AVAILABLE", source="admin", description=reason,
        metadata=metadata, allow_negative=True,
    )
    if transaction_id is None:
        return False
    remaining = min(coins, max(0, balance["wallet_coins"]))
    lots = await all_rows(
        db, """SELECT id,available_coins FROM loyalty_lots WHERE customer_id=? AND available_coins>0
        ORDER BY (expires_at IS NULL),expires_at,id""",
        (customer_id,),
    )
    for lot in lots:
        used = min(remaining, int(lot["available_coins"]))
        if used:
            await db.execute(
                """UPDATE loyalty_lots SET available_coins=available_coins-?,
                reversed_coins=reversed_coins+?,updated_at=CURRENT_TIMESTAMP WHERE id=?""",
                (used, used, lot["id"]),
            )
            remaining -= used
        if remaining == 0:
            break
    if remaining:
        raise ValueError("Coin batches are insufficient for the admin debit.")
    return True


async def reconcile_wallet_cache(
    db: aiosqlite.Connection, customer_id: int, expected_wallet_coins: int,
    reference_id: str, reason: str, actor_id: int,
) -> bool:
    """Repair a wallet cache from the ledger with an immutable audit entry.

    Call under BEGIN IMMEDIATE after an operator has reviewed the mismatch. Coin
    batches must already agree with the ledger; this never invents a credit.
    """
    balance = await spendable_balance(db, customer_id)
    if balance["wallet_coins"] != expected_wallet_coins:
        raise ValueError("Wallet balance changed since reconciliation was reviewed.")
    if max(0, balance["ledger_coins"]) != balance["lot_coins"]:
        raise ValueError("Ledger and coin batches disagree; manual investigation is required.")
    if balance["wallet_coins"] == balance["ledger_coins"]:
        return False
    if not reason.strip() or actor_id <= 0:
        raise ValueError("A reconciliation reason and actor ID are required.")
    difference = abs(balance["wallet_coins"] - balance["ledger_coins"])
    transaction_id = await append_transaction(
        db, customer_id, "RECONCILIATION", difference, 0, 0, 0,
        reference_id, "AVAILABLE", source="admin", description=reason,
        metadata={
            "actor_id": actor_id,
            "wallet_before": balance["wallet_coins"],
            "ledger_balance": balance["ledger_coins"],
            "lot_balance": balance["lot_coins"],
        }, allow_negative=True,
    )
    if transaction_id is None:
        raise ValueError("Reconciliation reference has already been used.")
    async with db.execute(
        """UPDATE loyalty_wallets SET available_coins=?,updated_at=CURRENT_TIMESTAMP
        WHERE customer_id=? AND available_coins=?""",
        (balance["ledger_coins"], customer_id, expected_wallet_coins),
    ) as cur:
        if cur.rowcount != 1:
            raise ValueError("Wallet balance changed during reconciliation.")
    return True


async def create_pending_purchase_reward(db: aiosqlite.Connection, order_id: int) -> int:
    order = await one(db, "SELECT * FROM orders WHERE id=?", (order_id,))
    if not order or not order["user_id"] or order["payment_status"] != "paid" or order["status"] in ("cancelled", "refunded"):
        return 0
    config = await loyalty_settings(db)
    if not config["enabled"]:
        return 0
    customer_id = int(order["user_id"])
    base = min(config["max_earn_per_order"], earned_coins(int(order["loyalty_eligible_paise"])))
    if base and await create_earning_lot(
        db, customer_id, base, "PURCHASE_EARN", f"PURCHASE_EARN:ORDER:{order_id}",
        order_id=order_id, description=f"Reward from order {order['order_number']}",
    ):
        await db.execute(
            "UPDATE orders SET loyalty_coins_earned=loyalty_coins_earned+?, loyalty_earn_status='PENDING' WHERE id=?",
            (base, order_id),
        )
    else:
        base = 0

    lines = await all_rows(db, "SELECT eligible_paise,multiplier,pack_bonus_coins FROM loyalty_order_lines WHERE order_id=?", (order_id,))
    bonus = sum(
        earned_coins(int(line["eligible_paise"])) * (int(line["multiplier"]) - 1)
        + int(line["pack_bonus_coins"])
        for line in lines
    )
    now = sql_time(utc_now())
    campaigns = await all_rows(
        db, "SELECT * FROM loyalty_promotions WHERE active=1 AND starts_at<=? AND ends_at>? AND kind='MULTIPLIER'",
        (now, now),
    )
    for campaign in campaigns:
        if int(order["loyalty_eligible_paise"]) >= int(campaign["minimum_eligible_paise"]):
            bonus += base * max(0, int(campaign["multiplier"]) - 1)
    bonus = min(bonus, max(0, config["max_earn_per_order"] - base))
    if bonus and await create_earning_lot(
        db, customer_id, bonus, "PROMOTIONAL_REWARD", f"PROMOTION:ORDER:{order_id}",
        order_id=order_id, description=f"Promotional coins from order {order['order_number']}",
    ):
        await db.execute("UPDATE orders SET loyalty_coins_earned=loyalty_coins_earned+? WHERE id=?", (bonus, order_id))
    else:
        bonus = 0

    if config["first_order_bonus_coins"]:
        previous = await one(
            db, "SELECT COUNT(*) AS n FROM orders WHERE user_id=? AND id<>? AND payment_status='paid'",
            (customer_id, order_id),
        )
        if not previous["n"]:
            first_bonus = config["first_order_bonus_coins"]
            if await create_earning_lot(
                db, customer_id, first_bonus, "FIRST_ORDER_BONUS", f"FIRST_ORDER_BONUS:CUSTOMER:{customer_id}",
                order_id=order_id, description="First qualifying order bonus",
            ):
                await db.execute("UPDATE orders SET loyalty_coins_earned=loyalty_coins_earned+? WHERE id=?", (first_bonus, order_id))
                bonus += first_bonus
    return base + bonus


async def schedule_order_release(db: aiosqlite.Connection, order_id: int) -> None:
    order = await one(db, "SELECT status,payment_status,fulfilled_at FROM orders WHERE id=?", (order_id,))
    if not order or order["status"] != "delivered" or order["payment_status"] != "paid":
        return
    config = await loyalty_settings(db)
    delivered_at = parse_time(order["fulfilled_at"]) if order["fulfilled_at"] else utc_now()
    release_at = sql_time(delivered_at + timedelta(days=config["release_delay_days"]))
    await db.execute("UPDATE loyalty_lots SET available_at=?, updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND pending_coins>0 AND available_at IS NULL", (release_at, order_id))
    await db.execute("UPDATE orders SET loyalty_release_at=? WHERE id=? AND loyalty_earn_status='PENDING'", (release_at, order_id))


async def release_due_rewards(db: aiosqlite.Connection, limit: int = 100) -> int:
    lots = await all_rows(
        db, """SELECT l.*, o.order_number FROM loyalty_lots l JOIN orders o ON o.id=l.order_id
        WHERE l.pending_coins>0 AND l.available_at<=CURRENT_TIMESTAMP AND o.status='delivered'
          AND o.payment_status='paid' ORDER BY l.available_at,l.id LIMIT ?""",
        (min(500, max(1, limit)),),
    )
    released = 0
    config = await loyalty_settings(db)
    for lot in lots:
        coins = int(lot["pending_coins"])
        wallet = await ensure_wallet(db, int(lot["customer_id"]))
        debt_offset = min(coins, max(0, -int(wallet["available_coins"])))
        expiry = sql_time(add_months(utc_now(), config["expiry_months"])) if config["expiry_months"] else None
        tid = await append_transaction(
            db, int(lot["customer_id"]), "EARN_RELEASE", coins, coins, -coins, 0,
            f"EARN_RELEASE:LOT:{lot['id']}", "AVAILABLE", order_id=int(lot["order_id"]),
            description=f"Coins from order {lot['order_number']} are available", expires_at=expiry,
            allow_negative=True,
        )
        if tid is None:
            continue
        await db.execute(
            """UPDATE loyalty_lots SET pending_coins=0, available_coins=available_coins+?,
            debt_offset_coins=debt_offset_coins+?, expires_at=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=? AND pending_coins=?""",
            (coins - debt_offset, debt_offset, expiry, lot["id"], coins),
        )
        await db.execute("UPDATE orders SET loyalty_earn_status='AVAILABLE' WHERE id=?", (lot["order_id"],))
        released += 1
    return released


async def reserve_coins(
    db: aiosqlite.Connection, customer_id: int, order_id: int, coins: int,
    checkout_token: str, payment_method: str,
) -> None:
    if coins <= 0:
        return
    existing = await one(db, "SELECT * FROM loyalty_reservations WHERE order_id=?", (order_id,))
    if existing:
        if int(existing["coins"]) != coins or int(existing["customer_id"]) != customer_id:
            raise ValueError("Checkout loyalty reservation does not match this order.")
        return
    balance = await spendable_balance(db, customer_id)
    if balance["available_coins"] < coins:
        raise ValueError("There are not enough available coins.")
    lots = await all_rows(
        db, """SELECT * FROM loyalty_lots WHERE customer_id=? AND available_coins>0
        AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)
        ORDER BY (expires_at IS NULL),expires_at,id""",
        (customer_id,),
    )
    if sum(int(lot["available_coins"]) for lot in lots) < coins:
        raise ValueError("There are not enough unexpired coins.")
    expires = utc_now() + timedelta(days=365 if payment_method == "cod" else 1)
    async with db.execute(
        """INSERT INTO loyalty_reservations(customer_id,order_id,coins,status,reference_id,expires_at)
        VALUES (?,?,?,'RESERVED',?,?)""",
        (customer_id, order_id, coins, f"RESERVATION:CHECKOUT:{checkout_token}", sql_time(expires)),
    ) as cur:
        reservation_id = int(cur.lastrowid)
    await append_transaction(
        db, customer_id, "REDEMPTION_RESERVE", coins, -coins, 0, coins,
        f"REDEMPTION_RESERVE:ORDER:{order_id}", "RESERVED", order_id=order_id,
        description="Coins reserved for checkout",
    )
    remaining = coins
    for lot in lots:
        used = min(remaining, int(lot["available_coins"]))
        if not used:
            continue
        await db.execute(
            "UPDATE loyalty_lots SET available_coins=available_coins-?, reserved_coins=reserved_coins+?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (used, used, lot["id"]),
        )
        await db.execute(
            "INSERT INTO loyalty_allocations(reservation_id,lot_id,coins) VALUES (?,?,?)",
            (reservation_id, lot["id"], used),
        )
        remaining -= used
        if remaining == 0:
            break


async def release_reservation(db: aiosqlite.Connection, order_id: int, reason: str) -> bool:
    reservation = await one(db, "SELECT * FROM loyalty_reservations WHERE order_id=?", (order_id,))
    if not reservation or reservation["status"] != "RESERVED":
        return False
    coins = int(reservation["coins"])
    await append_transaction(
        db, int(reservation["customer_id"]), "REDEMPTION_RESTORE", coins, coins, 0, -coins,
        f"RESERVATION_RELEASE:ORDER:{order_id}", "AVAILABLE", order_id=order_id,
        description=reason,
    )
    allocations = await all_rows(db, "SELECT * FROM loyalty_allocations WHERE reservation_id=?", (reservation["id"],))
    for allocation in allocations:
        await db.execute(
            "UPDATE loyalty_lots SET reserved_coins=reserved_coins-?, available_coins=available_coins+?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (allocation["coins"], allocation["coins"], allocation["lot_id"]),
        )
    await db.execute("UPDATE loyalty_reservations SET status='RELEASED', updated_at=CURRENT_TIMESTAMP WHERE id=?", (reservation["id"],))
    return True


async def redeem_reservation(db: aiosqlite.Connection, order_id: int) -> bool:
    reservation = await one(db, "SELECT * FROM loyalty_reservations WHERE order_id=?", (order_id,))
    if not reservation or reservation["status"] == "REDEEMED":
        return False
    if reservation["status"] != "RESERVED":
        raise ValueError("The loyalty reservation was released; this payment needs manual review.")
    coins = int(reservation["coins"])
    await append_transaction(
        db, int(reservation["customer_id"]), "REDEMPTION", coins, 0, 0, -coins,
        f"REDEMPTION_COMMIT:ORDER:{order_id}", "REDEEMED", order_id=order_id,
        description="Coins used for a paid order",
    )
    allocations = await all_rows(db, "SELECT * FROM loyalty_allocations WHERE reservation_id=?", (reservation["id"],))
    for allocation in allocations:
        await db.execute(
            "UPDATE loyalty_lots SET reserved_coins=reserved_coins-?, spent_coins=spent_coins+?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (allocation["coins"], allocation["coins"], allocation["lot_id"]),
        )
    await db.execute("UPDATE loyalty_reservations SET status='REDEEMED', updated_at=CURRENT_TIMESTAMP WHERE id=?", (reservation["id"],))
    return True
