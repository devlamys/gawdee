import re

with open("backend/app/database.py", "r") as f:
    content = f.read()

# Fix validate_item_fields
val_old = r"""    is_active = fields.get\("is_active"\)
    if is_active is None or str\(is_active\)\.strip\(\)\.lower\(\) in \["1", "true", "yes"\]:"""
val_new = """    rich_image_sections = fields.get("rich_image_sections")
    if not isinstance(rich_image_sections, str):
        import json
        try:
            rich_image_sections = json.dumps(rich_image_sections or [])
        except Exception:
            rich_image_sections = '[]'
            
    is_active = fields.get("is_active")
    if is_active is None or str(is_active).strip().lower() in ["1", "true", "yes"]:"""
content = re.sub(val_old, val_new, content)

return_val_old = r"""        "is_active": is_active,
    \}"""
return_val_new = """        "rich_image_sections": rich_image_sections,
        "is_active": is_active,
    }"""
content = re.sub(return_val_old, return_val_new, content)

# update_item
update_old = r"""    await db.execute\(
        "UPDATE items SET slug = \?, name = \?, flavor = \?, description = \?, image_url = \?, hover_image_url = \?, customer_review = \?, category = \?, category_key = \?, category_id = \?, tag = \?, accent = \?, is_active = \?, updated_at = CURRENT_TIMESTAMP WHERE id = \?",
        \(clean\["slug"\], clean\["name"\], clean\["flavor"\], clean\["description"\], clean\["image_url"\], clean\["hover_image_url"\],
         clean\["customer_review"\], clean\["category"\], clean\["category_key"\], clean\["category_id"\],
         clean\["tag"\], clean\["accent"\], clean\["is_active"\], item_id\),
    \)"""
update_new = """    await db.execute(
        "UPDATE items SET slug = ?, name = ?, flavor = ?, description = ?, image_url = ?, hover_image_url = ?, customer_review = ?, category = ?, category_key = ?, category_id = ?, tag = ?, accent = ?, is_active = ?, rich_image_sections = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (clean["slug"], clean["name"], clean["flavor"], clean["description"], clean["image_url"], clean["hover_image_url"],
         clean["customer_review"], clean["category"], clean["category_key"], clean["category_id"],
         clean["tag"], clean["accent"], clean["is_active"], clean["rich_image_sections"], item_id),
    )"""
content = re.sub(update_old, update_new, content)

with open("backend/app/database.py", "w") as f:
    f.write(content)

