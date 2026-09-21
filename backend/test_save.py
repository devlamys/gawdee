import asyncio
from app.database import get_db, save_item_with_variants

payload = {
    "name": "Test Item",
    "slug": "test-item",
    "rich_image_sections": [{"landscape": "foo", "portrait_1": "bar", "portrait_2": "baz"}],
    "variants": [
        {"id": 1, "variant_name": "Standard", "sku": "123", "mrp": 100, "selling_price": 50, "stock_quantity": 10}
    ]
}

async def main():
    db = await get_db()
    try:
        new_id = await save_item_with_variants(db, payload, payload["variants"], 2)
        print("Success:", new_id)
    except Exception as e:
        import traceback
        traceback.print_exc()
    finally:
        await db.close()

asyncio.run(main())
