interface WhyCard {
  icon: string;
  title: string;
  text: string;
  image: string;
}

const CARDS: WhyCard[] = [
  {
    icon: 'ph-cow',
    title: 'Sourced from Native Breeds',
    text: 'Made from the milk of indigenous Gir cows, raised in natural environments by trusted farmers.',
    image: '/assets/images/temp-products/FGH.jpeg',
  },
  {
    icon: 'ph-cooking-pot',
    title: 'Traditionally Made (Bilona Method)',
    text: 'Curd is hand-churned using the Vedic Bilona method to retain natural goodness.',
    image: '/assets/images/temp-products/VBN.jpeg',
  },
  {
    icon: 'ph-drop',
    title: 'Pure & Unadulterated',
    text: 'Every batch is tested for key quality parameters to ensure you get pure, wholesome ghee.',
    image: '/assets/images/temp-products/VBNVBN.jpeg',
  },
  {
    icon: 'ph-tractor',
    title: 'Supports Farming Communities',
    text: 'We work closely with rural farming families, ensuring fair value and sustainable livelihoods.',
    image: '/assets/images/temp-products/VCG.jpeg',
  },
];

/**
 * Phase 5 — "Why Choose GAWDEE Ghee". Static copy, no backend call.
 * Server Component.
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
              <div className="nhp-why__card-content">
                <span className="nhp-why__icon" aria-hidden="true">
                  <i className={`ph ${card.icon}`}></i>
                </span>
                <h3 className="nhp-why__card-title">{card.title}</h3>
                <p className="nhp-why__card-text">{card.text}</p>
              </div>
              <div className="nhp-why__card-image">
                <svg className="nhp-why__curve" viewBox="0 0 100 24" preserveAspectRatio="none">
                  <path d="M0,0 L100,0 L100,12 Q75,24 50,12 T0,12 Z" fill="#ffffff" />
                </svg>
                <img src={card.image} alt={card.title} loading="lazy" />
                <i className="ph-fill ph-leaf nhp-why__leaf" aria-hidden="true"></i>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
