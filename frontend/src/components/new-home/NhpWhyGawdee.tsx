interface WhyCard {
  icon: string;
  title: string;
  text: string;
}

const CARDS: WhyCard[] = [
  {
    icon: 'ph-cow',
    title: 'Sourced from Native Breeds',
    text: 'Made from the milk of indigenous Gir cows, raised in natural environments by trusted farmers.',
  },
  {
    icon: 'ph-cooking-pot',
    title: 'Traditionally Made Bilona Method',
    text: 'Curd is slow-churned using the Vedic Bilona method to retain natural nutrition and aroma.',
  },
  {
    icon: 'ph-drop',
    title: 'Pure & Unadulterated',
    text: 'Every batch is tested to key quality parameters, so you get pure, wholesome ghee.',
  },
  {
    icon: 'ph-tractor',
    title: 'Supports Farming Communities',
    text: 'We work directly with rural farming families, ensuring fair value and sustainable livelihoods.',
  },
];

/**
 * Phase 5 — "Why Choose GAWDEE Ghee". Static copy, no backend call.
 * Text-only cards per PDF reference. Server Component.
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
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
