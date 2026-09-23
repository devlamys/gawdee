// URL category-key normalization. Category labels/icons come from the
// backend (/catalog/categories); these keys match backend `filter` values.
export function normalizeCategory(cat?: string | null): string {
  if (!cat) return 'all';
  return cat.toLowerCase().trim() || 'all';
}
