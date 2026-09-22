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
  categoryVisual,
  isVariantAvailable,
  variantCardImages,
  variantCartLine,
  variantDiscountPercent,
} from '@/lib/catalog';

function CatalogProductCardItem({
  item,
  variant,
  index,
}: {
  item: CatalogItem;
  variant: CatalogVariant;
  index: number;
}) {
  const { addItem } = useCart();

  // One card per variant: this card is fixed to its own variant.
  const selected = variant;

  const searchKeywords = (
    `${item.name} ${item.category} ${item.tag || ''} ${item.description || ''} ` +
    `${variant.variantName} ${variant.sku} ${variant.uom}`
  ).toLowerCase();

  const discount = variantDiscountPercent(selected);
  const available = isVariantAvailable(selected);
  const rating = Number(item.rating) || 0;
  const reviewCount = Number(item.reviewCount) || 0;
  // Listing imagery follows the selected variant: first gallery image shows
  // by default, second image swaps in on hover (backend imagePreview order).
  const [firstImage, secondImage] = variantCardImages(item, selected);
  const [hovered, setHovered] = useState(false);
  const shownImage = hovered && secondImage ? secondImage : firstImage;

  const handleAdd = () => {
    if (!selected || !available) return;
    addItem(variantCartLine(item, selected), 1, true);
  };

  return (
    <article
      className="product-card catalog-product-card nhp-combo reveal is-visible"
      style={{ width: '100%', flex: 'none', scrollSnapAlign: 'none', minWidth: 'auto', margin: 0 }}
      data-delay={(index % 4) * 40}
      data-category={item.categoryKey || item.category?.toLowerCase()}
      data-search-name={searchKeywords}
    >
      <Link
        className="nhp-combo__media"
        href={`/products/${item.slug}`}
        style={{ '--product-accent': item.accent || '#d8a934' } as React.CSSProperties}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >

        {discount > 0 && (
          <span className="nhp-combo__save">{discount}% OFF</span>
        )}
        <img
          src={resolveImageUrl(shownImage)}
          alt={`${item.name} ${selected?.variantName || ''}`.trim()}
          loading="lazy"
        />
        {rating >= 4.7 && reviewCount > 10 && (
          <span
            className="nhp-card__top-rated"
            style={{
              position: 'absolute',
              bottom: '10px',
              left: '10px',
              background: '#154a3e',
              color: '#fff',
              fontSize: '0.72rem',
              fontWeight: '700',
              padding: '4px 8px',
              borderRadius: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
              border: '1px solid #d4a933',
              zIndex: 2,
            }}
          >
            <i className="ph-fill ph-star" style={{ color: '#f3c43f', fontSize: '0.85rem' }}></i> Top Rated Choice
          </span>
        )}
      </Link>
      <div className="nhp-combo__body">
        {item.tag && (
          <p className="nhp-combo__category">{item.tag}</p>
        )}
        <h3 className="nhp-combo__title">
          <Link href={`/products/${item.slug}`}>
            {item.name} - {item.category} {selected?.variantName ? `· ${selected.variantName}` : ''}
          </Link>
        </h3>
        {item.description && (
          <p className="nhp-combo__desc">
            <span className="nhp-combo__desc--desktop">
              {item.description.length > 434
                ? item.description.substring(0, 434) + '...'
                : item.description}
            </span>
            <span className="nhp-combo__desc--mobile">
              {item.description.length > 100
                ? item.description.substring(0, 100) + '...'
                : item.description}
            </span>
          </p>
        )}
        <div className="catalog-product-card__rating" style={{ marginBottom: '12px' }}>
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
        <div className="nhp-combo__footer">
          <div className="nhp-combo__meta">
            <div className="nhp-combo__price">
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
          </div>
          <button
            className="nhp-combo__add"
            type="button"
            onClick={handleAdd}
            disabled={!available}
            aria-label={selected ? `Add ${item.name} ${selected.variantName} to cart` : `Add ${item.name} to cart`}
          >
            <i className="ph ph-shopping-cart-simple" aria-hidden="true"></i> {!available ? 'Out of stock' : 'ADD'}
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

  // One card per variant: an item with 3 variants lists 3 products.
  const variantCards = useMemo(() => {
    const out: { item: CatalogItem; variant: CatalogVariant }[] = [];
    for (const item of filteredItems) {
      for (const v of item.variants ?? []) {
        out.push({ item, variant: v });
      }
    }
    return out;
  }, [filteredItems]);

  const handleFilterClick = (key: string) => {
    setActiveCategory(key);
    const targetUrl = key === 'all' ? '/products' : `/products?category=${key}`;
    router.push(targetUrl, { scroll: false });
  };

  const pills = useMemo(() => {
    const list = [{ key: 'all', label: 'All Products', visual: categoryVisual(null, 'all') }];
    for (const c of categories) {
      const key = (c.filter || '').toLowerCase() || `cat-${c.id}`;
      if (list.some((p) => p.key === key)) continue;
      list.push({ key, label: c.name, visual: categoryVisual(c) });
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
                {cat.visual.kind === 'image' ? (
                  <img src={resolveImageUrl(cat.visual.src)} alt="" aria-hidden="true" style={{ width: '1.2em', height: '1.2em', objectFit: 'contain' }} />
                ) : (
                  <i className={cat.visual.className}></i>
                )}
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
            {variantCards.length} product{variantCards.length === 1 ? '' : 's'}
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
        ) : variantCards.length === 0 ? (
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
            {variantCards.map(({ item, variant }, idx) => (
              <CatalogProductCardItem key={variant.id} item={item} variant={variant} index={idx} />
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
