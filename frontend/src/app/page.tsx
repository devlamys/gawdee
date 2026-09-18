import React from 'react';
import Link from 'next/link';
import { AnimatedHero } from '@/components/AnimatedHero';
import { ProductCard } from '@/components/ProductCard';
import { OfferPopup } from '@/components/OfferPopup';
import { RailButton } from '@/components/RailButton';
import { NewsletterForm } from '@/components/NewsletterForm';
import { api } from '@/lib/api';
import { CatalogCategory, CatalogItem, StorefrontSettings, Testimonial } from '@/types';
import { NewHomePage } from '@/components/new-home/NewHomePage';
import { resolveImageUrl } from '@/lib/utils';

// Static artwork for category cards (icons only). Names, links and order
// come from backend categories; the backend image is used when present.
const CATEGORY_ARTWORK: Record<string, string> = {
  ghee: '/assets/icons/categories/ghee.webp',
  honey: '/assets/icons/categories/honey.webp',
  nutrition: '/assets/icons/categories/mixme.webp',
  sugar: '/assets/icons/categories/sugar.webp',
  wellness: '/assets/icons/categories/wellness-drops.webp',
};

export default async function HomePage() {
  let items: CatalogItem[] = [];
  let categories: CatalogCategory[] = [];
  let testimonials: Testimonial[] = [];
  let offerCode = '';
  let offerPercent = '';
  let offerPopupEnabled = true;
  let offerPopupImage = '';
  let offerPopupDelayMs = 1200;
  let storeSettings: StorefrontSettings = {};
  let useNewHomepage = false;

  try {
    const itemsRes = await api.catalog.getItems();
    if (itemsRes?.ok && Array.isArray(itemsRes.items)) {
      items = itemsRes.items;
    }
  } catch {
    items = [];
  }

  try {
    const catsRes = await api.catalog.getCategories();
    if (catsRes?.ok && Array.isArray(catsRes.categories)) {
      categories = catsRes.categories.filter((c) => c.isActive !== 0);
    }
  } catch {
    categories = [];
  }

  try {
    const testiRes = await api.getTestimonials();
    if (testiRes?.ok && Array.isArray(testiRes.testimonials)) {
      testimonials = testiRes.testimonials;
    }
  } catch {
    testimonials = [];
  }

  try {
    const storeRes = await api.getStorefront();
    if (storeRes?.ok && storeRes.settings) {
      storeSettings = storeRes.settings;
      offerCode = storeRes.settings.offer_code || '';
      offerPercent = storeRes.settings.offer_percent || '';
      offerPopupEnabled = storeRes.settings.offer_popup_enabled !== '0';
      offerPopupImage = storeRes.settings.offer_popup_image || '';
      const delay = Number(storeRes.settings.offer_popup_delay_ms);
      if (Number.isFinite(delay) && delay >= 0) offerPopupDelayMs = delay;
      const flag = storeRes.settings.use_new_homepage;
      useNewHomepage = flag === '1' || (flag as unknown) === true;
    }
  } catch {
    // Offer section stays hidden when the backend provides no offer.
  }

  // Featured rail: first items returned by the backend (each item already
  // groups its variants — no client-side family reconstruction). Real data only.
  const featuredItems = items.slice(0, 6);

  // Flag-gated homepage: ON renders the new reference design, OFF keeps the
  // exact legacy homepage below untouched. OfferPopup stays on both versions.
  if (useNewHomepage) {
    return (
      <>
        <NewHomePage
          items={items}
          categories={categories}
          testimonials={testimonials}
          storeSettings={storeSettings}
        />
        {offerPopupEnabled && offerCode && (
          <OfferPopup code={offerCode} image={resolveImageUrl(offerPopupImage) || '/assets/images/independence-offer-popup-v1.webp'} delayMs={offerPopupDelayMs} />
        )}
      </>
    );
  }

  return (
    <>
      {/* 1. 3D Animated Hero Carousel (prices/stock come from the backend) */}
      <AnimatedHero />

      {/* 2. Trust & Benefits Strip */}
      <section className="trust-strip reveal" aria-label="Shopping benefits">
        <div className="container trust-strip__inner">
          <div className="trust-item">
            <span className="trust-item__visual">
              <img src="/assets/icons/trust/lab-tested.webp" alt="100% Authentic" width={48} height={48} loading="lazy" />
            </span>
            <span>
              <strong>100% Authentic</strong>Carefully chosen products
            </span>
          </div>
          <div className="trust-item">
            <span className="trust-item__visual">
              <img src="/assets/icons/trust/shipping.webp" alt="Free Shipping" width={48} height={48} loading="lazy" />
            </span>
            <span>
              <strong>Free Shipping</strong>On orders above ₹999
            </span>
          </div>
          <div className="trust-item">
            <span className="trust-item__visual">
              <img src="/assets/icons/trust/secure-payments.webp" alt="Secure Payments" width={48} height={48} loading="lazy" />
            </span>
            <span>
              <strong>Secure Payments</strong>Safe and protected
            </span>
          </div>
          <div className="trust-item">
            <span className="trust-item__visual">
              <img src="/assets/icons/trust/easy-support.webp" alt="Easy Support" width={48} height={48} loading="lazy" />
            </span>
            <span>
              <strong>Easy Support</strong>Helpful customer care
            </span>
          </div>
          <div className="trust-item">
            <span className="trust-item__visual">
              <img src="/assets/icons/trust/customer-support.webp" alt="Customer Support" width={48} height={48} loading="lazy" />
            </span>
            <span>
              <strong>Customer Support</strong>Questions are welcome
            </span>
          </div>
        </div>
      </section>

      {/* 3. Bestsellers Rail Section (real backend products only) */}
      <section className="commerce-section" id="shop">
        <div className="container">
          <div className="commerce-section__heading reveal">
            <div>
              <span className="eyebrow">
                <i className="ph ph-fire"></i> Bestsellers
              </span>
              <h2>Everyday essentials for modern wellness</h2>
              <p>Pure, nourishing products made with traditional care.</p>
            </div>
            <div className="commerce-section__actions">
              <Link className="text-link" href="/products">
                View all products <i className="ph ph-arrow-right"></i>
              </Link>
              <div className="section-rail-controls home-slider-controls" aria-label="Bestseller slider controls">
                <RailButton
                  targetId="home-product-rail"
                  direction={-1}
                  ariaLabel="Previous products"
                  icon="ph-arrow-left"
                />
                <RailButton
                  targetId="home-product-rail"
                  direction={1}
                  ariaLabel="Next products"
                  icon="ph-arrow-right"
                />
              </div>
            </div>
          </div>

          {featuredItems.length === 0 ? (
            <div className="product-empty" style={{ textAlign: 'center', padding: '3rem 1rem', color: '#777' }}>
              <i className="ph ph-package" style={{ fontSize: '2.5rem', color: '#ccc' }}></i>
              <h2 style={{ marginTop: '1rem' }}>No products available.</h2>
              <p>Please check back soon — fresh batches are on their way.</p>
            </div>
          ) : (
            <div
              className="compact-product-grid home-product-rail"
              id="home-product-rail"
              aria-label="Bestselling products"
            >
              {featuredItems.map((item, idx) => (
                <ProductCard
                  key={item.id || idx}
                  item={item}
                  index={idx}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 4. Organic Categories Grid */}
      <section className="commerce-section category-section" id="categories">
        <div className="container">
          <div className="commerce-section__heading reveal">
            <div>
              <span className="eyebrow">
                <i className="ph ph-squares-four"></i> Browse the pantry
              </span>
              <h2>Shop by category</h2>
              <p>Find the right products for your daily rituals.</p>
            </div>
          </div>
          <div className="category-grid">
            <Link
              className="category-card reveal"
              data-delay={0}
              href="/products"
            >
              <span className="category-card__visual">
                <img src="/assets/icons/categories/all-products.webp" alt="All Products" width={64} height={64} loading="lazy" />
              </span>
              <strong>All Products</strong>
              <span className="category-card__arrow">
                <i className="ph ph-arrow-right"></i>
              </span>
            </Link>
            {categories.map((cat, index) => {
              const filter = (cat.filter || '').toLowerCase();
              const artwork = (cat.imageUrl && resolveImageUrl(cat.imageUrl)) || CATEGORY_ARTWORK[filter] || '/assets/icons/categories/all-products.webp';
              return (
                <Link
                  key={cat.id}
                  className="category-card reveal"
                  data-delay={(index + 1) * 35}
                  href={`/products${filter ? `?category=${filter}` : ''}`}
                >
                  <span className="category-card__visual">
                    <img src={artwork} alt={cat.name} width={64} height={64} loading="lazy" />
                  </span>
                  <strong>{cat.name}</strong>
                  <span className="category-card__arrow">
                    <i className="ph ph-arrow-right"></i>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5. Campaign Special Offer Banner (real offer configured in backend settings) */}
      {offerCode && (
        <section className="commerce-section campaign-offer-section" id="offers">
          <div className="container">
            <div className="commerce-section__heading reveal">
              <div>
                <span className="eyebrow">
                  <i className="ph ph-tag"></i> Special offer
                </span>
                <h2>Flat {offerPercent ? `${offerPercent}% OFF` : 'special savings'}</h2>
                <p>On all products. Use code {offerCode} at checkout.</p>
              </div>
              <div className="commerce-section__actions">
                <Link className="button button--primary" href="#shop">
                  Shop offer <i className="ph ph-arrow-right"></i>
                </Link>
              </div>
            </div>
            <Link
              className="independence-image-offer reveal reveal--scale"
              href="#shop"
              aria-label={`Flat ${offerPercent ? `${offerPercent}% OFF` : 'special savings'}. On all products. Use code ${offerCode} at checkout.`}
            >
              <picture>
                <source
                  media="(max-width: 700px)"
                  srcSet="/assets/images/independence-day-offer-banner-mobile-v1.png"
                />
                <img
                  src="/assets/images/independence-day-offer-banner-v1.png"
                  alt={`Flat ${offerPercent ? `${offerPercent}% OFF` : 'special savings'}. On all products. Use code ${offerCode} at checkout.`}
                  loading="lazy"
                />
              </picture>
            </Link>
          </div>
        </section>
      )}

      {/* 6. Why Gawdee / Brand Story Pillars */}
      <section className="commerce-section brand-story-section reveal" id="why-gawdee">
        <div className="container">
          <div className="brand-story-header">
            <span className="eyebrow">
              <i className="ph ph-plant"></i> The Gawdee difference
            </span>
            <h2>Why choose Gawdee</h2>
            <p>Purity, tradition and nutrition for a healthier lifestyle.</p>
          </div>
          <div className="story-pillar-grid">
            <article className="story-pillar-card">
              <span className="story-pillar-num">01</span>
              <h4>Nutrient-Rich Ingredients</h4>
              <p>
                Carefully selected natural ingredients packed with essential nutrients to support your
                body and make everyday meals more nourishing.
              </p>
            </article>
            <article className="story-pillar-card">
              <span className="story-pillar-num">02</span>
              <h4 className="gawdee-dark">Clean &amp; Wholesome</h4>
              <p>
                Made with thoughtfully chosen ingredients and no unnecessary artificial additives, so
                you know exactly what goes into your food.
              </p>
            </article>
            <article className="story-pillar-card">
              <span className="story-pillar-num">03</span>
              <h4>Nutrition for Every Day</h4>
              <p>
                Created to fit effortlessly into your daily routine, helping you add wholesome
                nourishment to your breakfast, snacks, and everyday meals.
              </p>
            </article>
            <article className="story-pillar-card">
              <span className="story-pillar-num">04</span>
              <h4>Quality You Can Trust</h4>
              <p>
                Every Gawdee product is carefully prepared, quality checked, and packed with care to
                preserve its freshness, goodness, and nutritional value.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* 7. Customer Reviews & Testimonials Rail (real backend testimonials only) */}
      <section
        className="content-section testimonial-reference-section"
        id="reviews"
        aria-labelledby="testimonial-heading"
      >
        <div className="container">
          <header className="testimonial-reference-head reveal">
            <span className="eyebrow">
              <i className="ph ph-quotes"></i> Customer Love
            </span>
            <h2 id="testimonial-heading">
              <span>Loved by families who choose purity daily</span>
            </h2>
            <p>Real words from customers who value authentic taste and thoughtful quality.</p>
          </header>

          {testimonials.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#777' }}>
              <p>No reviews yet. Please check back soon!</p>
            </div>
          ) : (
            <>
              <div className="testimonial-reference-controls reveal" aria-label="Testimonial slider controls">
                <span>
                  <i className="ph ph-hand-swipe-left"></i> Real stories from real families
                </span>
                <div className="section-rail-controls">
                  <RailButton
                    targetId="testimonial-rail"
                    direction={-1}
                    ariaLabel="Previous testimonial"
                    icon="ph-arrow-left"
                  />
                  <RailButton
                    targetId="testimonial-rail"
                    direction={1}
                    ariaLabel="Next testimonial"
                    icon="ph-arrow-right"
                  />
                </div>
              </div>

              <div
                className="testimonial-reference-rail"
                id="testimonial-rail"
                aria-label="Customer testimonials"
              >
                {testimonials.map((testimonial, index) => {
                  const productLabel = testimonial.product_name || testimonial.product_title || '';
                  const productSlug = testimonial.product_slug || '';
                  return (
                    <article
                      className="testimonial-reference-card reveal"
                      key={testimonial.id || index}
                      data-delay={Math.min(index * 45, 180)}
                    >
                      <div className="testimonial-reference-card__top">
                        {testimonial.avatar ? (
                          <img
                            className="testimonial-reference-avatar"
                            src={resolveImageUrl(testimonial.avatar)}
                            alt={testimonial.name}
                            loading="lazy"
                          />
                        ) : (
                          <span className="testimonial-reference-avatar testimonial-reference-avatar--initials">
                            {testimonial.initials || testimonial.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
                          </span>
                        )}
                        <div className="testimonial-reference-person">
                          <h3>{testimonial.name}</h3>
                          <p>
                            <i className="ph ph-seal-check"></i> Verified Buyer
                          </p>
                        </div>
                        <span className="testimonial-reference-quote" aria-hidden="true">
                          <i className="ph ph-quotes"></i>
                        </span>
                      </div>
                      <div className="testimonial-reference-meta">
                        <span
                          className="testimonial-reference-stars"
                          aria-label={`${testimonial.rating} out of 5 stars`}
                        >
                          {'★'.repeat(testimonial.rating)}
                        </span>
                        {productLabel && (
                          <span className="testimonial-reference-product">{productLabel}</span>
                        )}
                      </div>
                      <blockquote>“{testimonial.quote}”</blockquote>
                      {productSlug && (
                        <footer>
                          <Link href={`/products/${productSlug}`}>Read Full Story</Link>
                          <Link
                            className="testimonial-reference-arrow"
                            href={`/products/${productSlug}`}
                            aria-label={`Read ${testimonial.name}'s story`}
                          >
                            <i className="ph ph-caret-right"></i>
                          </Link>
                        </footer>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>

      {/* 8. Newsletter Subscription Section */}
      <section className="commerce-section newsletter-section reveal">
        <div className="container">
          <div className="newsletter-panel">
            <div className="newsletter-panel__icon">
              <i className="ph ph-envelope-simple"></i>
            </div>
            <div>
              <span className="eyebrow">
                <i className="ph ph-paper-plane-tilt"></i> Stay close to goodness
              </span>
              <h2>Be the first to know!</h2>
              <p>Subscribe for special offers, health tips and updates.</p>
            </div>
            <NewsletterForm />
            <div className="newsletter-panel__leaf" aria-hidden="true">
              <i className="ph ph-plant"></i>
            </div>
          </div>
        </div>
      </section>

      {/* 9. Welcome / Special Offer Popup Dialog (backend-configured offer) */}
      {offerPopupEnabled && offerCode && (
        <OfferPopup code={offerCode} image={resolveImageUrl(offerPopupImage) || '/assets/images/independence-offer-popup-v1.webp'} delayMs={offerPopupDelayMs} />
      )}
    </>
  );
}
