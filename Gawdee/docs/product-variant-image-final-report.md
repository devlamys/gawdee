# Product → Variant → Image — Final Report (Phases 1–5)

## 1. Database changes
- **Renamed to the required model (data-preserving `ALTER TABLE … RENAME`)**:
  `categories` → `category` (`image`→`image_url`; kept `filter/icon/sort_order/is_active` used by admin),
  `item_variants` → `variant` (`price`→`selling_price`, `stock_quantity`→`stock`,
  `is_inclusive_tax`→`is_inclusive` DEFAULT 1), `item_images` → `variant_image`
  (+`name`, `image`→`image_url`; kept `sort_order/is_active`).
- **New relationships**: `items.parent_id → items.id` (nullable, `ON DELETE SET NULL`),
  `items.category_id → category.id` (nullable, `SET NULL`); new `variant.uom`.
- **Verified live**: FKs with correct actions; `parent_id`/`category_id` nullable;
  `is_inclusive` defaults to 1; all columns `snake_case`; `created_at`/`updated_at`
  populated; indexes on `variant(item_id,slug,sku,legacy)`, `variant_image(variant_id)`,
  `items(slug,category_key,category_id,parent_id)`; `PRAGMA foreign_key_check` clean.

## 2. Backend changes
- **Versioned migration** (`migrate_domain_v2`, `user_version = 2`): idempotent,
  runs on boot; includes a self-heal path that completes interrupted renames
  instead of stranding data. Fresh DBs get the final schema directly.
- **Discount truth** (`calc_discount_percent`): `((MRP−Selling)/MRP)×100`, 2dp;
  MRP≤0 → `0.0` (no division by zero); SellingPrice>MRP clamped; explicit
  SellingPrice on write always wins and recomputes discount; legacy
  discount-only payloads still accepted; unrelated edits preserve values.
- **Validation added**: SKU format + case-insensitive uniqueness, MRP/SellingPrice/
  Stock ranges, UOM pattern, ItemId/VariantId existence, ImageUrl scheme/length
  safety, category existence, ParentId (exists / never-self / ≤100-depth cycle
  walk, orphans SET NULL on delete).
- **Serializers**: `to_category_dto`, `to_variant_dto`, `to_variant_image_dto`,
  `to_item_dto` (+ `get_item_dto`, `get_items_dto`) — camelCase, bounded
  (list views omit image blobs via `imageCount`), acyclic (shallow `parent`,
  flat `childIds`).
- **No other backend logic touched**: checkout/pricing/stock-deduction,
  webhooks, OTP, auth, and the legacy `products` mirror sync are byte-identical
  in behavior; commerce/integrations/storefront/account needed zero edits.

## 3. API changes
- **New canonical surface** (`app/routers/catalog.py`, `/api/catalog/*`):
  public `categories`, `items?category_id=`, `items/{ref}` (id/item-slug/
  variant-slug/variant-id/SKU all resolve), `variants/{ref}`,
  `variants/{ref}/images`; admin `POST/PATCH variants`, `PATCH …/price`
  (recalculates discount), `PATCH …/stock` (negative → 422), `POST/PATCH/
  DELETE variant images`, `POST/PATCH items` (incl. `parentId`/`categoryId`,
  null unlinks).
- **Verified**: correct codes (200/401/403/404/422), validation messages,
  JSON-serializable (no cycles), no payload duplication beyond intentional
  legacy+canonical aliases, zero fake data (every number traces to a row).
- **Legacy `/api/products*` untouched** — still serving PDP review embeds.

## 4. Frontend changes
- New `lib/catalog.ts` (deterministic `firstValidVariant`, `isVariantAvailable`
  with negative-stock warning, display-only `variantDiscountPercent`,
  gallery fallback chain, `variantCartLine`, category icons) and `api.catalog`
  client; new canonical DTO types.
- **Listing**: catalog items + backend-driven category pills (was static list +
  client-side family reconstruction — deleted); per-card variant pills switch
  price/stock/CTA/image atomically.
- **ProductCard** (home/wishlist/related): `item` prop, selected-variant state,
  pills + Quick-Add/stepper + drawer, backend discount badge.
- **PDP**: separate item/selected-variant/image/reviews/related/quantity/
  loading/error state; one `selectVariant` updates price, MRP, discount, stock,
  SKU, **UOM** (newly surfaced), gallery, quantity together; gallery honors
  empty (no fake images) and broken URLs (fallback); reviews refetch per
  variant; related from same backend category.
- **Wishlist**: matches saved variant *or* item ids (backward compatible).
- **Homepage**: rail takes first 6 catalog items; category cards from backend
  rows (static artwork only where backend has no image); **Hero** matches slides
  by variant slug → canonical price/stock/rating, cart lines carry ItemId+VariantId.
- **Design preserved**: zero stylesheet changes; every original CSS hook
  verified present in rewritten files (desktop/tablet/mobile layouts intact).

## 5. State-management changes
- Existing React Context kept, no new library. `CartContext` drawer state
  retyped to `CatalogItem/CatalogVariant`; cart lines now explicitly carry
  `item_id` + `variant_id` while `id` stays the backend-resolvable variant id,
  so checkout needs no changes and old saved carts keep resolving.

## 6. Removed obsolete logic (each verified unused before removal)
- Unused legacy `Item`/`ItemVariant`/`VariantImage` interfaces (`Product` kept —
  still used by legacy review endpoints).
- Client-side family reconstruction (`getFamilyKey`/`parseGrams`), frontend
  discount recomputation, static category filter list.
- Admin new-variant/banner templates blanked (`mrp/discount/selling_price/
  stock 590/17/490/50…` → `0`; `₹891/₹1,049` labels → empty) so unsaved
  template values can never become phantom data.
- Fixed a refactor-introduced inconsistency: canonical `discountPercent`
  truncated (16) vs legacy rounded (17) — now rounds in the serializer.
- Left intentionally (pre-existing, outside hierarchy scope): unused helpers
  `admin_orders`, `adjust_product_stock`, `set_manual_shipment`,
  `generate_blog`, `delhivery_create_shipment`, and an imported-but-never-
  invoked `queue_order_notification`; static `₹999` shipping copy (matches
  backend settings).

## 7. Migration details
- Backup taken before any write; rehearsed on isolated copies: legacy path,
  fresh path, interrupted-state self-heal, write-path rules, admin round-trip,
  double-run idempotency — all asserted green.
- Production applied with assert gates: version 2; counts 5 categories / 9
  items / 28 variants / 28 mirror rows / 0 orders; Mix Me row (id 1) preserved
  with its uploaded image; all items linked; UOM complete; 28/28 stored
  discounts reproduce from the formula; FK check clean.
- Dev-server note: `uvicorn --reload` auto-migrated mid-session once, briefly
  stranding empty new tables beside legacy ones; detected by asserts, repaired
  via merge + self-heal, server restarted on final code and re-verified.

## 8. Tests performed
- No test suites exist in either project; verification was live and reproducible:
  backend `py_compile`, frontend `tsc --noEmit`, ESLint (12 errors vs 13-error
  pre-existing baseline, same categories — nothing new), `next build` 17/17,
  SSR checks (homepage cards/prices/categories, listing/PDP/wishlist 200s),
  endpoint matrix (hierarchy shape, discount precision, 404s, images list,
  category filter, legacy PDP/list intact), error matrix (401/422×5/404×2),
  write round-trips (create→price→stock→image add/update/delete), DB
  invariant suite (§1), CSS-hook preservation audit.

## 9. Remaining issues
- Production holds no zero-stock variant and no variant images, so those two
  UI paths are code-verified + API-tested on copies but not yet observable
  against live rows — they will light up automatically when admin adds them.
- PDP review submit still resolves via the legacy product id (reviews live
  outside the canonical model); a future backend `product_id`-agnostic review
  API could remove that last legacy call.
- `queue_order_notification` is imported but never invoked (pre-existing;
  order notifications therefore only process opportunistically) — flagged,
  not changed.
