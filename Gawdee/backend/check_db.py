import asyncio
import aiosqlite

async def f():
    async with aiosqlite.connect('storage/gawdee.sqlite') as db:
        async with db.execute('PRAGMA table_info(products)') as cur:
            rows = await cur.fetchall()
            for r in rows:
                print(r)

asyncio.run(f())
