'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { CatalogItem, Combo } from '@/types';
import { useCart } from '@/context/CartContext';
import { money, resolveImageUrl } from '@/lib/utils';
import {
  firstValidVariant,
  itemCardImage,
  variantCartLine,
  variantDiscountPercent,
} from '@/lib/catalog';

function comboDetailHref(combo: Combo): string {
  const slug = combo.productOne?.slug || combo.product_one?.slug || '';
  return slug ? `/products/${slug}` : '/products?category=combos';
}

export { comboDetailHref };

function NhpComboCard({ combo }: { combo: Combo }) {
  const { addItem } = useCart();
  const savePercent = Number(combo.savePercent ?? combo.save_percent ?? 0) || 0;
  const sellingPrice = Number(combo.sellingPrice ?? combo.selling_price ?? 0) || 0;
  const mrp = Number(combo.mrp ?? 0) || 0;
  const href = comboDetailHref(combo);

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
    <article className="nhp-combo" data-category="combo">
      <Link className="nhp-combo__media" href={href} aria-label={combo.title}>
        {savePercent > 0 && <span className="nhp-combo__save">SAVE {savePercent}%</span>}
        {combo.image ? (
          <img src={resolveImageUrl(combo.image)} alt={combo.alt || combo.title} loading="lazy" />
        ) : (
          <span className="nhp-combo__noimage" aria-hidden="true">
            <i className="ph ph-image"></i>
          </span>
        )}
      </Link>

      <div className="nhp-combo__body">
        <p className="nhp-combo__category">{combo.category}</p>
        <h3 className="nhp-combo__title">
          <Link href={href}>{combo.title}</Link>
        </h3>
        {combo.details || combo.description ? (
          <p className="nhp-combo__desc">
            {(combo.details || combo.description || '').length > 100
              ? (combo.details || combo.description || '').substring(0, 100) + '...'
              : (combo.details || combo.description)}
          </p>
        ) : null}

        <div className="nhp-combo__footer">
          <div className="nhp-combo__meta">
            <div className="nhp-combo__price">
              <strong>{money(sellingPrice)}</strong>
              {mrp > sellingPrice && <s>{money(mrp)}</s>}
            </div>
          </div>
          <button
            type="button"
            className="nhp-combo__add"
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

/** Legacy fallback card: a real catalog item sold as a bundle (Phase 8 behavior). */
function NhpComboItemCard({ item }: { item: CatalogItem }) {
  const { addItem } = useCart();
  const selected = firstValidVariant(item);
  if (!selected) return null;
  const discount = variantDiscountPercent(selected);
  const image = itemCardImage(item);
  const title = `${item.name} ${selected.variantName}`.trim();

  const handleAdd = () => {
    addItem(variantCartLine(item, selected), 1, true);
  };

  return (
    <article className="nhp-combo" data-category="combo">
      <Link className="nhp-combo__media" href={`/products/${item.slug}`} aria-label={title}>
        {discount > 0 && <span className="nhp-combo__save">SAVE {discount}%</span>}
        {image ? (
          <img src={resolveImageUrl(image)} alt={title} loading="lazy" />
        ) : (
          <span className="nhp-combo__noimage" aria-hidden="true">
            <i className="ph ph-image"></i>
          </span>
        )}
      </Link>

      <div className="nhp-combo__body">
        <p className="nhp-combo__category">{item.category || item.tag || 'Gawdee Combo'}</p>
        <h3 className="nhp-combo__title">
          <Link href={`/products/${item.slug}`}>{title}</Link>
        </h3>
        {item.description && (
          <p className="nhp-combo__desc">
            {item.description.length > 100
              ? item.description.substring(0, 100) + '...'
              : item.description}
          </p>
        )}

        <div className="nhp-combo__footer">
          <div className="nhp-combo__meta">
            <div className="nhp-combo__price">
              <strong>{money(selected.sellingPrice)}</strong>
              {selected.mrp > selected.sellingPrice && <s>{money(selected.mrp)}</s>}
            </div>
          </div>
          <button
            type="button"
            className="nhp-combo__add"
            data-add-to-cart
            onClick={handleAdd}
            aria-label={`Add ${title} bundle to bag`}
          >
            <i className="ph ph-shopping-cart-simple" aria-hidden="true"></i> ADD
          </button>
        </div>
      </div>
    </article>
  );
}

function isComboLike(item: CatalogItem): boolean {
  const haystack = `${item.categoryKey || ''} ${item.category || ''} ${item.tag || ''} ${item.name || ''}`.toLowerCase();
  return haystack.includes('combo') || haystack.includes('duo') || haystack.includes('bundle') || haystack.includes('essentials');
}

export function NhpCombos({ items = [] }: { items?: CatalogItem[] }) {
  const [combos, setCombos] = useState<Combo[] | null>(null);

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

  const fallback = useMemo(() => items.filter(isComboLike).slice(0, 3), [items]);
  const loading = combos === null;
  const showCombos = (combos?.length ?? 0) > 0;

  return (
    <section className="nhp-combos" id="combos" aria-label="Curated Gawdee combos">
      <div className="nhp-combos__inner">
        <div className="nhp-combos__head">
          <div>
            <p className="nhp-combos__eyebrow">CURATED GAWDEE COMBOS</p>
            <h2 className="nhp-combos__title">Better Together</h2>
            <p className="nhp-combos__sub">Thoughtfully paired essentials for everyday Indian homes.</p>
          </div>
          <Link className="nhp-combos__all" href="/products?category=combos">
            See All Combo Packs &rarr;
          </Link>
        </div>

        {loading ? (
          <div className="nhp-combos__grid" aria-busy="true" aria-label="Loading combos">
            {[0, 1, 2].map((i) => (
              <article className="nhp-combo" key={i} aria-hidden="true">
                <div className="nhp-combo__media" style={{ background: '#f1efe7' }} />
                <div className="nhp-combo__body">
                  <p className="nhp-combo__category">Loading…</p>
                </div>
              </article>
            ))}
          </div>
        ) : showCombos ? (
          <div className="nhp-combos__grid">
            {combos!.map((combo) => (
              <NhpComboCard key={combo.id} combo={combo} />
            ))}
          </div>
        ) : fallback.length > 0 ? (
          <div className="nhp-combos__grid">
            {fallback.map((item) => (
              <NhpComboItemCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="nhp-combos__empty">
            <i className="ph ph-gift" aria-hidden="true"></i>
            <p>Fresh combo packs are being curated — check back soon.</p>
          </div>
        )}
      </div>
    </section>
  );
}
