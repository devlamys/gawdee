'use client';

import Link from 'next/link';
import { CatalogItem } from '@/types';
import { useCart } from '@/context/CartContext';
import { money, resolveImageUrl } from '@/lib/utils';
import { firstValidVariant, isVariantAvailable, itemCardImage, variantCartLine, variantDiscountPercent } from '@/lib/catalog';

const CERTS = [
  { icon: 'ph-seal-check', label: 'FSSAI Lic. 10821005000' },
  { icon: 'ph-flask-conical', label: 'Accredited Tested' },
  { icon: 'ph-factory', label: 'GMP Good Mfg Practice' },
  { icon: 'ph-leaf', label: 'Non GMO Verified' },
  { icon: 'ph-sprout', label: 'Jaivik Bharat Standard' },
];

function isCombo(item: CatalogItem): boolean {
  const haystack = `${item.categoryKey || ''} ${item.category || ''} ${item.name || ''}`.toLowerCase();
  return ['combo', 'duo', 'bundle', 'essentials'].some((kw) => haystack.includes(kw));
}

function NhpComboCard({ item }: { item: CatalogItem }) {
  const { addItem, openVariantsDrawer } = useCart();
  const selected = firstValidVariant(item);
  const discount = variantDiscountPercent(selected);
  const available = isVariantAvailable(selected);
  const image = itemCardImage(item);
  const tagline = (item.tag || '').trim();

  const handleAdd = () => {
    if (!selected || !available) return;
    if ((item.variants ?? []).length > 1) {
      openVariantsDrawer(item, item.variants ?? []);
      return;
    }
    addItem(variantCartLine(item, selected), 1, true);
  };

  if (!selected) return null;

  return (
    <article className="nhp-combo" data-category={item.categoryKey || item.category?.toLowerCase()}>
      <Link className="nhp-combo__media" href={`/products/${item.slug}`} aria-label={item.name}>
        {discount > 0 && <span className="nhp-combo__save">Save {discount}%</span>}
        {image ? (
          <img src={resolveImageUrl(image)} alt={item.name} loading="lazy" />
        ) : (
          <span className="nhp-combo__noimage" aria-hidden="true">
            <i className="ph ph-image"></i>
          </span>
        )}
      </Link>

      <div className="nhp-combo__body">
        <h3 className="nhp-combo__title">
          <Link href={`/products/${item.slug}`}>{item.name}</Link>
        </h3>
        {item.description && <p className="nhp-combo__desc">{item.description}</p>}
        <div className="nhp-combo__price">
          <strong>{money(selected.sellingPrice)}</strong>
          {selected.mrp > selected.sellingPrice && <s>{money(selected.mrp)}</s>}
        </div>
        {tagline && <p className="nhp-combo__tag">{tagline}</p>}
        <button
          type="button"
          className="nhp-combo__add"
          data-add-to-cart
          onClick={handleAdd}
          disabled={!available}
        >
          <i className="ph ph-shopping-bag" aria-hidden="true"></i>
          {available ? 'ADD BUNDLE' : 'OUT OF STOCK'}
        </button>
      </div>
    </article>
  );
}

export function NhpCombos({ items }: { items: CatalogItem[] }) {
  const combos = items.filter(isCombo).slice(0, 3);

  return (
    <>
      <section className="nhp-certs" aria-label="Certified by premier food authorities">
        <p className="nhp-certs__heading">Certified &amp; Approved by Premier Food Authorities</p>
        <ul className="nhp-certs__list">
          {CERTS.map((cert) => (
            <li key={cert.label}>
              <i className={`ph ${cert.icon}`} aria-hidden="true"></i>
              {cert.label}
            </li>
          ))}
        </ul>
      </section>

      <section className="nhp-combos" id="combos" aria-label="Curated Gawdee combos">
        <div className="nhp-combos__inner">
          <div className="nhp-combos__head">
            <div>
              <p className="nhp-combos__eyebrow">Curated Gawdee Combos</p>
              <h2 className="nhp-combos__title">Better Together</h2>
              <p className="nhp-combos__sub">Thoughtfully paired essentials for everyday Indian homes.</p>
            </div>
            <Link className="nhp-combos__all" href="/products?category=combos">
              See All Combo Packs <i className="ph ph-arrow-right" aria-hidden="true"></i>
            </Link>
          </div>

          {combos.length === 0 ? (
            <div className="nhp-combos__empty">
              <i className="ph ph-package" aria-hidden="true"></i>
              <p>No combo packs right now — fresh bundles are on their way.</p>
              <Link className="nhp-combos__all" href="/products?category=combos">
                See All Combo Packs <i className="ph ph-arrow-right" aria-hidden="true"></i>
              </Link>
            </div>
          ) : (
            <div className="nhp-combos__grid">
              {combos.map((item) => (
                <NhpComboCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
