"""Retry-safe loyalty maintenance run by the API process.

SQLite's immediate write transaction serializes workers sharing the same database.
The release service also uses unique ledger references, so restarting a worker
cannot release the same earning lot twice.
"""

import asyncio
import logging

import aiosqlite

from .database import get_db
from .loyalty import release_due_rewards


logger = logging.getLogger(__name__)
RELEASE_BATCH_SIZE = 100
RELEASE_POLL_SECONDS = 300


async def release_due_batch(db: aiosqlite.Connection) -> int:
    await db.execute("BEGIN IMMEDIATE")
    try:
        count = await release_due_rewards(db, RELEASE_BATCH_SIZE)
        await db.commit()
        return count
    except Exception:
        await db.rollback()
        raise


async def loyalty_release_worker() -> None:
    while True:
        try:
            while True:
                db = await get_db()
                try:
                    released = await release_due_batch(db)
                finally:
                    await db.close()
                if released < RELEASE_BATCH_SIZE:
                    break
                await asyncio.sleep(0)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Loyalty reward release failed; retrying")
        await asyncio.sleep(RELEASE_POLL_SECONDS)
