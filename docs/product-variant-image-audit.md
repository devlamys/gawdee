# Phase 1 — Product / Variant / Image Audit

Branch: `MultipleImages` (repo `AlbiruniGit/Gawdee`, clean, in sync with origin).
Scope: read-only inspection. **No code was modified in this phase.**

Stack: FastAPI + raw `aiosqlite` (no ORM, no migration framework) · SQLite file
`backend/storage/gawdee.sqlite` · Next.js 16 + React 19 (no Tailwind; 7 global
CSS files) · config via `.env` → `app/core/config.py` (Pydantic BaseSettings,
all-required) and `src/config/env.ts`.

## 1. Current architecture

Backend (`backend/app/`, ~5.4k lines): `main.py` (app, CORS, session
middleware, startup `migrate()`) · `database.py` (DDL as `CREATE TABLE IF NOT
EXISTS` strings + ~all data-access helpers; dict rows, no models/DTO classes)
· `commerce.py` (pricing, orders, inventory, status workflow) ·
`integrations.py` (Razorpay, Delhivery, WhatsApp, OTP, AI) · `session.py`
(HMAC cookie) · routers: `storefront` (public catalog/checkout/wishlist/
reviews/AI/OTP), `account` (customer auth, profile, orders, CMS/blog/testi-
monials reads), `webhooks` (Razorpay/Delhivery/WhatsApp), `admin`
(auth/setup/dashboard/products/items/categories/orders/reels/banners/
testimonials/blog/settings/upload), `items` (public item/variant reads +
action-based admin dispatcher).

Frontend (`frontend/src/`): `lib/api.ts` (storefront client) +
`lib/admin-api.ts` (admin client) · contexts `CartContext` (localStorage
`gawdee_cart_v2`, client-side subtotal), `WishlistContext` (local + server
`{itemKey: [ids]}` map merge), `AuthContext`, `AdminAuthContext` ·
`types/index.ts` (`Product`, `Item`, `ItemVariant`, `VariantImage`,
`CartItem`, `Review`, `Order…`) · listing (`products/page.tsx`, family
grouping via `getFamilyKey`), PDP (`products/[slug]/page.tsx`, gallery +
variant chips + reviews), `VariantsDrawer`, `CartDrawer`,
`CheckoutStickyBar`, checkout (`checkout/page.tsx`, server-priced,
`checkout_token` idempotency, Razorpay/COD), admin console
(`admin/page.tsx`, ~1.5k lines, view-switched dashboard).

## 2. Existing relationships

```
categories (1 row: display/filter metadata, NOT a product taxonomy)
    ↕  NO FK — items.category / category_key are denormalized TEXT

items (9 rows: slug, name, flavor, description, image, hover_image,
       customer_review, category TEXT, category_key, tag, accent,
       rating, review_count, is_active, created/updated_at)
  │ 1 ── ∞
item_variants (28 rows: item_id → items.id [ONLY real FK],
       variant_name, slug, sku, stock_quantity, mrp, discount,
       price, is_inclusive_tax, image, legacy_product_id, is_active…)
  │ 1 ── ∞
item_images (0 rows: variant_id → item_variants.id [FK], image,
       sort_order, is_active, created/updated_at)

products (28 rows, legacy mirror: id TEXT slug-like, full_name, weight,
       stock, stock_status, source_id…; dual-written via sync mirrors;
       what the storefront list/detail APIs actually return, see §4)
```

## 3. Required model vs existing — gap table

| Required | Existing | Gap |
|---|---|---|
| Table `category` (`id, name, image_url, created_at, updated_at`) | Table `categories` (`id, name, filter, image, icon, sort_order, is_active, created_at, updated_at`) | **Name + columns differ** (`image` vs `image_url`; extra `filter/icon/sort/is_active`); no FK from items |
| `Item.ParentId → Item.Id` self-reference | No `parent_id` anywhere; `items` flat | **Missing** |
| Table `variant` (`id, item_id, mrp, selling_price, sku, uom, stock, is_inclusive, discount, created_at, updated_at`) | Table `item_variants` (`price` not `selling_price`; `stock_quantity` not `stock`; `variant_name` not `uom`; `is_inclusive_tax` not `is_inclusive`; + `slug, image, legacy_product_id, is_active`) | **Name + 4 columns differ**; FK `item_id → items.id` ✅ |
| Table `variant_image` (`id, name, variant_id, image_url, created_at, updated_at`) | Table `item_images` (no `name`; `image` not `image_url`) | **Name + 2 columns differ**; FK `variant_id` ✅ |
| DB `snake_case`, API `camelCase`/PascalCase | DB snake_case ✅; API returns **snake_case** JSON (raw dict rows; `map_variant_row` keys: `item_id, variant_name, stock_quantity, original_price…`) | **API casing gap** |
| No duplicate parent/item structures | `products` legacy mirror duplicates item+variant data row-for-row (28/28), kept in sync by `sync_*_mirror` helpers | **Duplication exists by design (compat)** |

## 4. Checklist findings (condensed)

1. **Item model**: `items` table + dict helpers (`get_items`, `get_item_with_variants`, `save_item_with_variants`); no class/DTO layer.
2. **Variant model**: `item_variants` + `get_variant_by_ref` (resolves numeric id / slug / legacy id / SKU); price derived `price(mrp, discount%)`.
3. **Image model**: `item_images` (+ per-variant `image` column); gallery = `item_images` rows → variant `image` → item `image` fallback (`map_variant_row`).
4. **Category model**: `categories` is display metadata only; products carry free-text `category`/`category_key`.
5. **Migrations**: none — `migrate()` runs `CREATE TABLE IF NOT EXISTS` + `INSERT OR IGNORE` seeds on boot (and per request via `db_dep`); no ALTER/versioning.
6. **Endpoints**: ~70 routes across 5 routers (full list verified §1); catalog served from variant-mapped rows; duplicate `GET /api/catalog` already removed.
7. **Product DTOs**: none — `map_variant_row()` builds the response dict (dual shape: new `item_id/variant_id/*` keys + legacy `id/slug/name/price/stock…` keys).
8. **Frontend types**: `Product` (legacy flat, what UI renders), `Item/ItemVariant/VariantImage` (mirror DB, barely consumed by UI).
9. **State**: cart/wishlist in Context + localStorage, server-merged; no Redux/Zustand.
10. **Variant selection**: catalog weight pills (`activeVariant` state), PDP variant chips, `VariantsDrawer`; all keyed off mapped rows.
11. **Gallery**: PDP thumbs + active image from `images[]` with fallbacks; empty `item_images` table in prod → falls back to variant/item image.
12. **Pricing**: server is truth (`checkout_pricing`: variant price → coupon `%` → threshold shipping); client previews only.
13. **Stock**: `stock_quantity` → mapped `stock`/`stock_status`; UI disables CTAs at `<= 0`; checkout re-validates + deducts.
14. **Cart**: id+qty lines, variant-aware ids, persisted locally, totals recomputed server-side at order time.
15. **Checkout**: `customer + items[{id,qty}] + checkout_token + coupon` → COD/Razorpay with verify + webhooks + stale-order expiry.
16. **Admin**: single-page console; items+variants CRUD, categories, orders, media, blog, settings; uploads → `$PUBLIC_DIR/assets/uploads/<folder>/` returning `/assets/uploads/…` URLs.
17. **Seeded/demo data**: `seed_defaults` writes settings + CMS copy only (`INSERT OR IGNORE`); **no demo products/users/orders**; prod DB holds 28 real products, 9 items, 28 variants.
18. **Hardcoded product data**: none remaining in UI (prior cleanup removed fallback catalogues; verified by grep — only Suspense/env/logo fallbacks).
19. **Response shape**: `{ok, products|product|variants|item|reviews…}`, snake_case keys, dual legacy/canonical fields.
20. **Uploads**: `POST /api/admin/upload` + `POST /api/items/admin/upload-image`; extension preserved, random names, old file deleted on replace; served as static frontend assets.

## 5. Problems found (for Phase 2)

- P1. Required table/column names do not exist (`category`, `variant`, `variant_image`, `parent_id`, `selling_price`, `uom`, `stock`, `is_inclusive`, `image_url`, `name` on images).
- P2. No migration framework — renames/additive changes need hand-written, idempotent SQL plus backfill (`categories→category`, `item_variants→variant`, data copy, FK rebuild since SQLite renames are limited).
- P3. `products` mirror doubles every product write path; renaming underneath it forces mirror + `map_variant_row` + all `sync_*` rewrites, or mirror retirement (bigger frontend touch).
- P4. API returns snake_case; moving to camelCase breaks every frontend consumer (`api.ts`, PDP, cards, cart, admin) at once — needs versioned or atomic FE+BE cutover.
- P5. `items.category` is free text; introducing `category_id` FK requires data mapping for the 9 existing items.
- P6. `ParentId` semantics undefined in spec (bundle? grouping? inheritance of images/price?) — behavior must be defined before schema.
- P7. `item_images` empty in prod and PDP gallery already degrades gracefully — new `name`/`image_url` fields need backfill rules.
- P8. `uom` vs `variant_name` ("500 ml", "1 Litre") — is `uom` the unit ("ml") requiring weight parsing, or a rename of `variant_name`? Ambiguous.

## 6. Files that will need modification (Phase 2, backlog only)

- DB: `backend/app/database.py` (DDL, helpers, seeds, mirror sync), new migration step(s).
- BE: `commerce.py` (pricing/stock/identity), `routers/{storefront,items,admin}.py`, `integrations.py` (OTP/stock refs if renamed).
- FE: `types/index.ts`, `lib/api.ts`, `products/page.tsx`, `products/[slug]/page.tsx`, `ProductCard.tsx`, `VariantsDrawer.tsx`, `CartContext.tsx`, `checkout/page.tsx`, `admin/page.tsx`, `lib/products-data.ts` (family grouping).
- Config/docs: `.env.example` if new tunables appear.

## 7–9. Changes required (summary)

- **Database**: create `category` (+ migrate `categories` data), add `items.parent_id` self-FK, create/rename to `variant` with required columns (decide `price→selling_price`, `variant_name→uom` or split), create/rename to `variant_image` (`name`, `image_url`), backfill, retire-or-repoint `products` mirror.
- **API**: new/renamed keys (casing decision), variant-CRUD payloads, category linkage, parent handling, upload responses.
- **Frontend**: type renames, gallery from `variant_image`, variant picker on new keys, cart/checkout/admin parity.

## 10. Risks

- SQLite has no transactional DDL safety net here and no migration runner — a bad rename can strand the prod file; **full file backup + isolated-copy rehearsal mandatory**.
- Dual-write mirror means any missed sync path silently diverges storefront pricing/stock.
- Atomic BE+FE rename has no versioning today; a partial deploy breaks checkout.
- Unresolved P6/P8 spec ambiguities will cause rework if guessed.

## 11. Migration strategy (proposal, not started)

1. Freeze spec answers (P6 parent semantics, P8 uom, casing cutover mode, mirror retire vs keep).
2. Backup prod SQLite; rehearse full migration on a copy with row-count + checksum asserts.
3. Additive-first: new tables/columns + backfill + dual-read; then switch writes; then drop legacy (expand–migrate–contract), keeping `map_variant_row` as the compat shim until the end.
4. Deploy BE+FE atomically (same host serves both); smoke-test the 20 flows from §4.

---
**Phase gate: STOP. Phase 2 (implementation) not started. Awaiting spec decisions in §5 (P6/P8) and approval.**
