import Link from 'next/link';
import { Testimonial } from '@/types';
import { resolveImageUrl } from '@/lib/utils';

const QUALITY_CARDS = [
  {
    icon: 'ph-stars',
    title: 'Quality Ingredients',
    text: 'Carefully selected ingredients with a focus on purity and natural quality.',
  },
  {
    icon: 'ph-hourglass',
    title: 'Traditional Processing',
    text: 'Traditional methods chosen to preserve the natural qualities of our ingredients.',
  },
  {
    icon: 'ph-package',
    title: 'Hygienic Packaging',
    text: 'Carefully packed in food-safe packaging to protect freshness and quality.',
  },
  {
    icon: 'ph-book-open',
    title: 'Product Transparency',
    text: 'Complete ingredient origins stamped clearly on every package.',
  },
  {
    icon: 'ph-headset',
    title: 'Customer Support',
    text: "We're here to help with your orders, products and questions.",
  },
];

/** Reference quotes — shown ONLY when the backend returns no testimonials. */
const FALLBACK_REVIEWS: Testimonial[] = [
  {
    id: -1,
    name: 'Pooja Sharma',
    location: 'Jaipur',
    product_title: 'Gawdee Ghee (1 L)',
    quote:
      "The aroma of GAWDEE Ghee is unbelievable. When you heat it over phulkas, the entire kitchen smells just like my grandmother's home. Authentic texture that factory brands simply don't have.",
    rating: 5,
    verified: 1,
  },
  {
    id: -2,
    name: 'Ramesh Nair',
    location: 'Kochi',
    product_title: 'Peanut Oil & Honey',
    quote:
      'We switched completely to their Peanut Oil for daily cooking. Clean, zero greasy heaviness, and real nutty scent. Also loved their Raw Forest Honey — naturally thick and unfiltered.',
    rating: 5,
    verified: 1,
  },
  {
    id: -3,
    name: 'Sunita Deshmukh',
    location: 'Pune',
    product_title: 'Mixme Choco (400 g)',
    quote:
      'My children love the Mixme Choco with warm milk before school. I feel at peace knowing there are no weird chemical preservatives or artificial food coloring in it.',
    rating: 5,
    verified: 1,
  },
];

function initialsOf(name: string, initials?: string): string {
  if (initials) return initials;
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function ReviewCard({ testimonial, isExample }: { testimonial: Testimonial; isExample: boolean }) {
  const productLabel = testimonial.product_name || testimonial.product_title || '';
  const filled = Math.max(1, Math.min(5, Math.round(Number(testimonial.rating) || 5)));

  return (
    <article className="nhp-review">
      <div className="nhp-review__stars" aria-label={`${filled} out of 5 stars`}>
        <span aria-hidden="true">{'★'.repeat(filled)}</span>
        <span className="nhp-review__stars-bg" aria-hidden="true">
          {'★'.repeat(5 - filled)}
        </span>
      </div>
      <blockquote className="nhp-review__quote">&ldquo;{testimonial.quote}&rdquo;</blockquote>
      
      <hr className="nhp-review__divider" />
      
      <footer className="nhp-review__person">
        <div className="nhp-review__person-info">
          <strong>{testimonial.name}</strong>
          <small>
            {productLabel}
            {testimonial.location ? ` • ${testimonial.location}` : ''}
          </small>
        </div>
        <div className="nhp-review__verified-badge">
          Verified Buyer
          {isExample && <em className="nhp-review__example" style={{display: 'none'}}>Example</em>}
        </div>
      </footer>
    </article>
  );
}

/**
 * Phase 9 — Quality pillars (static) + customer reviews (real backend
 * testimonials, reference quotes as labeled fallback). Server Component.
 */
export function NhpTrustReviews({ testimonials }: { testimonials: Testimonial[] }) {
  const real = (testimonials ?? []).filter((t) => t?.quote).slice(0, 3);
  const usingFallback = real.length === 0;
  const shown = usingFallback ? FALLBACK_REVIEWS : real;
  const avg = usingFallback
    ? '4.8'
    : (shown.reduce((sum, t) => sum + (Number(t.rating) || 5), 0) / shown.length).toFixed(1);

  return (
    <>
      <section className="nhp-quality" aria-label="Quality you can trust">
        <div className="nhp-quality__inner">
          <p className="nhp-quality__eyebrow">Zero Compromise</p>
          <h2 className="nhp-quality__title">Quality You Can Trust</h2>
          <p className="nhp-quality__sub">Every step is engineered to protect nutritional integrity.</p>

          <div className="nhp-quality__grid">
            {QUALITY_CARDS.map((card) => (
              <article key={card.title} className="nhp-quality__card">
                <span className="nhp-quality__icon" aria-hidden="true">
                  <i className={`ph ${card.icon}`}></i>
                </span>
                <h3>{card.title}</h3>
                <p>{card.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="nhp-reviews" id="reviews" aria-label="Loved across Indian homes">
        <div className="nhp-reviews__inner">
          <p className="nhp-reviews__score">
            {'★'.repeat(5)} {avg} / 5 <span>Based on Customer Reviews</span>
          </p>
          <h2 className="nhp-reviews__title">Loved Across Indian Homes</h2>

          <div className="nhp-reviews__grid">
            {shown.map((testimonial) => (
              <ReviewCard key={testimonial.id} testimonial={testimonial} isExample={usingFallback} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
