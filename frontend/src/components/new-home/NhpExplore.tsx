'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CatalogItem } from '@/types';
import { useCart } from '@/context/CartContext';
import { money, resolveImageUrl } from '@/lib/utils';
import {
  firstValidVariant,
  isVariantAvailable,
  itemCardImage,
  variantCartLine,
  variantDiscountPercent,
} from '@/lib/catalog';

interface ExploreTab {
  key: string;
  label: string;
  icon: string;
  /** lowercase keywords matched against categoryKey/category/tag/name */
  keywords: string[];
}

const TABS: ExploreTab[] = [
  { key: 'all', label: 'All', icon: 'ph-squares-four', keywords: [] },
  { key: 'ghee', label: 'A2 Ghee', icon: 'ph-bowl-steam', keywords: ['ghee'] },
  { key: 'nutrition', label: 'Nutritions', icon: 'ph-grains', keywords: ['nutrition', 'mixme', 'moringa'] },
  { key: 'wellness', label: 'Wellness', icon: 'ph-leaf', keywords: ['wellness'] },
  { key: 'honey', label: 'Raw Honey', icon: 'ph-drop', keywords: ['honey'] },
  { key: 'combos', label: 'Combos', icon: 'ph-gift', keywords: ['combo', 'duo', 'bundle'] },
  { key: 'best', label: 'Best Sellers 🔥', icon: 'ph-fire', keywords: ['best', 'top rated', 'bestseller'] },
];

function matchesTab(item: CatalogItem, tab: ExploreTab): boolean {
  if (tab.key === 'all') return true;
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
        {badgeText && <span className="nhp-card__badge">{badgeText}</span>}
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
          <i className="ph-fill ph-star" aria-hidden="true"></i>
          {rating > 0 ? (
            <>
              <span>{rating.toFixed(1)}</span>
              {reviewCount > 0 && <small>({reviewCount} reviews)</small>}
            </>
          ) : (
            <small>New · No reviews yet</small>
          )}
        </div>

        <h3 className="nhp-card__title">
          <Link href={`/products/${item.slug}`}>{item.name}</Link>
        </h3>
        <p className="nhp-card__pack">{selected.variantName}</p>

        <div className="nhp-card__price">
          <strong>{money(selected.sellingPrice)}</strong>
          {selected.mrp > selected.sellingPrice && <s>{money(selected.mrp)}</s>}
        </div>
        {saved > 0 && (
          <p className="nhp-card__save">
            You Save {money(saved)}{discount > 0 && ` (${discount}%)`}
          </p>
        )}

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
              {selected.variantName} · {money(selected.sellingPrice)} <i className="ph ph-caret-down" aria-hidden="true"></i>
            </button>
          </div>
        ) : cartQty > 0 ? (
          <div className="nhp-stepper" aria-label={`Quantity of ${item.name} in bag`}>
            <button type="button" onClick={() => updateQuantity(String(selected.id), -1)} aria-label={`Remove one ${item.name} from bag`}>
              <i className="ph ph-minus" aria-hidden="true"></i>
            </button>
            <strong aria-live="polite">{cartQty}</strong>
            <button type="button" onClick={() => updateQuantity(String(selected.id), 1)} aria-label={`Add one more ${item.name} to bag`}>
              <i className="ph ph-plus" aria-hidden="true"></i>
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
            <i className="ph ph-shopping-bag" aria-hidden="true"></i> ADD
          </button>
        )}
      </div>
    </article>
  );
}

export function NhpExplore({ items }: { items: CatalogItem[] }) {
  const [activeTab, setActiveTab] = useState('all');

  const filtered = useMemo(() => {
    const tab = TABS.find((t) => t.key === activeTab) ?? TABS[0];
    return items.filter((item) => matchesTab(item, tab)).slice(0, 8);
  }, [items, activeTab]);

  return (
    <section className="nhp-explore" id="shop" aria-label="Explore Gawdee products">
      <div className="nhp-explore__inner">
        <h2 className="nhp-explore__title">Explore GAWDEE</h2>
        <p className="nhp-explore__sub">Traditional staples, thoughtfully made for everyday Indian homes.</p>

        <div className="nhp-tabs" role="tablist" aria-label="Filter products by collection">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`nhp-tab${activeTab === tab.key ? ' is-active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <i className={`ph ${tab.icon}`} aria-hidden="true"></i>
              {tab.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
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
              <NhpProductCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
