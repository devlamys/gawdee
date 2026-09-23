---
name: css-vanilla-responsive
description: Mobile-first vanilla CSS for homepage layouts without Tailwind, isolating styles to avoid global breakage.
---

# Vanilla CSS Responsive Layouts

## Directives
- Write clean, mobile-first modular CSS targeted to `src/styles/new-homepage.css`.
- Do not use Tailwind classes or external utility frameworks for these sections.
- Scope class selectors using BEM or unique section prefixes (e.g., `.gh-hero__*`, `.gh-card__*`) to avoid breaking existing styles.
- Use native CSS variables (`--primary-color`, `--space-md`, `--font-serif`) for token consistency across breakpoints (`min-width: 640px`, `1024px`, `1280px`).