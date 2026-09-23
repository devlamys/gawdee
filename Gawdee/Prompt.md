# GAWDEE — New Homepage Build Prompt (Reference: PDF + Screenshots, Feature-Flagged)

> Copy-paste this file phase-by-phase into OpenCode. Do NOT run all phases at once. Complete + verify each phase before next.
>
> Reference designs (source of truth for UI):
> - `temp/Html → Body.pdf`
> - `temp/Screenshot From 2026-09-18 18-53-15.png`
> - `temp/Screenshot From 2026-09-18 19-08-10.png`
> - `temp/Screenshot From 2026-09-18 19-08-17.png`
> - `temp/Screenshot From 2026-09-18 19-08-20.png`
> - `temp/Screenshot From 2026-09-18 19-08-23.png`
>
> Stack (do not change):
> - Frontend: Next.js 16.3.4 + React 19, vanilla CSS (`src/styles/*.css`, imported in `src/app/layout.tsx`), no Tailwind. Browser env only via `@/config/env`. API via `@/lib/api` (`/api` → backend). Money via `@/lib/utils.money()`, images via `resolveImageUrl()`, variants via `@/lib/catalog.ts`.
> - Backend: FastAPI + SQLite (`backend/app/database.py` `settings` table, `backend/app/routers/account.py` `GET /api/storefront`, `backend/app/routers/admin.py` `GET/POST /api/admin/settings`).
> - Admin UI: `frontend/src/app/admin/page.tsx` (?view=settings) + `frontend/src/lib/admin-api.ts` (`getSettings/saveSettings`).

---

## 0. Best OpenCode AI Skills to Enable First (recommended)

Enable these before Phase 1 for best output. If a skill is missing, install it, else proceed without it:

1. **frontend-design / ui-ux** — pixel-faithful section layout, spacing, typography, responsive breakpoints. Use for all Phase 3+ sections.
2. **nextjs-app-router / react-server-components** — `page.tsx` Server Component + Client sub-components pattern, `next.config.ts` `/api` rewrites, `revalidate` caching.
3. **fastapi-sqlite-backend** — `database.py` DEFAULT_SETTINGS + `get_setting/set_setting`, `account.py` public_keys allow-list, `admin.py` settings save.
4. **admin-panel-forms** — checkbox/boolean settings pattern in `admin/page.tsx` + `admin-api.ts`.
5. **css-vanilla-responsive** — new `src/styles/new-homepage.css` (no Tailwind), mobile-first, no global breakage.

> How to use: `/skill <name>` or select skill at session start, then paste Phase prompt below.

---

## GOLDEN RULES (apply to EVERY phase — non-negotiable)

1. **DO NOT break existing functionality.** No change to checkout, cart, auth, Razorpay/Delhivery/OTP/AI-chat, existing APIs.
2. **DO NOT delete / rewrite old homepage.** `frontend/src/app/page.tsx` current JSX + `AnimatedHero, ProductCard, RailButton, NewsletterForm, OfferPopup` must keep working as-is.
3. **Feature-flag approach only:**
   - New admin setting key: `use_new_homepage` (`"1"` = new, `"0"` = old, default `"0"`).
   - `false` → render EXACT current homepage. `true` → render new `<NewHomePage/>`.
   - No URL change. Same `/` route.
4. **Real backend data only.** Products from `api.catalog.getItems()`, categories from `api.catalog.getCategories()`, testimonials from `api.getTestimonials()`, offer/store flags from `api.getStorefront()`. Empty-state if fetch fails. NEVER hardcode prices / mock products. Static text/images only for marketing copy/icons already in `public/assets/`.
5. **Reuse shell:** Keep `StorefrontShell` (Header/Footer/CartDrawer/etc.) untouched. Only the body between header/footer switches.
6. **New code isolated:** New components in `src/components/new-home/` + one CSS file `src/styles/new-homepage.css`. Do not edit `globals.css`, `style.css`, `organic-storefront.css` except to import new file.
7. **After each phase:** `npm run lint`, `npm run build` (frontend), `uvicorn app.main:app --port 8001` smoke + `GET /api/storefront` + `GET /api/admin/settings` check.

---

## PHASE 1 — Backend + Admin Setting: `use_new_homepage` checkbox

**Goal:** Admin can toggle new homepage without code deploy.

**Backend tasks (`backend/`):**

1. `app/database.py`:
   - Add `"use_new_homepage": "0"` to `DEFAULT_SETTINGS`.
   - Ensure migration inserts it if `settings` table already exists (INSERT OR IGNORE pattern used for other keys).
2. `app/routers/account.py` (`GET /api/storefront`, ~line 293):
   - Add `use_new_homepage` to `public_keys` allow-list so storefront can read it.
   - Return value as `"0"/"1"` string (consistent with `offer_popup_enabled`).
3. `app/routers/admin.py` (`GET /api/admin/settings`, `POST /api/admin/settings` ~803-818):
   - No key-blocklist change needed, but verify generic `Dict` save accepts `use_new_homepage` and persists via UPSERT. Add explicit test.
   - Verify `GET` returns it.

**Frontend admin tasks (`frontend/`):**

4. `src/lib/admin-api.ts`: no API change (generic get/save), just verify `getSettings/saveSettings` pass through new key.
5. `src/app/admin/page.tsx` (settings view, ~line 1256, `handleSaveSettings` + `loadViewData`):
   - Add new section at TOP of Settings form: `Homepage Version` card.
   - UI: checkbox `Use New Home Page` + helper text: `ON = new reference design (PDF+screenshots). OFF = current live homepage. Safe to toggle anytime.`
   - Bind: `checked={settings.use_new_homepage === '1'}` → `onChange` sets `'1'/'0'`. Keep `Record<string,any>` pattern, save via existing `handleSaveSettings`.
   - Style with existing `admin.css` classes only.

**Verify:**
- `POST /api/admin/settings {"use_new_homepage":"1"}` → `GET` returns it.
- `GET /api/storefront` → `settings.use_new_homepage` present.
- Admin UI checkbox persists after reload, default OFF (`"0"`) on fresh DB.

---

## PHASE 2 — Frontend Router + Scaffold (no visual change yet)

**Goal:** `/` switches homepages by flag, old UI untouched.

1. Create `frontend/src/components/new-home/NewHomePage.tsx` (Client or Server wrapper — prefer Server, with Client sub-sections):
   - Props: `{ items, categories, testimonials, storeSettings }` passed from `page.tsx`.
   - V1: render placeholder `<section className="newhome-placeholder">New homepage coming in Phase 3+</section>` only.
2. Create `frontend/src/styles/new-homepage.css` with namespaced prefix `.nhp-*` only (zero global leakage). Import in `src/app/layout.tsx` or `page.tsx` (follow existing `@import "../styles/..."` pattern).
3. Edit `frontend/src/app/page.tsx`:
   - Fetch `storeRes.settings.use_new_homepage` alongside existing `offer_*` fetch (same try/catch pattern).
   - `const useNew = storeRes.settings.use_new_homepage === '1' || === true`.
   - `if (useNew) return <NewHomePage items={items} categories={categories} testimonials={testimonials} storeSettings={...} />`
   - Else return EXACT existing JSX unchanged.
4. Keep `OfferPopup`, `StorefrontShell` outside the branch (both versions get them).

**Verify:** flag OFF → pixel-identical old home. Flag ON → placeholder, no console errors, `npm run build` passes.

---

## PHASE 3 — Section 1: Hero + Trust Strip (PDF p.1)

**Reference:** PDF top: `1.2M+ Families Trust / Nature's Goodness, Traditionally Made / Shop Fresh Harvest + Explore Our Heritage / Zero Preservatives | FSSAI | Direct Farmer` + 5-icon strip.

- **Layout:** Full-width cream (`#FFF9F0`), centered eyebrow badge, H1 serif (Roboto Slab), sub-copy, 2 CTAs (solid green `Shop Fresh Harvest` → `#shop`, outline `Explore Our Heritage` → `#heritage/categories`), 3 mini-badges row. Below: 5-col trust strip (`100% NATIVE SOURCED / VEDIC BILONA CHURNED / WOOD & STONE PRESSED / 24+ LAB TESTS / 3,500+ FARMERS`) with icons from `public/assets/icons/trust/*.webp`.
- **UX:** H1 40-56px desktop → 30px mobile. Buttons 48px touch target. Trust strip scrolls horizontally on mobile (snap).
- **Code:** `new-home/NhpHero.tsx` + `.nhp-hero`, `.nhp-trust-strip` in `new-homepage.css`. Static copy OK. Links only, no backend call.
- **Done when:** Matches PDF spacing/typography, responsive, Lighthouse no CLS regression.

---

## PHASE 4 — Section 2: Explore GAWDEE Product Grid + Tabs (Screenshot 18-53-15)

**Reference:** `Explore GAWDEE / Traditional staples...` + pill tabs `All | A2 Ghee | Nutritions | Wellness | Raw Honey | Combos | Best Sellers | Bulk Family Savings` + 4 product cards with rating, name, pack, price/MRP, `You Save`, green `ADD`.

- **Layout:** 4-col grid desktop → 2-col tablet → horizontal snap rail mobile. Tab bar sticky-under-header on scroll (optional).
- **UX/Code:**
  - Component: `new-home/NhpExplore.tsx`. Props `items`.
  - Tabs filter client-side by `item.category` / tags; `All` default. Active pill dark green.
  - Card: reuse `ProductCard` if possible, else clone pattern: `firstValidVariant()`, `variantDiscountPercent()`, `money()`, `resolveImageUrl(itemCardImage())`, rating stars, `ADD` → existing cart context/drawer (do NOT build new cart).
  - `You Save ₹X (Y%)` computed, never hardcoded.
- **Done when:** Real products render, tab switching <100ms, ADD adds to same cart as old homepage.

---

## PHASE 5 — Section 3: Why Choose GAWDEE Ghee (Screenshot 19-08-10 top)

**Reference:** `THE GAWDEE STANDARD / Why Choose GAWDEE Ghee? / Pure by tradition...` + 4 cards with photo: `Sourced from Native Breeds / Traditionally Made Bilona Method / Pure & Unadulterated / Supports Farming Communities`.

- **Layout:** Light mint bg (`#EEF6F1`), 4-col → 2-col → 1-col. Each card: circular icon, title, 2-line copy (from PDF), rounded photo (`/assets/images/...` or existing story images — reuse, no new binary if missing, use CSS placeholder).
- **Code:** `new-home/NhpWhyGawdee.tsx`, static. `.nhp-why-*`.
- **Done when:** Matches screenshot card radius/shadow, images `resolveImageUrl`, alt text set.

---

## PHASE 6 — Section 4: Shop by Need Interactive (Screenshot 19-08-10 bottom)

**Reference:** Left lifestyle image + quote, right panel: tabs `Natural Sweetening | Everyday Cooking | Everyday Nutrition`, thumbnails (`Raw Forest Honey, Raw Ajwain Honey, Jaggery Powder, Burra Sugar, White Sugar`), `Raw Forest Honey / Choose your pack size / 350g 650g / Quantity / Total ₹699 / ADD TO CART`.

- **UX/Code:**
  - Component: `new-home/NhpShopByNeed.tsx` (Client, `useState` for activeNeed, activeProduct, packSize, qty).
  - Derive options from real `items` by name match (honey/sugar) with fallback to first 5 items — never empty, never mock price. Pack-size buttons switch variant (`firstValidVariant`), qty stepper, total = `variant.price * qty`, ADD → same cart.
  - Left image static + quote overlay.
- **Done when:** Switching product/pack/qty updates total correctly, ADD works.

---

## PHASE 7 — Section 5: Lab Tested + Batch Verify (Screenshot 19-08-17 top)

**Reference:** `LAB TESTED FOR QUALITY & PURITY / Only What Meets Our Standard Makes The Cut / Our Ghee is tested...` + 4 metric cards `99.91% Milk Fat / neg Baudouin Test / B.L.Q. Heavy Metals & Residues / 0.59% Free Fatty Acids` + `Have a GAWDEE bottle? Verify its lab report [GW-892][Verify]`.

- **Code:** `new-home/NhpLabTested.tsx` static metrics + verify form (Client). Verify button → link to existing `/lab-reports` or transparency page if exists, else `alert`/inline `Enter 6-digit code` validation (no new backend in this phase).
- **Layout:** White cards on mint bg, check icons, centered verify bar.
- **Done when:** Pixel-match, mobile stacks 2x2 → 1col.

---

## PHASE 8 — Section 6: Certifications Strip + Combos (Screenshot 19-08-17 bottom + 19-08-20 top)

**Reference:** `CERTIFIED & APPROVED BY PREMIER FOOD AUTHORITIES: FSSAI | Accredited Tested | GMP | Non-GMO | Jaivik Bharat` + `CURATED GAWDEE COMBOS / Better Together / See All Combo Packs` + 3 combo cards with `SAVE 22%` badge, image, title, desc, price/strike, `Best for...`, `ADD BUNDLE`.

- **Code:** `new-home/NhpCombos.tsx`. Cert strip static row. Combos: filter `items` where `category==combos` or name includes `Duo/Essentials`; if <3, show available + `See All` link to `/collections/combos`. `ADD BUNDLE` → cart (bundle = single item add; do NOT build custom bundle logic).
- **Done when:** Real combo data, badges computed from variant discount.

---

## PHASE 9 — Section 7: Quality You Can Trust + Reviews (Screenshot 19-08-20 bottom)

**Reference:** `ZERO COMPROMISE / Quality You Can Trust...` 5 cards (`Quality Ingredients, Traditional Processing, Hygienic Packaging, Product Transparency, Customer Support`) + `4.8/5 Based on Customer Reviews / Loved Across Indian Homes` 3 quote cards (`Pooja Sharma Jaipur, Ramesh Nair Kochi, Sunita Deshmukh Pune` + Verified Buyer).

- **Code:** `new-home/NhpTrustReviews.tsx`. Quality cards static. Reviews: map real `testimonials` prop (first 3); fallback to PDF quotes only if backend empty (label as examples, keep Verified Buyer badge).
- **Done when:** Stars, avatars/initials, responsive rail.

---

## PHASE 10 — Section 8: FAQ + Final Assembly + QA

**Reference:** `GOT QUESTIONS? / Frequently Asked Questions` 7 accordions (`What makes GAWDEE Ghee different... / Is Honey raw... / Bilona Method / Sulphur Free Sugar / Mixme ingredients / Taral Drop+Moringa use / shelf life`) + dark-green footer (reuse existing `Footer`, do NOT rebuild).

- **Code:** `new-home/NhpFaq.tsx` (Client accordion, `<details>` or `useState`, aria-expanded). Static Q&A from PDF (short answers, 2-3 lines each).
- **Assembly:** `NewHomePage.tsx` composes all sections in PDF order + `id` anchors (`#shop #heritage #combos #reviews #faq`). Single CSS import. Remove placeholder.
- **QA checklist (must pass):**
  - [ ] Flag OFF = old homepage byte-identical behavior; Flag ON = full new design.
  - [ ] No `process.env` in browser except via `@/config/env`.
  - [ ] `npm run lint && npm run build` green.
  - [ ] Mobile 360px, tablet 768px, desktop 1440px screenshots match references.
  - [ ] Cart/add, search, header/footer, OfferPopup work in BOTH modes.
  - [ ] No console errors, no hardcoded product data.

---

## How to run (for OpenCode agent)

> `Phase 1 only. Follow Golden Rules. Reference files listed at top. After code, show git diff summary + verification commands output. Stop, do not continue to next phase.`
>
> Then repeat with `Phase 2 only...`, `Phase 3 only...`, etc.

**Acceptance for whole project:** Admin toggles `Use New Home Page` → homepage swaps instantly (after revalidate ≤60s), old homepage restorable in one click, zero regressions.
