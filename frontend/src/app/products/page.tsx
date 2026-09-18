'use client';

import React, { Suspense, useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CatalogCategory, CatalogItem, CatalogVariant } from '@/types';
import { api } from '@/lib/api';
import { useCart } from '@/context/CartContext';
import { money, resolveImageUrl } from '@/lib/utils';
import { normalizeCategory } from '@/lib/products-data';
import {
  categoryIcon,
  firstValidVariant,
  isVariantAvailable,
  itemCardImage,
  itemHoverImage,
  variantCartLine,
  variantDiscountPercent,
} from '@/lib/catalog';

function CatalogProductCardItem({
  item,
  index,
}: {
  item: CatalogItem;
  index: number;
}) {
  const variants = item.variants ?? [];
  const [selectedId, setSelectedId] = useState<number | null>(
    () => firstValidVariant(item)?.id ?? null
  );
  const { addItem, openVariantsDrawer } = useCart();

  const selected = variants.find((v) => v.id === selectedId) ?? firstValidVariant(item);
  const isMultiVariant = variants.length > 1;

  const searchKeywords = (
    `${item.name} ${item.category} ${item.tag || ''} ${item.description || ''} ` +
    variants.map((v) => `${v.variantName} ${v.sku} ${v.uom}`).join(' ')
  ).toLowerCase();

  const discount = variantDiscountPercent(selected);
  const available = isVariantAvailable(selected);
  // Listing imagery is strictly item-level (ImageUrl, hover swap).
  // Variant imagery belongs to the detail gallery only.
  const mainImage = itemCardImage(item);
  const hoverImage = itemHoverImage(item);
  const [hovered, setHovered] = useState(false);
  const shownImage = hovered && hoverImage ? hoverImage : mainImage;

  const handleAdd = () => {
    if (!selected || !available) return;
    if (isMultiVariant) {
      openVariantsDrawer(item, variants);
    } else {
      addItem(variantCartLine(item, selected), 1, true);
    }
  };

  return (
    <article
      className="product-card catalog-product-card reveal is-visible"
      data-delay={(index % 4) * 40}
      data-category={item.categoryKey || item.category?.toLowerCase()}
      data-search-name={searchKeywords}
    >
      <Link
        className="product-card__media"
        href={`/products/${item.slug}`}
        style={{ '--product-accent': item.accent || '#d8a934' } as React.CSSProperties}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {item.tag && (
          <span className="product-card__tag">{item.tag}</span>
        )}
        {discount > 0 && (
          <span className="product-card__discount">{discount}% OFF</span>
        )}
        <img
          src={resolveImageUrl(shownImage)}
          alt={`${item.name} ${selected?.variantName || ''}`.trim()}
          loading="lazy"
        />
      </Link>
      <div className="product-card__body">
        <div className="product-card__meta">
          <span>{item.category}</span>
          <span>·</span>
          <span>{selected?.variantName || ''}</span>
        </div>
        <h3>
          <Link href={`/products/${item.slug}`}>
            {item.name}
          </Link>
        </h3>
        {item.description && (
          <p className="catalog-product-card__copy">{item.description}</p>
        )}
        <div className="catalog-product-card__rating">
          <span className="stars" aria-hidden="true">★★★★★</span>
          {Number(item.rating) > 0 ? (
            <>
              <strong>{Number(item.rating).toFixed(1)}</strong>
              <small>({Number(item.reviewCount) || 0})</small>
            </>
          ) : (
            <>
              <strong>New</strong>
              <small>No reviews yet</small>
            </>
          )}
        </div>
        {isMultiVariant && (
          <div className="card-variant-pills" aria-label="Select pack size">
            {variants.map((cv: CatalogVariant) => {
              const isCur = selected != null && cv.id === selected.id;
              const cvAvailable = isVariantAvailable(cv);
              return (
                <button
                  key={cv.id}
                  type="button"
                  className={`card-variant-pill ${isCur ? 'is-active' : ''}`}
                  onClick={() => setSelectedId(cv.id)}
                  aria-pressed={isCur}
                  aria-label={`${cv.variantName}, ${money(cv.sellingPrice)}${cvAvailable ? '' : ', sold out'}`}
                >
                  {cv.variantName}
                </button>
              );
            })}
          </div>
        )}
        <div className="product-card__buy">
          <div className="product-card__price">
            {selected ? (
              <>
                <strong>{money(selected.sellingPrice)}</strong>
                {selected.mrp > selected.sellingPrice && (
                  <s>{money(selected.mrp)}</s>
                )}
              </>
            ) : (
              <strong style={{ color: '#999', fontSize: '0.9rem' }}>Unavailable</strong>
            )}
          </div>
          <button
            className="add-button"
            type="button"
            onClick={handleAdd}
            disabled={!available}
            aria-label={selected ? `Add ${item.name} ${selected.variantName} to cart` : `Add ${item.name} to cart`}
          >
            <span>{!available ? 'Out of stock' : 'Add to cart'}</span>
          </button>
        </div>
      </div>
    </article>
  );
}

function CatalogContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>(() =>
    normalizeCategory(searchParams.get('category'))
  );
  const [searchQuery, setSearchQuery] = useState<string>(() =>
    searchParams.get('search') || ''
  );

  // Sync state when URL searchParams change
  useEffect(() => {
    const cat = normalizeCategory(searchParams.get('category'));
    setActiveCategory(cat);
    if (searchParams.has('search')) {
      setSearchQuery(searchParams.get('search') || '');
    }
  }, [searchParams]);

  // Listen to custom header category filter event for instant in-page switching
  useEffect(() => {
    const handleCategoryEvent = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail !== undefined) {
        setActiveCategory(normalizeCategory(customEvent.detail));
      }
    };
    window.addEventListener('gawdee:category-filter', handleCategoryEvent);
    return () => {
      window.removeEventListener('gawdee:category-filter', handleCategoryEvent);
    };
  }, []);

  // Fetch items + categories from the canonical backend API (real data only)
  useEffect(() => {
    setLoading(true);
    setLoadError('');
    Promise.all([api.catalog.getItems(), api.catalog.getCategories()])
      .then(([itemsRes, catsRes]) => {
        if (itemsRes.ok && Array.isArray(itemsRes.items)) {
          setItems(itemsRes.items);
        } else {
          setLoadError('Unable to load products.');
        }
        if (catsRes.ok && Array.isArray(catsRes.categories)) {
          setCategories(catsRes.categories.filter((c) => c.isActive !== 0));
        }
      })
      .catch(() => setLoadError('Unable to load products. Please check your connection and retry.'))
      .finally(() => setLoading(false));
  }, []);

  // Filter keys visible for the active category: the category itself plus
  // all descendant subcategories (cycle-safe).
  const visibleKeys = useMemo(() => {
    if (activeCategory === 'all') return null;
    const byId = new Map(categories.map((c) => [c.id, c]));
    const byKey = new Map<string, CatalogCategory>();
    for (const c of categories) {
      const k = (c.filter || '').toLowerCase();
      if (k && !byKey.has(k)) byKey.set(k, c);
    }
    const root = byKey.get(activeCategory);
    if (!root) return new Set([activeCategory]);
    const keys = new Set<string>();
    const visited = new Set<number>();
    const walk = (id: number) => {
      if (visited.has(id)) return;
      visited.add(id);
      const cat = byId.get(id);
      if (!cat) return;
      if (cat.filter) keys.add(cat.filter.toLowerCase());
      for (const c of categories) {
        if (c.parentId === id) walk(c.id);
      }
    };
    walk(root.id);
    return keys;
  }, [categories, activeCategory]);

  // Filter items by active category key and search query
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const catKey = (item.categoryKey || '').toLowerCase();
      if (visibleKeys && !visibleKeys.has(catKey)) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const allText = (
          (item.name || '') + ' ' +
          (item.category || '') + ' ' +
          (item.tag || '') + ' ' +
          (item.description || '') + ' ' +
          (item.variants ?? []).map((v) => `${v.variantName || ''} ${v.sku || ''} ${v.uom || ''}`).join(' ')
        ).toLowerCase();
        if (!allText.includes(q)) return false;
      }
      return true;
    });
  }, [items, visibleKeys, searchQuery]);

  const handleFilterClick = (key: string) => {
    setActiveCategory(key);
    const targetUrl = key === 'all' ? '/products' : `/products?category=${key}`;
    router.push(targetUrl, { scroll: false });
  };

  const pills = useMemo(() => {
    const list = [{ key: 'all', label: 'All Products', icon: categoryIcon('all') }];
    for (const c of categories) {
      const key = (c.filter || '').toLowerCase() || `cat-${c.id}`;
      if (list.some((p) => p.key === key)) continue;
      list.push({ key, label: c.name, icon: categoryIcon(c.filter) });
    }
    return list;
  }, [categories]);

  return (
    <section className="catalog-shell section" id="product-catalog" style={{ paddingTop: '155px' }}>
      <div className="container">
        {/* Category Toolbar matching PHP */}
        <div className="catalog-toolbar reveal is-visible">
          <div className="catalog-filters" role="group" aria-label="Filter products by category">
            {pills.map((cat) => (
              <button
                key={cat.key}
                type="button"
                data-filter={cat.key}
                className={activeCategory === cat.key ? 'is-active' : ''}
                onClick={() => handleFilterClick(cat.key)}
              >
                <i className={`ph ${cat.icon}`}></i>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
          <div className="catalog-search">
            <i className="ph ph-magnifying-glass"></i>
            <label className="sr-only" htmlFor="catalog-search-input">
              Search products
            </label>
            <input
              id="catalog-search-input"
              type="search"
              placeholder="Search products, ingredients…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-catalog-search
              autoComplete="off"
            />
          </div>
        </div>

        {/* Results head info */}
        <div className="catalog-results-head reveal is-visible">
          <span className="catalog-badge">
            <i className="ph ph-shield-check"></i> 100% Certified Authentic
          </span>
          <span data-catalog-count style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
            {filteredItems.length} item{filteredItems.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* Product Cards Grid, Loading, Error or Empty State */}
        {loading ? (
          <div className="product-empty catalog-empty" style={{ textAlign: 'center', padding: '4rem 0', color: '#888' }}>
            <i className="ph ph-spinner ph-spin" style={{ fontSize: '2rem', color: '#005c4e' }}></i>
            <p style={{ marginTop: '0.8rem' }}>Loading Gawdee products…</p>
          </div>
        ) : loadError && items.length === 0 ? (
          <div className="product-empty catalog-empty" data-product-empty>
            <i className="ph ph-warning-circle"></i>
            <h2>Unable to load products</h2>
            <p>{loadError}</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="product-empty catalog-empty" data-product-empty>
            <i className="ph ph-magnifying-glass"></i>
            <h2>{items.length === 0 ? 'No products available.' : 'No matching products found'}</h2>
            <p>{items.length === 0 ? 'Please check back soon — fresh batches are on their way.' : 'Try searching for another keyword or select a different category filter.'}</p>
          </div>
        ) : (
          <div
            className="product-grid catalog-product-grid"
            data-product-grid
            data-initial-category={activeCategory}
          >
            {filteredItems.map((item, idx) => (
              <CatalogProductCardItem key={item.id} item={item} index={idx} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: '160px 0 60px', textAlign: 'center' }}>
          <i className="ph ph-spinner ph-spin" style={{ fontSize: '2rem', color: '#009a84' }}></i>
          <p style={{ marginTop: '0.8rem', color: '#666' }}>Loading Gawdee products…</p>
        </div>
      }
    >
      <CatalogContent />
    </Suspense>
  );
}
