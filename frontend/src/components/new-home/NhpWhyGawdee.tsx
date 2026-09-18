import { resolveImageUrl } from '@/lib/utils';

interface WhyCard {
  icon: string;
  title: string;
  text: string;
  image: string;
  alt: string;
}

const CARDS: WhyCard[] = [
  {
    icon: 'ph-cow',
    title: 'Sourced from Native Breeds',
    text: 'Made from the milk of indigenous Gir cows, raised in natural environments by trusted farmers.',
    image: '/assets/images/gawdee-a2-farm-hero-v1.png',
    alt: 'Native Gir cows grazing on a trusted Gawdee farm',
  },
  {
    icon: 'ph-cooking-pot',
    title: 'Traditionally Made Bilona Method',
    text: 'Curd is slow-churned using the Vedic Bilona method to retain natural nutrition and aroma.',
    image: '/assets/images/hero-slide-ghee-v5.webp',
    alt: 'Ghee slow-churned with the traditional Bilona method',
  },
  {
    icon: 'ph-drop',
    title: 'Pure & Unadulterated',
    text: 'Every batch is tested to key quality parameters, so you get pure, wholesome ghee.',
    image: '/assets/images/quality-promise-lab-testing-v1.png',
    alt: 'Gawdee ghee undergoing lab quality testing',
  },
  {
    icon: 'ph-tractor',
    title: 'Supports Farming Communities',
    text: 'We work directly with rural farming families, ensuring fair value and sustainable livelihoods.',
    image: '/assets/images/quality-promise-expert-team-v1.png',
    alt: 'Gawdee team working with farming communities',
  },
];

/**
 * Phase 5 — "Why Choose GAWDEE Ghee". Static copy + existing
 * `public/assets/images/*` photos, no backend call. Server Component.
 */
export function NhpWhyGawdee() {
  return (
    <section className="nhp-why" id="heritage" aria-label="Why choose Gawdee ghee">
      <div className="nhp-why__inner">
        <p className="nhp-why__eyebrow">The Gawdee Standard</p>
        <h2 className="nhp-why__title">Why Choose GAWDEE Ghee?</h2>
        <p className="nhp-why__sub">Pure by tradition. Better for today.</p>

        <div className="nhp-why__grid">
          {CARDS.map((card) => (
            <article key={card.title} className="nhp-why__card">
              <span className="nhp-why__icon" aria-hidden="true">
                <i className={`ph ${card.icon}`}></i>
              </span>
              <h3 className="nhp-why__card-title">{card.title}</h3>
              <p className="nhp-why__card-text">{card.text}</p>
              <img
                className="nhp-why__photo"
                src={resolveImageUrl(card.image)}
                alt={card.alt}
                loading="lazy"
              />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
