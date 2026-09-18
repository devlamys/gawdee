# Phase 2 — Database & Backend Domain Model Implementation

Follows `docs/product-variant-image-audit.md`. Backend only — **no frontend
files were modified** (API responses keep every legacy key; only new keys added).

## 1. Final schema (all `snake_case`)

```
category (id, name, filter, image_url, icon, sort_order, is_active, created_at, updated_at)
  1 ── ∞ (items.category_id, NULL allowed, ON DELETE SET NULL)
items (+ parent_id → items.id NULL/SET NULL, + category_id; all old columns kept)
  1 ── ∞ (variant.item_id, ON DELETE CASCADE)
variant (id, item_id, variant_name, slug, sku, stock←stock_quantity,
         mrp, discount, selling_price←price, is_inclusive←is_inclusive_tax DEFAULT 1,
         uom NEW, image, legacy_product_id, is_active, created/updated_at)
  1 ── ∞ (variant_image.variant_id, ON DELETE CASCADE)
variant_image (id, name NEW DEFAULT '', variant_id, image_url←image,
         sort_order, is_active, created/updated_at)
products mirror: UNCHANGED (dual-write sync preserved)
```

Renames executed via `ALTER TABLE … RENAME TO / RENAME COLUMN` — data, ids,
indexes and FK references moved with the tables, no copy.

## 2. Migration (`migrate_domain_v2`, `PRAGMA user_version = 2`)

Runs first inside `migrate()`, idempotent, safe per boot/request:
1. Table renames (skip when target exists).
2. **Self-heal**: new-empty + legacy-with-data → drop new, complete the rename
   (covers interrupted runs; both-populated state is left untouched).
3. Column renames (guarded), new nullable/defaulted columns.
4. `uom` backfill by parsing real `variant_name` (all 28 resolved: g/kg/ml/L/Litre).
5. Taxonomy backfill: distinct item `(category, category_key)` → `category`
   rows (1 preserved `Mix Me` id 1 merged with its uploaded image; 4 derived:
   Ghee/Honey/Natural sugar/Wellness); all 9 items linked, `parent_id` NULL.
6. Sets `user_version = 2`; second run is a no-op (verified).

Fresh DBs skip straight to the new DDL. No fake/demo rows created anywhere.

## 3. Discount truth (`calc_discount_percent`)

`discount = ((MRP − SellingPrice) / MRP) × 100`, rounded 2dp.
Rules: MRP ≤ 0 → `0.0` (no division by zero); SellingPrice > MRP → clamped
(MRP ≤ 0 with SellingPrice > 0 normalizes MRP up, matching the historic
read-path rule); negatives clamped to 0. Write precedence: explicit
SellingPrice wins (discount recomputed) → legacy discount-only payloads still
accepted → stored values preserved on unrelated edits. Verified: formula
reproduces all 28 stored discounts bit-for-bit.

## 4. Validation added

- **SKU**: `^[A-Za-z0-9][A-Za-z0-9._-]{1,98}$`, auto-gen `GWD-…` when empty,
  case-insensitive uniqueness (self excluded on update).
- **MRP/SellingPrice/Stock**: ints clamped (`0…10⁷` / `0…10⁶`); SellingPrice
  clamped to MRP.
- **UOM**: `^[A-Za-z]{1,10}$` or auto-parsed from variant name.
- **ItemId/VariantId**: must reference existing rows (variant ops 404 otherwise).
- **ImageUrl**: required, ≤500 chars, rejects `javascript:/data:/vbscript:`,
  markup, control chars; allows `https?://`, site-absolute and relative asset paths.
- **Category**: `category_id` must exist (else 422); create/update item enforce it.
- **ParentId**: nullable; must exist; never self; cycle walk (≤100 depth);
  orphans `SET NULL` on parent delete.

## 5. API compatibility (frontend untouched)

- Every existing response key/value preserved byte-for-byte; additions only:
  `selling_price, stock, is_inclusive, uom, parent_id, category_id` on mapped
  rows; `parent {id,slug,name}|null`, `child_ids[]`, `category {...}|null` on
  item detail; `name/image_url` on gallery images (plus legacy `image`).
- Admin `GET /categories` returns `image_url AS image` alias; POST accepts both
  `image` (legacy) and `image_url`.
- Endpoints/URLs unchanged; `products` mirror sync untouched.

## 6. Files changed

- `backend/app/database.py` — DDL, migration, validators, all read/write
  helpers, mirror sync, legacy-products bootstrap updated to new names.
- `backend/app/routers/admin.py` — categories CRUD → `category`/`image_url`
  (+ validation), `re`/`EmailStr` imports.
- `backend/app/routers/items.py`, `commerce.py`, `integrations.py`,
  `storefront.py`, `account.py`, `webhooks.py`, `main.py`, `session.py` —
  verified zero direct references to renamed tables; **no changes needed**.

## 7. Verification

- Rehearsed on isolated copies: legacy path, fresh path, interrupted-state
  self-heal, write paths (create/update/discount/image/parent-cycle/category/
  SKU/stock/URL rules), admin save round-trip, idempotent double-run.
- Production: backup taken first
  (`gawdee.sqlite.pre-phase2.bak`); post-apply asserts — version 2, counts
  5/9/28/28/0/1, category links complete, UOM complete, 28/28 discounts
  reproduce, `foreign_key_check` clean; API smoke (`/products`,
  `/products/<slug>`, `/storefront`, setup-status) green; frontend build green.
- No tests exist in-repo; rehearsal assert scripts served as tests (throwaway).

## 8. Operational notes

- The dev backend runs `uvicorn --reload`: it auto-migrated/reloaded during
  development — **always restart it after pulling these changes** (done here;
  `:8001` now serves the new code; verified via response keys).
- A pre-existing admin account in prod (`Iola Kemp`) was left untouched.
- Known non-goals for Phase 3 (frontend): admin UI still sends legacy
  `discount` echoes (backend resolves per §3); `Combo`/`products.php` legacy
  bits untouched.

---
**Phase gate: backend complete. Frontend changes explicitly deferred to Phase 3.**
