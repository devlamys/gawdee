'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CatalogCategory, CatalogItem, Combo } from '@/types';
import { api } from '@/lib/api';
import { useCart } from '@/context/CartContext';
import { money, resolveImageUrl } from '@/lib/utils';
import {
  exploreTabVisual,
  firstValidVariant,
  isVariantAvailable,
  itemCardImage,
  variantCartLine,
  variantDiscountPercent,
} from '@/lib/catalog';
import { comboDetailHref } from './NhpCombos';

interface ExploreTab {
  key: string;
  label: string;
  icon: string;
  /** lowercase keywords matched against categoryKey/category/tag/name */
  keywords: string[];
  kind: 'all' | 'category' | 'combos' | 'best';
  categoryId?: number | null;
  filter?: string;
}

/** Fixed special tabs; category tabs are injected dynamically between All and Combos. */
const SPECIAL_TABS: ExploreTab[] = [
  { key: 'all', label: 'All', icon: 'ph-squares-four', keywords: [], kind: 'all' },
  { key: 'combos', label: 'Combos', icon: 'ph-gift', keywords: ['combo', 'duo', 'bundle'], kind: 'combos' },
  { key: 'best', label: 'Best Sellers 🔥', icon: 'ph-fire', keywords: ['best', 'top rated', 'bestseller'], kind: 'best' },
];

function buildTabs(categories: CatalogCategory[]): ExploreTab[] {
  const tabs: ExploreTab[] = [SPECIAL_TABS[0]];
  const seen = new Set(['all']);
  for (const c of categories) {
    if ((c.isActive ?? 1) === 0) continue;
    const key = (c.filter || '').toLowerCase().trim() || `cat-${c.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tabs.push({
      key,
      label: c.name,
      icon: (c.icon || '').trim() || 'ph-squares-four',
      keywords: [],
      kind: 'category',
      categoryId: c.id,
      filter: c.filter,
    });
  }
  tabs.push(SPECIAL_TABS[1], SPECIAL_TABS[2]);
  return tabs;
}

function matchesTab(item: CatalogItem, tab: ExploreTab): boolean {
  if (tab.kind === 'all') return true;
  if (tab.kind === 'category') {
    if (tab.categoryId != null && (item.categoryId ?? null) === tab.categoryId) return true;
    const f = (tab.filter || tab.key).toLowerCase();
    return (item.categoryKey || '').toLowerCase() === f;
  }
  const haystack = `${item.categoryKey || ''} ${item.category || ''} ${item.tag || ''} ${item.name || ''}`.toLowerCase();
  return tab.keywords.some((kw) => haystack.includes(kw));
}

function NhpProductCard({ item }: { item: CatalogItem }) {
  const { addItem, updateQuantity, openVariantsDrawer, items: cartItems } = useCart();
  const variants = item.variants ?? [];
  const hasVariants = variants.length > 1;

  // Deterministic default: first valid backend variant (no invented pricing).
  // Multi-variant items choose their pack via the shared variants drawer.
  const selected = firstValidVariant(item);

  const rating = Number(item.rating) || 0;
  const reviewCount = Number(item.reviewCount) || 0;
  const badgeText = (item.tag || '').trim();
  const discount = variantDiscountPercent(selected);
  const available = isVariantAvailable(selected);
  const image = itemCardImage(item);
  const cartQty = selected ? (cartItems.find((i) => i.id === String(selected.id))?.quantity ?? 0) : 0;
  const saved = selected && selected.mrp > selected.sellingPrice ? selected.mrp - selected.sellingPrice : 0;

  const handleAdd = () => {
    if (!selected || !available) return;
    if (hasVariants) {
      openVariantsDrawer(item, variants);
      return;
    }
    addItem(variantCartLine(item, selected), 1, true);
  };

  if (!selected) return null;

  return (
    <article className="nhp-card" data-category={item.categoryKey || item.category?.toLowerCase()}>
      <Link className="nhp-card__media" href={`/products/${item.slug}`} aria-label={item.name}>
        {badgeText && (badgeText.includes('OFF') || (badgeText === 'Bulk Family Savings' && item.id === 4)) && (
          <span className="nhp-combo__save">{badgeText}</span>
        )}
        {item.id === 1 && discount > 0 && (
          <span className="nhp-combo__save">{discount}% OFF</span>
        )}
        <button type="button" className="nhp-card__wishlist" aria-label="Add to wishlist">
          <i className="ph ph-heart"></i>
        </button>
        {image ? (
          <img src={resolveImageUrl(image)} alt={item.name} loading="lazy" />
        ) : (
          <span className="nhp-card__noimage" aria-hidden="true">
            <i className="ph ph-image"></i>
          </span>
        )}
      </Link>

      <div className="nhp-card__body">
        <div className="nhp-card__rating">
          <div style={{ display: 'flex', gap: '2px' }}>
            <i className="ph-fill ph-star" aria-hidden="true"></i>
            <i className="ph-fill ph-star hide-on-mobile-star" aria-hidden="true"></i>
            <i className="ph-fill ph-star hide-on-mobile-star" aria-hidden="true"></i>
            <i className="ph-fill ph-star hide-on-mobile-star" aria-hidden="true"></i>
            <i className="ph-fill ph-star hide-on-mobile-star" aria-hidden="true"></i>
          </div>
          {rating > 0 ? (
            <>
              <span>{rating.toFixed(1)}</span>
              {reviewCount > 0 && <small>({reviewCount} reviews)</small>}
            </>
          ) : (
            <small>New · No reviews yet</small>
          )}
        </div>

        {badgeText && !(badgeText.includes('OFF') || (badgeText === 'Bulk Family Savings' && item.id === 4)) && (
          <p className="nhp-combo__category">{badgeText}</p>
        )}
        <h3 className="nhp-card__title">
          <Link href={`/products/${item.slug}`}>{item.name} - {selected.variantName}</Link>
        </h3>
        {item.description && (
          <>
            <p className="nhp-card__desc nhp-card__desc--desktop" style={{ fontSize: '0.85rem', color: '#7a8a80', marginTop: '2px', margin: 0, textAlign: 'justify' }}>
              {item.description.length > 200 ? `${item.description.substring(0, 200)}...` : item.description}
            </p>
            <p className="nhp-card__desc nhp-card__desc--mobile" style={{ fontSize: '0.85rem', color: '#7a8a80', marginTop: '2px', margin: 0, textAlign: 'justify' }}>
              {item.description.length > 151 ? `${item.description.substring(0, 151)}...` : item.description}
            </p>
          </>
        )}

        <div className="nhp-card__bottom" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
          <div className="nhp-card__price-wrap" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="nhp-card__price">
              <strong>{money(selected.sellingPrice)}</strong>
              {selected.mrp > selected.sellingPrice && <s>{money(selected.mrp)}</s>}
            </div>

          </div>

          {!available ? (
            <button type="button" className="nhp-card__add" disabled>
              Out of stock
            </button>
          ) : hasVariants ? (
            <div className="nhp-card__variants" role="group" aria-label={`Choose a pack size for ${item.name}`}>
              <button
                type="button"
                className="nhp-card__add"
                onClick={() => openVariantsDrawer(item, variants)}
                aria-label={`Choose a pack size for ${item.name}`}
              >
                <i className="ph ph-shopping-cart-simple" aria-hidden="true"></i> ADD
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="nhp-card__add"
              data-add-to-cart
              onClick={handleAdd}
              aria-label={`Add ${item.name} to bag`}
            >
              <i className="ph ph-shopping-cart-simple" aria-hidden="true"></i> ADD
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/** Admin-managed combo rendered as an explore-grid card when the Combos tab is active. */
function NhpExploreComboCard({ combo }: { combo: Combo }) {
  const { addItem } = useCart();
  const savePercent = Number(combo.savePercent ?? combo.save_percent ?? 0) || 0;
  const sellingPrice = Number(combo.sellingPrice ?? combo.selling_price ?? 0) || 0;
  const mrp = Number(combo.mrp ?? 0) || 0;
  const href = comboDetailHref(combo);
  const image = (combo.image || '').trim();

  const handleAdd = () => {
    if (!(sellingPrice > 0)) return;
    addItem(
      {
        id: `combo-${combo.slug}`,
        name: combo.title,
        price: sellingPrice,
        original_price: mrp > sellingPrice ? mrp : sellingPrice,
        image: combo.image || '',
        type: 'combo',
        bundle_ids: [combo.productOneRef || combo.product_one_ref, combo.productTwoRef || combo.product_two_ref].filter(
          Boolean
        ) as string[],
      },
      1,
      true
    );
  };

  return (
    <article className="nhp-card" data-category="combos">
      <Link className="nhp-card__media" href={href} aria-label={combo.title}>
        {savePercent > 0 && (
          <span className="nhp-combo__save">{savePercent}% OFF</span>
        )}
        {image ? (
          <img src={resolveImageUrl(image)} alt={combo.alt || combo.title} loading="lazy" />
        ) : (
          <span className="nhp-card__noimage" aria-hidden="true">
            <i className="ph ph-image"></i>
          </span>
        )}
      </Link>

      <div className="nhp-card__body">
        <h3 className="nhp-card__title">
          <Link href={href}>{combo.title} - {combo.category || 'Gawdee Combo'}</Link>
        </h3>
        {(combo.details || combo.description) && (
          <p className="nhp-card__desc nhp-card__desc--desktop" style={{ fontSize: '0.85rem', color: '#7a8a80', marginTop: '2px', margin: 0, textAlign: 'justify' }}>
            {(combo.details || combo.description).length > 200
              ? `${(combo.details || combo.description).substring(0, 200)}...`
              : (combo.details || combo.description)}
          </p>
        )}

        <div className="nhp-card__bottom" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
          <div className="nhp-card__price-wrap" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="nhp-card__price">
              <strong>{money(sellingPrice)}</strong>
              {mrp > sellingPrice && <s>{money(mrp)}</s>}
            </div>
          </div>

          <button
            type="button"
            className="nhp-card__add"
            data-add-to-cart
            onClick={handleAdd}
            disabled={!(sellingPrice > 0)}
            aria-label={`Add ${combo.title} bundle to bag`}
          >
            <i className="ph ph-shopping-cart-simple" aria-hidden="true"></i> ADD
          </button>
        </div>
      </div>
    </article>
  );
}

export function NhpExplore({ items, categories = [] }: { items: CatalogItem[]; categories?: CatalogCategory[] }) {
  const [activeTab, setActiveTab] = useState('all');
  const [combos, setCombos] = useState<Combo[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .getCombos()
      .then((res) => {
        if (!cancelled) setCombos(res.combos || []);
      })
      .catch(() => {
        if (!cancelled) setCombos([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tabs = useMemo(() => buildTabs(categories), [categories]);

  const filtered = useMemo(() => {
    const tab = tabs.find((t) => t.key === activeTab) ?? tabs[0];
    const matchingItems = items.filter((item) => matchesTab(item, tab));
    
    // Flatten into individual variants
    const allVariants: (CatalogItem & { _variantKey: string })[] = [];
    matchingItems.forEach(item => {
      const activeVariants = (item.variants || []).filter(v => v.isActive !== 0);
      if (activeVariants.length === 0) {
        allVariants.push({ ...item, _variantKey: `item-${item.id}` });
      } else {
        activeVariants.forEach(v => {
          allVariants.push({
            ...item,
            _variantKey: `variant-${v.id}`,
            variants: [v] // Force single variant so NhpProductCard doesn't show dropdown
          });
        });
      }
    });

    // Sort by category alphabetically
    allVariants.sort((a, b) => {
      const catA = (a.category || '').toLowerCase();
      const catB = (b.category || '').toLowerCase();
      if (catA < catB) return -1;
      if (catA > catB) return 1;
      return 0;
    });

    return allVariants;
  }, [items, tabs, activeTab]);

  const isCombosTab = activeTab === 'combos';

  return (
    <section className="nhp-explore" id="shop" aria-label="Explore Gawdee products">
      <div className="nhp-explore__inner">
        <h2 className="nhp-explore__title">Explore GAWDEE</h2>
        <p className="nhp-explore__sub">Traditional staples, thoughtfully made for everyday Indian homes.</p>

        <div className="nhp-tabs" role="tablist" aria-label="Filter products by collection">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`nhp-tab${activeTab === tab.key ? ' is-active' : ''} ${tab.key === 'best' ? 'is-highlight' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span className="nhp-tab-icon">
                {(() => {
                  const visual = exploreTabVisual(tab, categories);
                  return visual.kind === 'image' ? (
                    <img src={resolveImageUrl(visual.src)} alt="" aria-hidden="true" style={{ width: '1.4em', height: '1.4em', objectFit: 'contain' }} />
                  ) : (
                    <i className={visual.className} aria-hidden="true"></i>
                  );
                })()}
              </span>
              <span className="nhp-tab-label">{tab.label}</span>
            </button>
          ))}
        </div>

        {isCombosTab ? (
          combos.length === 0 ? (
            <div className="nhp-explore__empty">
              <i className="ph ph-gift" aria-hidden="true"></i>
              <p>No combo packs yet — fresh bundles are being curated.</p>
              <Link className="nhp-explore__all" href="/products?category=combos">
                View all products <i className="ph ph-arrow-right" aria-hidden="true"></i>
              </Link>
            </div>
          ) : (
            <div className="nhp-grid" aria-label="Combo packs">
              {combos.slice(0, 8).map((combo) => (
                <NhpExploreComboCard key={combo.id} combo={combo} />
              ))}
            </div>
          )
        ) : filtered.length === 0 ? (
          <div className="nhp-explore__empty">
            <i className="ph ph-package" aria-hidden="true"></i>
            <p>No products in this collection yet — fresh batches are on their way.</p>
            <Link className="nhp-explore__all" href="/products">
              View all products <i className="ph ph-arrow-right" aria-hidden="true"></i>
            </Link>
          </div>
        ) : (
          <div className="nhp-grid" aria-label="Products">
            {filtered.map((item) => (
              <NhpProductCard key={(item as any)._variantKey} item={item} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
