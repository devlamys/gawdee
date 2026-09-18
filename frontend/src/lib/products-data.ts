// URL category-key normalization. Category labels/icons come from the
// backend (/catalog/categories); these keys match backend `filter` values.
export function normalizeCategory(cat?: string | null): string {
  if (!cat) return 'all';
  const c = cat.toLowerCase().trim();
  if (c === 'mixme' || c === 'nutrition') return 'nutrition';
  if (c === 'drops' || c === 'wellness') return 'wellness';
  if (c === 'ghee') return 'ghee';
  if (c === 'honey') return 'honey';
  if (c === 'sugar') return 'sugar';
  return 'all';
}
