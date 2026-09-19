import re

with open("backend/app/database.py", "r") as f:
    content = f.read()

# 1. Add schema version V5
content = content.replace("DOMAIN_SCHEMA_VERSION_V4 = 4", "DOMAIN_SCHEMA_VERSION_V4 = 4\nDOMAIN_SCHEMA_VERSION_V5 = 5")

# 2. Add column to CREATE TABLE items
create_table_items_old = """    rating REAL NOT NULL DEFAULT 0,
    review_count INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);"""
create_table_items_new = """    rating REAL NOT NULL DEFAULT 0,
    review_count INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    rich_image_sections TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);"""
content = content.replace(create_table_items_old, create_table_items_new)

# 3. Add migration function V5
mig_v5 = """
async def migrate_domain_v5(db: aiosqlite.Connection) -> None:
    async with db.execute("PRAGMA user_version") as cur:
        row = await cur.fetchone()
    if row and int(row[0]) >= DOMAIN_SCHEMA_VERSION_V5:
        return

    if await _table_exists(db, "items") and not await _column_exists(db, "items", "rich_image_sections"):
        await db.execute("ALTER TABLE items ADD COLUMN rich_image_sections TEXT NOT NULL DEFAULT '[]'")

    await db.execute(f"PRAGMA user_version = {DOMAIN_SCHEMA_VERSION_V5}")
    await db.commit()
"""
content = content.replace("async def migrate(db: aiosqlite.Connection) -> None:", mig_v5 + "\n\nasync def migrate(db: aiosqlite.Connection) -> None:")
content = content.replace("await migrate_domain_v4(db)", "await migrate_domain_v4(db)\n    await migrate_domain_v5(db)")

# 4. update validate_item_fields
val_old = """    is_active = fields.get("is_active")
    if is_active is None or str(is_active).strip().lower() in ["1", "true", "yes"]:"""
val_new = """    rich_image_sections = fields.get("rich_image_sections")
    if not isinstance(rich_image_sections, str):
        import json
        try:
            rich_image_sections = json.dumps(rich_image_sections or [])
        except Exception:
            rich_image_sections = '[]'
            
    is_active = fields.get("is_active")
    if is_active is None or str(is_active).strip().lower() in ["1", "true", "yes"]:"""
content = content.replace(val_old, val_new)

return_val_old = """        "is_active": is_active,
    }"""
return_val_new = """        "rich_image_sections": rich_image_sections,
        "is_active": is_active,
    }"""
content = content.replace(return_val_old, return_val_new)

# 5. create_item
create_old = """    await db.execute(
        "INSERT INTO items (slug, name, flavor, description, image_url, hover_image_url, customer_review, category, category_key, category_id, tag, accent, is_active) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (clean["slug"], clean["name"], clean["flavor"], clean["description"], clean["image_url"], clean["hover_image_url"],
         clean["customer_review"], clean["category"], clean["category_key"], clean["category_id"],
         clean["tag"], clean["accent"], clean["is_active"]),
    )"""
create_new = """    await db.execute(
        "INSERT INTO items (slug, name, flavor, description, image_url, hover_image_url, customer_review, category, category_key, category_id, tag, accent, is_active, rich_image_sections) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (clean["slug"], clean["name"], clean["flavor"], clean["description"], clean["image_url"], clean["hover_image_url"],
         clean["customer_review"], clean["category"], clean["category_key"], clean["category_id"],
         clean["tag"], clean["accent"], clean["is_active"], clean["rich_image_sections"]),
    )"""
content = content.replace(create_old, create_new)

# 6. update_item
update_old = """    await db.execute(
        "UPDATE items SET slug = ?, name = ?, flavor = ?, description = ?, image_url = ?, hover_image_url = ?, customer_review = ?, category = ?, category_key = ?, category_id = ?, tag = ?, accent = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (clean["slug"], clean["name"], clean["flavor"], clean["description"], clean["image_url"], clean["hover_image_url"],
         clean["customer_review"], clean["category"], clean["category_key"], clean["category_id"],
         clean["tag"], clean["accent"], clean["is_active"], item_id),
    )"""
update_new = """    await db.execute(
        "UPDATE items SET slug = ?, name = ?, flavor = ?, description = ?, image_url = ?, hover_image_url = ?, customer_review = ?, category = ?, category_key = ?, category_id = ?, tag = ?, accent = ?, is_active = ?, rich_image_sections = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (clean["slug"], clean["name"], clean["flavor"], clean["description"], clean["image_url"], clean["hover_image_url"],
         clean["customer_review"], clean["category"], clean["category_key"], clean["category_id"],
         clean["tag"], clean["accent"], clean["is_active"], clean["rich_image_sections"], item_id),
    )"""
content = content.replace(update_old, update_new)

with open("backend/app/database.py", "w") as f:
    f.write(content)

