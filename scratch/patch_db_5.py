with open("backend/app/database.py", "r") as f:
    content = f.read()

update_old = """        "UPDATE items SET slug=?, name=?, flavor=?, description=?, image_url=?, hover_image_url=?, customer_review=?, "
        "category=?, category_key=?, category_id=?, tag=?, accent=?, is_active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (clean["slug"], clean["name"], clean["flavor"], clean["description"], clean["image_url"], clean["hover_image_url"],
         clean["customer_review"], clean["category"], clean["category_key"], clean["category_id"],
         clean["tag"], clean["accent"], clean["is_active"], item_id),"""
update_new = """        "UPDATE items SET slug=?, name=?, flavor=?, description=?, image_url=?, hover_image_url=?, customer_review=?, "
        "category=?, category_key=?, category_id=?, tag=?, accent=?, is_active=?, rich_image_sections=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (clean["slug"], clean["name"], clean["flavor"], clean["description"], clean["image_url"], clean["hover_image_url"],
         clean["customer_review"], clean["category"], clean["category_key"], clean["category_id"],
         clean["tag"], clean["accent"], clean["is_active"], clean["rich_image_sections"], item_id),"""
content = content.replace(update_old, update_new)

with open("backend/app/database.py", "w") as f:
    f.write(content)

