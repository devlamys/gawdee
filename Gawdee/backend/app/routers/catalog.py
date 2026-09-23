"""
Gawdee FastAPI Backend — canonical hierarchy API (Phase 3).

Category → Items → Variants → VariantImages as camelCase DTOs.
- Public reads: bounded, acyclic (parent is shallow, children are id lists;
  list views omit variant images, detail views embed them).
- Admin writes: discrete endpoints with canonical payloads; backend remains
  the source of truth for price/stock/discount (recomputed server-side).
- Legacy /api/* snake_case surfaces are untouched by this router.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Any, Dict
import aiosqlite

from ..database import (
    get_db,
    migrate,
    get_categories,
    get_item_dto,
    get_items_dto,
    get_items,
    get_variants_for_item,
    get_category_for_item,
    get_variant_by_ref,
    get_variant_images,
    get_variants_dto,
    create_variant,
    update_variant,
    create_item,
    update_item,
    add_variant_image,
    update_variant_image,
    delete_variant_image,
    sync_variant_mirror,
    sync_item_mirrors,
    to_item_dto,
    to_variant_dto,
    to_variant_image_dto,
    to_category_dto,
    get_category_dto,
)
from .admin import get_current_admin

router = APIRouter(tags=["catalog"])


async def db_dep():
    db = await get_db()
    try:
        await migrate(db)
        yield db
    finally:
        await db.close()


# ── Public reads ────────────────────────────────────────────────────────────

@router.get("/catalog/categories")
async def catalog_categories(db: aiosqlite.Connection = Depends(db_dep)):
    rows = await get_categories(db)
    out = []
    for r in rows:
        dto = await get_category_dto(db, int(r["id"]))
        if dto:
            out.append(dto)
    return {"ok": True, "categories": out}


@router.get("/catalog/items")
async def catalog_items(
    category_id: Optional[int] = Query(None),
    db: aiosqlite.Connection = Depends(db_dep),
):
    return {"ok": True, "items": await get_items_dto(db, category_id=category_id)}


@router.get("/catalog/admin/items")
async def catalog_admin_items(
    include_inactive: bool = Query(True),
    db: aiosqlite.Connection = Depends(db_dep),
    admin: Dict[str, Any] = Depends(get_current_admin),
):
    """Admin item list in canonical DTO shape (includes drafts + images)."""
    items = await get_items(db, include_inactive=include_inactive, with_variants=False)
    out = []
    for item in items:
        variants = await get_variants_for_item(db, item["id"], include_inactive)
        category = await get_category_for_item(db, item)
        out.append(to_item_dto(item, variants=variants, category=category, include_variant_images=True))
    return {"ok": True, "items": out}


@router.get("/catalog/items/{ref}")
async def catalog_item(
    ref: str,
    include_inactive: bool = Query(False),
    db: aiosqlite.Connection = Depends(db_dep),
):
    dto = await get_item_dto(db, ref, include_inactive=include_inactive)
    if not dto:
        raise HTTPException(status_code=404, detail="Item not found.")
    return {"ok": True, "item": dto}


@router.get("/catalog/variants/{ref}")
async def catalog_variant(ref: str, db: aiosqlite.Connection = Depends(db_dep)):
    v = await get_variant_by_ref(db, ref)
    if not v:
        raise HTTPException(status_code=404, detail="Variant not found.")
    return {"ok": True, "variant": to_variant_dto(v)}


@router.get("/catalog/admin/variants")
async def catalog_admin_variants(
    item_id: Optional[int] = Query(None),
    include_inactive: bool = Query(True),
    db: aiosqlite.Connection = Depends(db_dep),
    admin: Dict[str, Any] = Depends(get_current_admin),
):
    """Admin variant list (includes drafts by default), optionally scoped to one item."""
    return {"ok": True, "variants": await get_variants_dto(db, item_id=item_id, include_inactive=include_inactive)}


@router.get("/catalog/variants/{ref}/images")
async def catalog_variant_images(ref: str, db: aiosqlite.Connection = Depends(db_dep)):
    v = await get_variant_by_ref(db, ref)
    if not v:
        raise HTTPException(status_code=404, detail="Variant not found.")
    rows = await get_variant_images(db, int(v["id"]))
    return {"ok": True, "variant_id": int(v["id"]), "images": [to_variant_image_dto(r) for r in rows]}


# ── Admin writes (canonical camelCase payloads) ─────────────────────────────

class VariantCreatePayload(BaseModel):
    itemId: int
    variantName: Optional[str] = None
    mrp: int = 0
    sellingPrice: Optional[int] = None
    price: Optional[int] = None
    discount: Optional[float] = None
    sku: Optional[str] = None
    uom: Optional[str] = None
    stock: Optional[int] = None
    isInclusive: Optional[bool] = None
    isLabTested: Optional[bool] = None
    isNatural: Optional[bool] = None
    image: Optional[str] = None
    isActive: Optional[bool] = None


class VariantUpdatePayload(BaseModel):
    variantName: Optional[str] = None
    mrp: Optional[int] = None
    sellingPrice: Optional[int] = None
    price: Optional[int] = None
    discount: Optional[float] = None
    sku: Optional[str] = None
    uom: Optional[str] = None
    stock: Optional[int] = None
    isInclusive: Optional[bool] = None
    isLabTested: Optional[bool] = None
    isNatural: Optional[bool] = None
    image: Optional[str] = None
    isActive: Optional[bool] = None


class VariantPricePayload(BaseModel):
    mrp: Optional[int] = None
    sellingPrice: Optional[int] = None
    price: Optional[int] = None


class VariantStockPayload(BaseModel):
    stock: int


class VariantImageCreatePayload(BaseModel):
    name: Optional[str] = ""
    imageUrl: str


class VariantImageUpdatePayload(BaseModel):
    name: Optional[str] = None
    imageUrl: Optional[str] = None
    image: Optional[str] = None
    sortOrder: Optional[int] = None
    isActive: Optional[bool] = None


class ItemCreatePayload(BaseModel):
    name: str
    slug: Optional[str] = None
    flavor: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    imageUrl: Optional[str] = None
    hoverImage: Optional[str] = None
    hoverImageUrl: Optional[str] = None
    category: Optional[str] = None
    categoryKey: Optional[str] = None
    categoryId: Optional[int] = None
    tag: Optional[str] = None
    accent: Optional[str] = None
    isActive: Optional[bool] = None


class ItemUpdatePayload(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    flavor: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    imageUrl: Optional[str] = None
    hoverImage: Optional[str] = None
    hoverImageUrl: Optional[str] = None
    category: Optional[str] = None
    categoryKey: Optional[str] = None
    categoryId: Optional[int] = None
    tag: Optional[str] = None
    accent: Optional[str] = None
    isActive: Optional[bool] = None


def _variant_fields(payload: BaseModel) -> dict:
    data = payload.model_dump(exclude_unset=True)
    mapping = {
        "itemId": "item_id", "variantName": "variant_name", "sellingPrice": "selling_price",
        "isInclusive": "is_inclusive", "isLabTested": "is_lab_tested", "isNatural": "is_natural",
        "isActive": "is_active",
    }
    return {mapping.get(k, k): v for k, v in data.items()}


def _item_fields(payload: BaseModel) -> dict:
    data = payload.model_dump(exclude_unset=True)
    mapping = {
        "hoverImage": "hover_image", "hoverImageUrl": "hover_image_url",
        "imageUrl": "image_url", "categoryKey": "category_key",
        "categoryId": "category_id", "isActive": "is_active",
    }
    return {mapping.get(k, k): v for k, v in data.items()}


@router.post("/catalog/admin/variants")
async def catalog_create_variant(
    payload: VariantCreatePayload,
    db: aiosqlite.Connection = Depends(db_dep),
    admin: Dict[str, Any] = Depends(get_current_admin),
):
    if payload.itemId <= 0:
        raise HTTPException(status_code=422, detail="Valid itemId is required.")
    try:
        vid = await create_variant(db, payload.itemId, _variant_fields(payload))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    v = await get_variant_by_ref(db, vid, True)
    return {"ok": True, "message": "Variant created.", "variant_id": vid, "variant": to_variant_dto(v)}


@router.patch("/catalog/admin/variants/{variant_id}")
async def catalog_update_variant(
    variant_id: int,
    payload: VariantUpdatePayload,
    db: aiosqlite.Connection = Depends(db_dep),
    admin: Dict[str, Any] = Depends(get_current_admin),
):
    try:
        await update_variant(db, variant_id, _variant_fields(payload))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    v = await get_variant_by_ref(db, variant_id, True)
    if not v:
        raise HTTPException(status_code=404, detail="Variant not found.")
    await sync_variant_mirror(db, variant_id)
    return {"ok": True, "message": "Variant updated.", "variant_id": variant_id, "variant": to_variant_dto(v)}


@router.patch("/catalog/admin/variants/{variant_id}/price")
async def catalog_update_variant_price(
    variant_id: int,
    payload: VariantPricePayload,
    db: aiosqlite.Connection = Depends(db_dep),
    admin: Dict[str, Any] = Depends(get_current_admin),
):
    fields = _variant_fields(payload)
    if "mrp" not in fields and "selling_price" not in fields and "price" not in fields:
        raise HTTPException(status_code=422, detail="Provide mrp and/or sellingPrice.")
    try:
        await update_variant(db, variant_id, fields)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    v = await get_variant_by_ref(db, variant_id, True)
    if not v:
        raise HTTPException(status_code=404, detail="Variant not found.")
    await sync_variant_mirror(db, variant_id)
    return {"ok": True, "message": "Variant price updated.", "variant": to_variant_dto(v)}


@router.patch("/catalog/admin/variants/{variant_id}/stock")
async def catalog_update_variant_stock(
    variant_id: int,
    payload: VariantStockPayload,
    db: aiosqlite.Connection = Depends(db_dep),
    admin: Dict[str, Any] = Depends(get_current_admin),
):
    if payload.stock < 0:
        raise HTTPException(status_code=422, detail="Stock cannot be negative.")
    try:
        await update_variant(db, variant_id, {"stock": payload.stock})
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    v = await get_variant_by_ref(db, variant_id, True)
    if not v:
        raise HTTPException(status_code=404, detail="Variant not found.")
    await sync_variant_mirror(db, variant_id)
    return {"ok": True, "message": "Variant stock updated.", "variant": to_variant_dto(v)}


@router.post("/catalog/admin/variants/{variant_id}/images")
async def catalog_add_variant_image(
    variant_id: int,
    payload: VariantImageCreatePayload,
    db: aiosqlite.Connection = Depends(db_dep),
    admin: Dict[str, Any] = Depends(get_current_admin),
):
    v = await get_variant_by_ref(db, variant_id, True)
    if not v:
        raise HTTPException(status_code=404, detail="Variant not found.")
    try:
        img_id = await add_variant_image(db, variant_id, payload.imageUrl, name=payload.name or "")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    await sync_variant_mirror(db, variant_id)
    rows = await get_variant_images(db, variant_id, True)
    created = next((r for r in rows if int(r["id"]) == img_id), None)
    return {"ok": True, "message": "Variant image added.", "image_id": img_id,
            "image": to_variant_image_dto(created) if created else None}


@router.patch("/catalog/admin/variant-images/{image_id}")
async def catalog_update_variant_image(
    image_id: int,
    payload: VariantImageUpdatePayload,
    db: aiosqlite.Connection = Depends(db_dep),
    admin: Dict[str, Any] = Depends(get_current_admin),
):
    fields: dict = {}
    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        fields["name"] = data["name"]
    if "imageUrl" in data:
        fields["image_url"] = data["imageUrl"]
    if "image" in data:
        fields["image"] = data["image"]
    if "sortOrder" in data:
        fields["sort_order"] = data["sortOrder"]
    if "isActive" in data:
        fields["is_active"] = data["isActive"]
    try:
        await update_variant_image(db, image_id, fields)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {"ok": True, "message": "Variant image updated.", "image_id": image_id}


@router.delete("/catalog/admin/variant-images/{image_id}")
async def catalog_delete_variant_image(
    image_id: int,
    db: aiosqlite.Connection = Depends(db_dep),
    admin: Dict[str, Any] = Depends(get_current_admin),
):
    async with db.execute("SELECT id FROM variant_image WHERE id = ? LIMIT 1", (image_id,)) as cur:
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="Variant image not found.")
    try:
        await delete_variant_image(db, image_id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {"ok": True, "message": "Variant image deleted.", "image_id": image_id}


@router.post("/catalog/admin/items")
async def catalog_create_item(
    payload: ItemCreatePayload,
    db: aiosqlite.Connection = Depends(db_dep),
    admin: Dict[str, Any] = Depends(get_current_admin),
):
    try:
        item_id = await create_item(db, _item_fields(payload))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    await sync_item_mirrors(db, item_id)
    dto = await get_item_dto(db, item_id, include_inactive=True)
    return {"ok": True, "message": "Item created.", "item_id": item_id, "item": dto}


@router.patch("/catalog/admin/items/{item_id}")
async def catalog_update_item(
    item_id: int,
    payload: ItemUpdatePayload,
    db: aiosqlite.Connection = Depends(db_dep),
    admin: Dict[str, Any] = Depends(get_current_admin),
):
    try:
        await update_item(db, item_id, _item_fields(payload))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    await sync_item_mirrors(db, item_id)
    dto = await get_item_dto(db, item_id, include_inactive=True)
    if not dto:
        raise HTTPException(status_code=404, detail="Item not found.")
    return {"ok": True, "message": "Item updated.", "item_id": item_id, "item": dto}
