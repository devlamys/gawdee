'use client';

import Link from 'next/link';

interface ComboData {
  id: string;
  category: string;
  slug: string;
  title: string;
  details: string;
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
    category: 'EVERYDAY SWEETENING DUO',
    slug: 'everyday-sweetening-duo',
    title: 'Raw Forest Honey (350g) + Jaggery Powder (1 kg)',
    details: 'A naturally sweet pantry pairing for tea, breakfast, desserts and everyday recipes.',
    savePercent: 22,
    sellingPrice: 490,
    mrp: 598,
    tagline: 'Best for Everyday Healthy Sweetness',
    image: '/assets/images/temp-products/WhatsApp Image 2026-09-15 at 6.45.50 PM.jpeg',
    alt: 'Everyday Sweetening Duo - Raw Forest Honey and Jaggery Powder',
  },
  {
    id: 'combo-natural-honey',
    category: 'NATURAL HONEY DUO',
    slug: 'natural-honey-duo',
    title: 'Raw Forest Honey (350g) + Raw Ajwain Honey (350g)',
    details: 'Two distinctive raw honey varieties, bringing natural sweetness and variety to your everyday pantry.',
    savePercent: 20,
    sellingPrice: 638,
    mrp: 798,
    tagline: 'Bestselling Honey Duo',
    image: '/assets/images/temp-products/WhatsApp Image 2026-09-15 at 6.45.50 PM3.jpeg',
    alt: 'Natural Honey Duo - Raw Forest Honey and Raw Ajwain Honey',
  },
  {
    id: 'combo-morning-essentials',
    category: 'MORNING ESSENTIALS',
    slug: 'morning-essentials',
    title: 'Raw Forest Honey (350g) + Moringa Powder (300g)',
    details: 'A simple morning pantry pairing combining raw honey with naturally sourced moringa powder.',
    savePercent: 22,
    sellingPrice: 612,
    mrp: 748,
    tagline: 'Healthy Day Starter',
    image: '/assets/images/temp-products/WhatsApp Image 2026-09-15 at 6.45.50 PM23.jpeg',
    alt: 'Morning Essentials - Raw Forest Honey and Moringa Powder',
  },
];

function NhpComboCard({ combo }: { combo: ComboData }) {
  return (
    <article className="nhp-combo" data-category="combo">
      <Link className="nhp-combo__media" href={`/products/${combo.slug}`} aria-label={combo.title}>
        <span className="nhp-combo__save">SAVE {combo.savePercent}%</span>
        <img src={combo.image} alt={combo.alt} loading="lazy" />
      </Link>

      <div className="nhp-combo__body">
        <p className="nhp-combo__category">{combo.category}</p>
        <h3 className="nhp-combo__title">
          <Link href={`/products/${combo.slug}`}>{combo.title}</Link>
        </h3>
        <p className="nhp-combo__desc">{combo.details}</p>
        
        <div className="nhp-combo__footer">
          <div className="nhp-combo__meta">
            <div className="nhp-combo__price">
              <strong>₹{combo.sellingPrice.toLocaleString()}</strong>
              <s>₹{combo.mrp.toLocaleString()}</s>
            </div>
          </div>
          <button
            type="button"
            className="nhp-combo__add"
            data-add-to-cart
          >
            <i className="ph ph-shopping-cart-simple" aria-hidden="true"></i> ADD
          </button>
        </div>
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
            <p className="nhp-combos__eyebrow">CURATED GAWDEE COMBOS</p>
            <h2 className="nhp-combos__title">Better Together</h2>
            <p className="nhp-combos__sub">Thoughtfully paired essentials for everyday Indian homes.</p>
          </div>
          <Link className="nhp-combos__all" href="/products?category=combos">
            See All Combo Packs &rarr;
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