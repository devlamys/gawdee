import re

with open("backend/app/database.py", "r") as f:
    content = f.read()

content = re.sub(
    r"is_active=\?, updated_at=CURRENT_TIMESTAMP WHERE id=\?",
    r"is_active=?, rich_image_sections=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
    content
)

content = re.sub(
    r"clean\[\"tag\"\], clean\[\"accent\"\], clean\[\"is_active\"\], item_id\),",
    r'clean["tag"], clean["accent"], clean["is_active"], clean.get("rich_image_sections", "[]"), item_id),',
    content
)

with open("backend/app/database.py", "w") as f:
    f.write(content)

