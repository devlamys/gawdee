with open("backend/app/routers/admin.py", "r") as f:
    content = f.read()

# Update admin_save_item to catch ValueError
old_save = """@router.post("/items")
async def admin_save_item(payload: Dict[str, Any], admin: Dict[str, Any] = Depends(get_current_admin)):
    db = await get_db()
    try:
        item_data = payload.get("item") or payload
        variants_data = payload.get("variants") or []
        item_id = int(payload.get("item_id") or item_data.get("id") or 0) or None
        new_id = await save_item_with_variants(db, item_data, variants_data, item_id)
        await sync_item_mirrors(db, new_id)
        saved = await get_item_with_variants(db, new_id, True)
        return {"ok": True, "message": "Item saved successfully", "item_id": new_id, "item": saved}
    finally:
        await db.close()"""

new_save = """@router.post("/items")
async def admin_save_item(payload: Dict[str, Any], admin: Dict[str, Any] = Depends(get_current_admin)):
    db = await get_db()
    try:
        item_data = payload.get("item") or payload
        variants_data = payload.get("variants") or []
        item_id = int(payload.get("item_id") or item_data.get("id") or 0) or None
        new_id = await save_item_with_variants(db, item_data, variants_data, item_id)
        await sync_item_mirrors(db, new_id)
        saved = await get_item_with_variants(db, new_id, True)
        return {"ok": True, "message": "Item saved successfully", "item_id": new_id, "item": saved}
    except ValueError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        await db.close()"""

content = content.replace(old_save, new_save)

with open("backend/app/routers/admin.py", "w") as f:
    f.write(content)
