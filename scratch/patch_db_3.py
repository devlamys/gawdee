with open("backend/app/database.py", "r") as f:
    content = f.read()

# Update validate_item_fields
old_val = """    is_active = fields.get("is_active")
    if is_active is None or str(is_active).strip().lower() in ["1", "true", "yes"]:"""

new_val = """    rich_image_sections = fields.get("rich_image_sections")
    if not isinstance(rich_image_sections, str):
        import json
        try:
            rich_image_sections = json.dumps(rich_image_sections or [])
        except Exception:
            rich_image_sections = '[]'
            
    is_active = fields.get("is_active")
    if is_active is None or str(is_active).strip().lower() in ["1", "true", "yes"]:"""
content = content.replace(old_val, new_val)

old_ret = """        "is_active": is_active,
    }"""
new_ret = """        "rich_image_sections": rich_image_sections,
        "is_active": is_active,
    }"""
content = content.replace(old_ret, new_ret)

# Update update_item
old_up = """    await db.execute(
        "UPDATE items SET slug = ?, name = ?, flavor = ?, description = ?, image_url = ?, hover_image_url = ?, customer_review = ?, category = ?, category_key = ?, category_id = ?, tag = ?, accent = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (clean["slug"], clean["name"], clean["flavor"], clean["description"], clean["image_url"], clean["hover_image_url"],
         clean["customer_review"], clean["category"], clean["category_key"], clean["category_id"],
         clean["tag"], clean["accent"], clean["is_active"], item_id),
    )"""
new_up = """    await db.execute(
        "UPDATE items SET slug = ?, name = ?, flavor = ?, description = ?, image_url = ?, hover_image_url = ?, customer_review = ?, category = ?, category_key = ?, category_id = ?, tag = ?, accent = ?, is_active = ?, rich_image_sections = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (clean["slug"], clean["name"], clean["flavor"], clean["description"], clean["image_url"], clean["hover_image_url"],
         clean["customer_review"], clean["category"], clean["category_key"], clean["category_id"],
         clean["tag"], clean["accent"], clean["is_active"], clean["rich_image_sections"], item_id),
    )"""
content = content.replace(old_up, new_up)

with open("backend/app/database.py", "w") as f:
    f.write(content)

