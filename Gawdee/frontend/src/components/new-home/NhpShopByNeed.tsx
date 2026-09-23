'use client';

import { useMemo, useState } from 'react';
import { CatalogItem, CatalogVariant } from '@/types';
import { useCart } from '@/context/CartContext';
import { money, resolveImageUrl } from '@/lib/utils';
import { firstValidVariant, isVariantAvailable, itemCardImage, variantCartLine } from '@/lib/catalog';

interface Need {
  key: string;
  label: string;
  keywords: string[];
}

const NEEDS: Need[] = [
  { key: 'sweetening', label: 'Natural Sweetening', keywords: ['honey', 'sugar', 'jaggery', 'khand', 'bura', 'burra'] },
  { key: 'cooking', label: 'Everyday Cooking', keywords: ['ghee', 'oil'] },
  { key: 'nutrition', label: 'Everyday Nutrition', keywords: ['mixme', 'moringa', 'taral', 'choco', 'elaichi', 'vanilla', 'wellness', 'nutrition'] },
];

function matchesNeed(item: CatalogItem, need: Need): boolean {
  const haystack = `${item.categoryKey || ''} ${item.category || ''} ${item.name || ''}`.toLowerCase();
  return need.keywords.some((kw) => haystack.includes(kw));
}

function optionsFor(items: CatalogItem[], need: Need): CatalogItem[] {
  const matched = items.filter((item) => matchesNeed(item, need) && firstValidVariant(item));
  if (matched.length > 0) return matched.slice(0, 5);
  return items.filter((item) => firstValidVariant(item)).slice(0, 5);
}

export function NhpShopByNeed({ items }: { items: CatalogItem[] }) {
  const { addItem } = useCart();
  const [activeNeed, setActiveNeed] = useState(NEEDS[0].key);
  const [activeItemId, setActiveItemId] = useState<number | null>(null);
  const [activeVariantId, setActiveVariantId] = useState<number | null>(null);
  const [qty, setQty] = useState(1);

  const need = NEEDS.find((n) => n.key === activeNeed) ?? NEEDS[0];
  const options = useMemo(() => optionsFor(items, need), [items, need]);

  const activeItem: CatalogItem | null = useMemo(() => {
    if (options.length === 0) return null;
    return options.find((o) => o.id === activeItemId) ?? options[0];
  }, [options, activeItemId]);

  const activeVariant: CatalogVariant | null = useMemo(() => {
    if (!activeItem) return null;
    const variants = activeItem.variants ?? [];
    return variants.find((v) => v.id === activeVariantId) ?? firstValidVariant(activeItem);
  }, [activeItem, activeVariantId]);

  const available = isVariantAvailable(activeVariant);
  const total = activeVariant ? activeVariant.sellingPrice * qty : 0;

  const selectNeed = (key: string) => {
    setActiveNeed(key);
    setActiveItemId(null);
    setActiveVariantId(null);
    setQty(1);
  };

  const selectItem = (id: number) => {
    setActiveItemId(id);
    setActiveVariantId(null);
    setQty(1);
  };

  const handleAdd = () => {
    if (!activeItem || !activeVariant || !available) return;
    addItem(variantCartLine(activeItem, activeVariant), qty, true);
  };

  return (
    <section className="nhp-need" aria-label="Shop by need">
      <div className="nhp-need__inner">
        <p className="nhp-need__eyebrow">Intentional Living</p>
        <h2 className="nhp-need__title">Shop by Need</h2>
        <p className="nhp-need__sub">Curated companion staples designed for your routine.</p>

        <div className="nhp-need__panel">
          <div className="nhp-need__media">
            <img
              src="/assets/images/catalog-hero-complete-pantry-v1.png"
              alt="Gawdee pantry staples arranged for everyday routines"
              loading="lazy"
            />
            <blockquote className="nhp-need__quote">&ldquo;Nature&rsquo;s sweetness in every spoon.&rdquo;</blockquote>
          </div>

          <div className="nhp-need__config">
            <div className="nhp-need__tabs" role="tablist" aria-label="Shop by need">
              {NEEDS.map((n) => (
                <button
                  key={n.key}
                  type="button"
                  role="tab"
                  aria-selected={activeNeed === n.key}
                  className={`nhp-need__tab${activeNeed === n.key ? ' is-active' : ''}`}
                  onClick={() => selectNeed(n.key)}
                >
                  {n.label}
                </button>
              ))}
            </div>

            {activeItem && activeVariant ? (
              <>
                <div className="nhp-need__thumbs" role="group" aria-label="Choose a product">
                  {options.map((opt) => {
                    const thumb = itemCardImage(opt);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        className={`nhp-need__thumb${opt.id === activeItem.id ? ' is-active' : ''}`}
                        onClick={() => selectItem(opt.id)}
                        aria-pressed={opt.id === activeItem.id}
                        aria-label={opt.name}
                        title={opt.name}
                      >
                        <div className="nhp-need__thumb-box">
                          {thumb ? (
                            <img src={resolveImageUrl(thumb)} alt="" loading="lazy" />
                          ) : (
                            <i className="ph ph-image" aria-hidden="true"></i>
                          )}
                        </div>
                        <span className="nhp-need__thumb-label">
                          {opt.name.replace('Nutrition Powder', '').replace('Gir Cow Bilona', '')}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="nhp-need__details">
                  <h3 className="nhp-need__product">{activeItem.name}</h3>
                  <p className="nhp-need__hint">Choose your pack size</p>

                  <div className="nhp-need__packs" role="group" aria-label="Choose a pack size">
                    {(activeItem.variants ?? []).map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className={`nhp-need__pack${v.id === activeVariant.id ? ' is-active' : ''}`}
                        onClick={() => setActiveVariantId(v.id)}
                        aria-pressed={v.id === activeVariant.id}
                        disabled={!isVariantAvailable(v)}
                      >
                        <i className="ph ph-leaf" aria-hidden="true"></i>
                        <div className="nhp-need__pack-info">
                          <strong>{v.variantName}</strong>
                          <span>{money(v.sellingPrice)}</span>
                        </div>
                      </button>
                    ))}
                  </div>

                  <hr className="nhp-need__divider" />

                  <div className="nhp-need__action-row">
                    <div className="nhp-need__qty" aria-label="Quantity">
                      <span className="nhp-need__label-small">QUANTITY</span>
                      <div className="nhp-need__stepper">
                        <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" disabled={qty <= 1}>
                          <i className="ph ph-minus" aria-hidden="true"></i>
                        </button>
                        <strong aria-live="polite">{qty}</strong>
                        <button type="button" onClick={() => setQty((q) => Math.min(99, q + 1))} aria-label="Increase quantity">
                          <i className="ph ph-plus" aria-hidden="true"></i>
                        </button>
                      </div>
                    </div>
                    <div className="nhp-need__total">
                      <span className="nhp-need__label-small">TOTAL PRICE</span>
                      <strong>{money(total)}</strong>
                    </div>
                    
                    <button
                      type="button"
                      className="nhp-need__add"
                      data-add-to-cart
                      onClick={handleAdd}
                      disabled={!available}
                    >
                      <i className="ph ph-shopping-cart" aria-hidden="true"></i>
                      {available ? 'ADD TO CART' : 'OUT OF STOCK'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="nhp-need__empty">No products available right now — fresh batches are on their way.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
