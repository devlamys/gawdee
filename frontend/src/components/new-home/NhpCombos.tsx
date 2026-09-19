'use client';

import Link from 'next/link';

interface ComboData {
  id: string;
  name: string;
  slug: string;
  description: string;
  savePercent: number;
  sellingPrice: number;
  mrp: number;
  tagline: string;
  image: string;
  alt: string;
}

const HARDCODED_COMBOS: ComboData[] = [
  {
    id: 'combo-everyday-sweetening',
    name: 'EVERYDAY SWEETENING DUO',
    slug: 'everyday-sweetening-duo',
    description: 'Raw Forest Honey (350g) + Jaggery Powder (1 kg)',
    savePercent: 22,
    sellingPrice: 490,
    mrp: 598,
    tagline: 'Best for Everyday Healthy Sweetness',
    image: '/assets/images/combo-everyday-sweetening-duo-v1.webp',
    alt: 'Everyday Sweetening Duo - Raw Forest Honey and Jaggery Powder',
  },
  {
    id: 'combo-natural-honey',
    name: 'NATURAL HONEY DUO',
    slug: 'natural-honey-duo',
    description: 'Raw Forest Honey (350g) + Raw Ajwain Honey (350g)',
    savePercent: 25,
    sellingPrice: 638,
    mrp: 798,
    tagline: 'Bestselling Honey Duo',
    image: '/assets/images/combo-natural-honey-duo-v1.webp',
    alt: 'Natural Honey Duo - Raw Forest Honey and Raw Ajwain Honey',
  },
  {
    id: 'combo-morning-essentials',
    name: 'MORNING ESSENTIALS',
    slug: 'morning-essentials',
    description: 'Raw Forest Honey (350g) + Moringa Powder (300g)',
    savePercent: 22,
    sellingPrice: 612,
    mrp: 748,
    tagline: 'Healthy Day Starter',
    image: '/assets/images/combo-morning-essentials-v1.webp',
    alt: 'Morning Essentials - Raw Forest Honey and Moringa Powder',
  },
];

function NhpComboCard({ combo }: { combo: ComboData }) {
  return (
    <article className="nhp-combo" data-category="combo">
      <Link className="nhp-combo__media" href={`/products/${combo.slug}`} aria-label={combo.name}>
        <span className="nhp-combo__save">SAVE {combo.savePercent}%</span>
        <img src={combo.image} alt={combo.alt} loading="lazy" />
      </Link>

      <div className="nhp-combo__body">
        <h3 className="nhp-combo__title">
          <Link href={`/products/${combo.slug}`}>{combo.name}</Link>
        </h3>
        <p className="nhp-combo__desc">{combo.description}</p>
        <div className="nhp-combo__price">
          <strong>₹{combo.sellingPrice.toLocaleString()}</strong>
          <s>₹{combo.mrp.toLocaleString()}</s>
        </div>
        <p className="nhp-combo__tag">{combo.tagline}</p>
        <button
          type="button"
          className="nhp-combo__add"
          data-add-to-cart
        >
          <i className="ph ph-shopping-bag" aria-hidden="true"></i>
          ADD BUNDLE
        </button>
      </div>
    </article>
  );
}

export function NhpCombos() {
  return (
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

        <div className="nhp-combos__grid">
          {HARDCODED_COMBOS.map((combo) => (
            <NhpComboCard key={combo.id} combo={combo} />
          ))}
        </div>
      </div>
    </section>
  );
}