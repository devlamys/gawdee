# Gawdee UI Design Context

## Product character

Gawdee is an Indian wellness-food storefront with a practical commerce admin. Storefront surfaces should feel fresh, trustworthy, and ingredient-led; admin surfaces should stay quiet, dense, and optimized for repeated operational work.

## Visual system

- Brand green: `#0B7A62`; deep green: `#073C2B`; warm gold: `#8A6512`.
- Canvas: white with pale neutral surfaces around `#F8FAF9`; borders use restrained cool neutrals.
- Storefront typography follows the existing global type stack and expressive product-page scale.
- Admin typography follows the existing compact Inter-based scale, table density, status pills, and Phosphor icon language.
- Corners remain modest. Operational tables and controls use the established admin radii rather than decorative cards.

## Interaction contract

- Native buttons and links own all actions and navigation, with visible keyboard focus.
- Product reviews display publicly, but submission requires an authenticated customer and a completed purchase of that exact product.
- Search includes an explicit clear control. Sortable tables use button-based headers and expose `aria-sort`.
- Loading, empty, success, and inline error states reserve stable space and use plain, actionable language.
- Product-owned scrolling surfaces retain visible browser scrollbars and responsive overflow.

## Runtime ownership

The established CSS in `frontend/src/styles/` is the canonical runtime source. `new-pdp.css` owns product-detail presentation and `admin.css` owns administration views. New work extends those systems without introducing a second token framework.
