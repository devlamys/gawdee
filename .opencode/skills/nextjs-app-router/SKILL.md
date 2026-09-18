---
name: nextjs-app-router
description: Next.js App Router patterns, React Server Components (RSC), page.tsx composition, rewrites, and caching.
---

# Next.js App Router & RSC Pattern

## Directives
- Keep default `page.tsx` as an asynchronous React Server Component (RSC) to handle server-side data fetching and metadata.
- Extract interactive elements (state, filters, modals, cart actions) into isolated Client sub-components marked with `'use client'`.
- Use `next.config.ts` rewrites for backend `/api` proxying without CORS friction.
- Implement explicit revalidation strategies (`revalidateTag`, `revalidatePath`, route segment configs) to prevent stale cache.