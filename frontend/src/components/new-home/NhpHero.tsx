import Link from 'next/link';

const MINI_BADGES = ['Zero Preservatives', 'FSSAI Certified', 'Direct Farmer Fair Price'];

const TRUST_ITEMS = [
  {
    icon: '/assets/icons/trust/shipping.webp',
    alt: 'Native sourced',
    title: '100% NATIVE SOURCED',
    text: 'Direct from verified origins',
  },
  {
    icon: '/assets/icons/trust/lab-tested.webp',
    alt: 'Vedic Bilona churned',
    title: 'VEDIC BILONA CHURNED',
    text: 'Slow curd-churned method',
  },
  {
    icon: '/assets/icons/trust/secure-payments.webp',
    alt: 'Wood and stone pressed',
    title: 'WOOD & STONE PRESSED',
    text: 'Cold pressed below 45°C',
  },
  {
    icon: '/assets/icons/trust/customer-support.webp',
    alt: 'Lab parameter tests',
    title: '24+ LAB PARAMETER TESTS',
    text: 'No adulterants or mineral oil',
  },
  {
    icon: '/assets/icons/trust/easy-support.webp',
    alt: 'Farmer community',
    title: '3,500+ FARMERS',
    text: 'Fair trade community support',
  },
];

/**
 * Phase 3 — Hero + trust strip. Static copy, links only, no backend call.
 * Server Component.
 */
export function NhpHero() {
  return (
    <>
      <section className="nhp-hero" aria-label="Gawdee organic promise">
        <div className="nhp-hero__inner">
          <p className="nhp-hero__eyebrow">
            <i className="ph-fill ph-leaf" aria-hidden="true"></i>
            1.2 Million+ Families Trust GAWDEE Organic
          </p>
          <h1 className="nhp-hero__title">Nature&rsquo;s Goodness, Traditionally Made.</h1>
          <p className="nhp-hero__sub">
            Authentic Indian superfoods crafted with ancient Vedic Bilona churning and slow
            wood-pressing. Handcrafted with reverence in small batches directly from native
            farmer soils.
          </p>
          <div className="nhp-hero__ctas">
            <Link href="#shop" className="nhp-hero__cta nhp-hero__cta--solid">
              Shop Fresh Harvest
            </Link>
            <Link href="#heritage" className="nhp-hero__cta nhp-hero__cta--outline">
              Explore Our Heritage
            </Link>
          </div>
          <ul className="nhp-hero__badges">
            {MINI_BADGES.map((badge) => (
              <li key={badge}>
                <i className="ph-bold ph-check-circle" aria-hidden="true"></i>
                {badge}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="nhp-trust-strip" aria-label="Gawdee standards">
        <ul className="nhp-trust-strip__list">
          {TRUST_ITEMS.map((item) => (
            <li key={item.title} className="nhp-trust-strip__item">
              <span className="nhp-trust-strip__icon">
                <img src={item.icon} alt={item.alt} width={40} height={40} loading="lazy" />
              </span>
              <span className="nhp-trust-strip__copy">
                <strong>{item.title}</strong>
                <small>{item.text}</small>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
