"""
Gawdee FastAPI Backend
Items & Variants Router — mirrors api/items.php and includes/items.php
"""

from fastapi import APIRouter, HTTPException, Depends, Request, Response, UploadFile, File, Form, Query
from typing import Optional, List, Any, Dict
from pathlib import Path
import secrets
import shutil

from ..database import (
    get_db,
    get_items,
    get_item_by_id,
    get_item_by_slug,
    get_item_with_variants,
    get_variants_for_item,
    get_variant_by_ref,
    create_item,
    update_item,
    delete_item,
    create_variant,
    update_variant,
    delete_variant,
    save_item_with_variants,
    get_variant_images,
    add_variant_image,
    update_variant_image,
    delete_variant_image,
    sync_item_mirrors,
    sync_variant_mirror,
)
from .admin import get_current_admin
from ..core.config import settings

router = APIRouter(tags=["items"])

def _public_upload_base() -> Path:
    """Directory served at /assets/uploads/... (configured via .env, never os.environ here)."""
    return settings.public_upload_base


# ── Public Endpoints ────────────────────────────────────────────────────────

@router.get("/items")
async def api_list_items(
    with_variants: bool = Query(False, alias="with_variants"),
    include_inactive: bool = Query(False, alias="include_inactive"),
    action: Optional[str] = None,
    id: Optional[str] = None,
    slug: Optional[str] = None,
    sku: Optional[str] = None,
    item_id: Optional[str] = None,
    variant_id: Optional[str] = None,
):
    """
    List items or dispatch action for backward compatibility with PHP api/items.php query style.
    """
    db = await get_db()
    try:
        if action:
            if action == "list":
                items = await get_items(db, include_inactive=include_inactive, with_variants=with_variants)
                return {"ok": True, "count": len(items), "items": items}
            if action == "get":
                ref = id or slug or ""
                if not ref:
                    raise HTTPException(status_code=422, detail="Provide item id or slug.")
                item = await get_item_with_variants(db, ref, include_inactive=include_inactive)
                if not item:
                    raise HTTPException(status_code=404, detail="Item not found.")
                return {"ok": True, "item": item}
            if action == "variants":
                ref = item_id or id or slug or ""
                if not ref:
                    raise HTTPException(status_code=422, detail="Provide item_id.")
                item = await get_item_with_variants(db, ref, include_inactive=include_inactive)
                if not item:
                    raise HTTPException(status_code=404, detail="Item not found.")
                return {"ok": True, "item_id": item["id"], "variants": item.get("variants", [])}
            if action == "variant":
                ref = id or slug or sku or ""
                if not ref:
                    raise HTTPException(status_code=422, detail="Provide variant id, slug or sku.")
                variant = await get_variant_by_ref(db, ref, include_inactive=include_inactive)
                if not variant:
                    raise HTTPException(status_code=404, detail="Variant not found.")
                return {"ok": True, "variant": variant}
            if action == "images":
                ref = variant_id or id or slug or sku or ""
                if not ref:
                    raise HTTPException(status_code=422, detail="Provide variant_id.")
                variant = await get_variant_by_ref(db, ref, include_inactive=include_inactive)
                if not variant:
                    raise HTTPException(status_code=404, detail="Variant not found.")
                images = await get_variant_images(db, variant["id"], include_inactive=include_inactive)
                return {"ok": True, "variant_id": variant["id"], "images": images}

        items = await get_items(db, include_inactive=include_inactive, with_variants=with_variants)
        return {"ok": True, "count": len(items), "items": items}
    finally:
        await db.close()


@router.get("/items/{ref}")
async def api_get_item(ref: str, include_inactive: bool = False):
    db = await get_db()
    try:
        item = await get_item_with_variants(db, ref, include_inactive=include_inactive)
        if not item:
            raise HTTPException(status_code=404, detail="Item not found.")
        return {"ok": True, "item": item}
    finally:
        await db.close()


@router.get("/items/{ref}/variants")
async def api_get_item_variants(ref: str, include_inactive: bool = False):
    db = await get_db()
    try:
        item = await get_item_with_variants(db, ref, include_inactive=include_inactive)
        if not item:
            raise HTTPException(status_code=404, detail="Item not found.")
        return {"ok": True, "item_id": item["id"], "variants": item.get("variants", [])}
    finally:
        await db.close()


@router.get("/variants/{ref}")
async def api_get_variant(ref: str, include_inactive: bool = False):
    db = await get_db()
    try:
        variant = await get_variant_by_ref(db, ref, include_inactive=include_inactive)
        if not variant:
            raise HTTPException(status_code=404, detail="Variant not found.")
        return {"ok": True, "variant": variant}
    finally:
        await db.close()


@router.get("/variants/{ref}/images")
async def api_get_variant_images(ref: str, include_inactive: bool = False):
    db = await get_db()
    try:
        variant = await get_variant_by_ref(db, ref, include_inactive=include_inactive)
        if not variant:
            raise HTTPException(status_code=404, detail="Variant not found.")
        images = await get_variant_images(db, variant["id"], include_inactive=include_inactive)
        return {"ok": True, "variant_id": variant["id"], "images": images}
    finally:
        await db.close()


# NOTE: GET /api/catalog is served by routers/storefront.py (registered first).
# A duplicate handler lived here and was unreachable — removed during production cleanup.


# ── Admin Endpoints ─────────────────────────────────────────────────────────

@router.post("/items/admin")
async def api_items_admin(
    request: Request,
    admin: Dict[str, Any] = Depends(get_current_admin),
):
    """
    Action-based admin endpoint mirroring api/items.php
    """
    try:
        payload = await request.json()
    except Exception:
        payload = dict(await request.form())

    action = str(payload.get("action") or "").strip()
    if not action:
        raise HTTPException(status_code=422, detail="Action field is required.")

    db = await get_db()
    try:
        if action == "create_item":
            item_data = payload.get("item") or {}
            variants_data = payload.get("variants") or []
            if variants_data:
                new_id = await save_item_with_variants(db, item_data, variants_data, None)
            else:
                new_id = await create_item(db, item_data)
            await sync_item_mirrors(db, new_id)
            created = await get_item_with_variants(db, new_id, True)
            return {"ok": True, "message": "Item created.", "item_id": new_id, "item": created}

        elif action == "update_item":
            item_id = int(payload.get("item_id") or payload.get("id") or 0)
            if item_id <= 0:
                raise HTTPException(status_code=422, detail="Valid item_id is required.")
            item_data = payload.get("item") or {}
            variants_data = payload.get("variants")
            if variants_data is not None and isinstance(variants_data, list):
                await save_item_with_variants(db, item_data, variants_data, item_id)
            else:
                await update_item(db, item_id, item_data)
            await sync_item_mirrors(db, item_id)
            updated = await get_item_with_variants(db, item_id, True)
            return {"ok": True, "message": "Item updated.", "item_id": item_id, "item": updated}

        elif action == "delete_item":
            item_id = int(payload.get("item_id") or payload.get("id") or 0)
            if item_id <= 0:
                raise HTTPException(status_code=422, detail="Valid item_id is required.")
            await delete_item(db, item_id)
            return {"ok": True, "message": "Item and its variants deleted.", "item_id": item_id}

        elif action == "create_variant":
            item_id = int(payload.get("item_id") or 0)
            variant_data = payload.get("variant") or payload
            if item_id <= 0:
                raise HTTPException(status_code=422, detail="Valid item_id is required.")
            vid = await create_variant(db, item_id, variant_data)
            created = await get_variant_by_ref(db, vid, True)
            return {"ok": True, "message": "Variant created.", "variant_id": vid, "variant": created}

        elif action == "update_variant":
            vid = int(payload.get("variant_id") or payload.get("id") or 0)
            variant_data = payload.get("variant") or payload
            if vid <= 0:
                raise HTTPException(status_code=422, detail="Valid variant_id is required.")
            await update_variant(db, vid, variant_data)
            updated = await get_variant_by_ref(db, vid, True)
            return {"ok": True, "message": "Variant updated.", "variant_id": vid, "variant": updated}

        elif action == "delete_variant":
            vid = int(payload.get("variant_id") or payload.get("id") or 0)
            if vid <= 0:
                raise HTTPException(status_code=422, detail="Valid variant_id is required.")
            await delete_variant(db, vid)
            return {"ok": True, "message": "Variant deleted.", "variant_id": vid}

        elif action == "create_image":
            vid = int(payload.get("variant_id") or payload.get("variantId") or 0)
            image_path = str(payload.get("image") or payload.get("image_path") or "").strip()
            if vid <= 0:
                raise HTTPException(status_code=422, detail="Valid variant_id is required.")
            if not image_path:
                raise HTTPException(status_code=422, detail="Valid image path is required.")
            img_id = await add_variant_image(db, vid, image_path)
            await sync_variant_mirror(db, vid)
            return {"ok": True, "message": "Variant image added.", "variant_id": vid, "image_id": img_id}

        elif action == "update_image":
            img_id = int(payload.get("image_id") or payload.get("imageId") or payload.get("id") or 0)
            if img_id <= 0:
                raise HTTPException(status_code=422, detail="Valid image_id is required.")
            fields = {}
            for k in ("sort_order", "sortOrder", "is_active", "isActive", "image"):
                if k in payload:
                    clean_k = "sort_order" if k in ("sort_order", "sortOrder") else ("is_active" if k in ("is_active", "isActive") else k)
                    fields[clean_k] = payload[k]
            await update_variant_image(db, img_id, fields)
            return {"ok": True, "message": "Variant image updated.", "image_id": img_id}

        elif action == "delete_image":
            img_id = int(payload.get("image_id") or payload.get("imageId") or payload.get("id") or 0)
            if img_id <= 0:
                raise HTTPException(status_code=422, detail="Valid image_id is required.")
            await delete_variant_image(db, img_id)
            return {"ok": True, "message": "Variant image deleted.", "image_id": img_id}

        raise HTTPException(status_code=400, detail=f"Unknown action: {action}")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    finally:
        await db.close()


@router.post("/items/admin/upload-image")
async def api_upload_variant_image(
    variant_id: int = Form(...),
    image_file: Optional[UploadFile] = File(None),
    image: Optional[UploadFile] = File(None),
    folder: str = Form("products"),
    admin: Dict[str, Any] = Depends(get_current_admin),
):
    upload = image_file or image
    if not upload or not upload.filename:
        raise HTTPException(status_code=422, detail="No image file was provided.")

    folder_clean = "".join(c for c in folder.lower() if c.isalnum() or c in ("-", "_")) or "products"
    upload_dir = _public_upload_base() / folder_clean
    upload_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(upload.filename).suffix.lower() or ".jpg"
    random_name = f"{folder_clean}-{secrets.token_hex(9)}{ext}"
    dest_path = upload_dir / random_name

    with open(dest_path, "wb") as f:
        shutil.copyfileobj(upload.file, f)

    relative_url = f"/assets/uploads/{folder_clean}/{random_name}"

    db = await get_db()
    try:
        img_id = await add_variant_image(db, variant_id, relative_url)
        await sync_variant_mirror(db, variant_id)
        return {
            "ok": True,
            "message": "Variant image uploaded.",
            "variant_id": variant_id,
            "image_id": img_id,
            "path": relative_url,
            "url": relative_url,
        }
    except Exception as e:
        if dest_path.exists():
            dest_path.unlink()
        raise HTTPException(status_code=422, detail=str(e))
    finally:
        await db.close()
