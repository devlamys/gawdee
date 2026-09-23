with open("backend/app/database.py", "r") as f:
    content = f.read()

# 1. Update validate_item_fields
val_old = """        "tag": str(fields.get("tag") or "").strip()[:100],
        "accent": accent,
        "is_active": 1 if fields.get("is_active", 1) else 0,
    }"""
val_new = """        "tag": str(fields.get("tag") or "").strip()[:100],
        "accent": accent,
        "is_active": 1 if fields.get("is_active", 1) else 0,
        "rich_image_sections": fields.get("rich_image_sections") if isinstance(fields.get("rich_image_sections"), str) else __import__('json').dumps(fields.get("rich_image_sections") or []),
    }"""
content = content.replace(val_old, val_new)

# 2. Update create_item
create_old = """        "INSERT INTO items (slug, name, flavor, description, image_url, hover_image_url, customer_review, category, category_key, category_id, tag, accent, is_active) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (clean["slug"], clean["name"], clean["flavor"], clean["description"], clean["image_url"], clean["hover_image_url"],
         clean["customer_review"], clean["category"], clean["category_key"], clean["category_id"],
         clean["tag"], clean["accent"], clean["is_active"]),"""
create_new = """        "INSERT INTO items (slug, name, flavor, description, image_url, hover_image_url, customer_review, category, category_key, category_id, tag, accent, is_active, rich_image_sections) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (clean["slug"], clean["name"], clean["flavor"], clean["description"], clean["image_url"], clean["hover_image_url"],
         clean["customer_review"], clean["category"], clean["category_key"], clean["category_id"],
         clean["tag"], clean["accent"], clean["is_active"], clean["rich_image_sections"]),"""
content = content.replace(create_old, create_new)

# 3. Update update_item
update_old = """        "UPDATE items SET slug = ?, name = ?, flavor = ?, description = ?, image_url = ?, hover_image_url = ?, customer_review = ?, category = ?, category_key = ?, category_id = ?, tag = ?, accent = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (clean["slug"], clean["name"], clean["flavor"], clean["description"], clean["image_url"], clean["hover_image_url"],
         clean["customer_review"], clean["category"], clean["category_key"], clean["category_id"],
         clean["tag"], clean["accent"], clean["is_active"], item_id),"""
update_new = """        "UPDATE items SET slug = ?, name = ?, flavor = ?, description = ?, image_url = ?, hover_image_url = ?, customer_review = ?, category = ?, category_key = ?, category_id = ?, tag = ?, accent = ?, is_active = ?, rich_image_sections = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (clean["slug"], clean["name"], clean["flavor"], clean["description"], clean["image_url"], clean["hover_image_url"],
         clean["customer_review"], clean["category"], clean["category_key"], clean["category_id"],
         clean["tag"], clean["accent"], clean["is_active"], clean["rich_image_sections"], item_id),"""
content = content.replace(update_old, update_new)

with open("backend/app/database.py", "w") as f:
    f.write(content)

