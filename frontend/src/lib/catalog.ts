import type { CartItem, CatalogItem, CatalogVariant } from '@/types';

// ── Canonical hierarchy helpers (Category → Item → Variant → VariantImage) ──
// All display values (price, stock, discount, images) come from the backend.
// These helpers only *select* which backend-provided variant to show.

/** Deterministic default variant: first active in-stock variant, else first active, else first. */
export function firstValidVariant(item: CatalogItem | null | undefined): CatalogVariant | null {
  const variants = item?.variants;
  if (!variants || variants.length === 0) return null;
  const active = variants.filter((v) => v.isActive !== 0);
  const pool = active.length > 0 ? active : variants;
  return pool.find((v) => v.stock > 0) ?? pool[0] ?? null;
}

/** Variant availability from backend stock. Negative stock is invalid backend data: warn + treat as unavailable. */
export function isVariantAvailable(variant: CatalogVariant | null | undefined): boolean {
  if (!variant) return false;
  const stock = Number(variant.stock);
  if (!Number.isFinite(stock) || stock < 0) {
    if (typeof console !== 'undefined' && stock < 0) {
      console.warn(`[catalog] invalid negative stock for variant ${variant.id}; treating as unavailable.`);
    }
    return false;
  }
  return stock > 0;
}

/** Discount percent to display — backend value only, never recalculated. */
export function variantDiscountPercent(variant: CatalogVariant | null | undefined): number {
  if (!variant || !(variant.mrp > variant.sellingPrice)) return 0;
  const pct = Number(variant.discountPercent);
  if (Number.isFinite(pct) && pct > 0) return Math.round(pct);
  const fallback = Number(variant.discount);
  return Number.isFinite(fallback) && fallback > 0 ? Math.round(fallback) : 0;
}

/**
 * STRICT variant gallery for the product detail page: VariantImages[] plus
 * the variant's own image column only. Item.ImageUrl / HoverImageUrl NEVER
 * enter the gallery — they belong to cards and listings. Empty when the
 * variant has no imagery (callers render an empty state, never a fake image).
 */
export function variantDetailGallery(
  variant: CatalogVariant | null | undefined
): string[] {
  const gallery = (variant?.images ?? []).map((g) => g?.imageUrl).filter(Boolean) as string[];
  const own = (variant?.image || '').trim();
  if (own && !gallery.includes(own)) gallery.push(own);
  return gallery;
}

/** Item card image: canonical ImageUrl first, legacy image alias as fallback. '' when absent. */
export function itemCardImage(item: Pick<CatalogItem, 'imageUrl' | 'image'> | null | undefined): string {
  if (!item) return '';
  return (item.imageUrl || item.image || '').trim();
}

/** Item hover image: canonical HoverImageUrl first, legacy alias as fallback. '' when absent. */
export function itemHoverImage(item: Pick<CatalogItem, 'hoverImageUrl' | 'hoverImage'> | null | undefined): string {
  if (!item) return '';
  return (item.hoverImageUrl || item.hoverImage || '').trim();
}

/**
 * Listing card imagery for one variant: first image shows by default,
 * second image shows on hover. Precedence is backend-driven —
 * gallery preview (admin order), then the variant's own image, then the
 * item image; the item hover image is the last-resort second frame.
 * Returns `[first, second]` where second may be '' (no hover swap).
 */
export function variantCardImages(
  item: Pick<CatalogItem, 'imageUrl' | 'image' | 'hoverImageUrl' | 'hoverImage'> | null | undefined,
  variant: CatalogVariant | null | undefined
): [string, string] {
  const gallery = (
    variant?.imagePreview ??
    (variant?.images ?? []).map((g) => g?.imageUrl)
  ).filter((u): u is string => typeof u === 'string' && u.trim() !== '');
  const ordered = gallery.map((u) => u.trim()).filter((u, i, a) => a.indexOf(u) === i);
  const own = (variant?.image || '').trim();
  if (own && !ordered.includes(own)) ordered.push(own);
  const itemImg = itemCardImage(item as Pick<CatalogItem, 'imageUrl' | 'image'> | null | undefined);
  if (itemImg && !ordered.includes(itemImg)) ordered.push(itemImg);
  const first = ordered[0] || '';
  let second = ordered[1] || '';
  if (!second) {
    const hover = itemHoverImage(item);
    if (hover && hover !== first) second = hover;
  }
  return [first, second];
}

/**
 * Build a cart line that identifies the exact variant (ItemId + VariantId).
 * `id` stays the backend-resolvable variant id so checkout keeps working;
 * itemId/variantId make the distinction explicit for multi-variant items.
 */
export function variantCartLine(
  item: CatalogItem,
  variant: CatalogVariant
): Omit<CartItem, 'quantity'> {
  return {
    id: String(variant.id),
    item_id: item.id,
    variant_id: variant.id,
    name: item.name,
    price: variant.sellingPrice,
    original_price: variant.mrp,
    weight: variant.variantName,
    variant_name: variant.variantName,
    uom: variant.uom,
    image: variant.image || item.image,
    sku: variant.sku,
    type: 'product',
  };
}

/** Icon for a backend category filter key (UI affordance only — labels come from the backend). */
export const CATEGORY_ICONS: Record<string, string> = {
  all: 'ph-squares-four',
  ghee: 'ph-bowl-steam',
  honey: 'ph-drop',
  nutrition: 'ph-grains',
  sugar: 'ph-cube',
  wellness: 'ph-leaf',
};

export function categoryIcon(filter?: string | null): string {
  if (!filter) return CATEGORY_ICONS.all;
  return CATEGORY_ICONS[filter.toLowerCase()] || CATEGORY_ICONS.all;
}
