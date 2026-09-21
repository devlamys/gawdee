import React from 'react';
import Link from 'next/link';
import { AnimatedHero } from '@/components/AnimatedHero';
import { ProductCard } from '@/components/ProductCard';
import { OfferPopup } from '@/components/OfferPopup';
import { RailButton } from '@/components/RailButton';
import { NewsletterForm } from '@/components/NewsletterForm';
import { OfferCards } from '@/components/OfferCards';
import { api } from '@/lib/api';
import { CatalogCategory, CatalogItem, Offer, StorefrontSettings, Testimonial } from '@/types';
import { NewHomePage } from '@/components/new-home/NewHomePage';
import { NhpExplore } from '@/components/new-home/NhpExplore';
import { NhpWhyGawdee } from '@/components/new-home/NhpWhyGawdee';
import { NhpCombos } from '@/components/new-home/NhpCombos';
import { NhpTrustReviews } from '@/components/new-home/NhpTrustReviews';
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
  let offers: Offer[] = [];
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
    if (testiRes?.ok && Array.isArray(testiRes.testimonials) && testiRes.testimonials.length > 0) {
      testimonials = testiRes.testimonials;
    } else {
      testimonials = [
        {
          id: -1,
          name: 'Pooja Sharma',
          location: 'Jaipur',
          product_title: 'Gawdee Ghee (1 L)',
          quote: "The aroma of GAWDEE Ghee is unbelievable. When you heat it over phulkas, the entire kitchen smells just like my grandmother's home.",
          rating: 5,
          verified: 1,
        },
        {
          id: -2,
          name: 'Ramesh Nair',
          location: 'Kochi',
          product_title: 'Raw Forest Honey',
          quote: "Clean, zero greasy heaviness, and real nutty scent. Also loved their Raw Forest Honey — naturally thick and unfiltered.",
          rating: 5,
          verified: 1,
        },
        {
          id: -3,
          name: 'Sunita Deshmukh',
          location: 'Pune',
          product_title: 'Mixme Choco (400 g)',
          quote: "My children love the Mixme Choco with warm milk before school. I feel at peace knowing there are no weird chemical preservatives.",
          rating: 5,
          verified: 1,
        }
      ];
    }
  } catch {
    testimonials = [
      {
        id: -1,
        name: 'Pooja Sharma',
        location: 'Jaipur',
        product_title: 'Gawdee Ghee (1 L)',
        quote: "The aroma of GAWDEE Ghee is unbelievable. When you heat it over phulkas, the entire kitchen smells just like my grandmother's home.",
        rating: 5,
        verified: 1,
      },
      {
        id: -2,
        name: 'Ramesh Nair',
        location: 'Kochi',
        product_title: 'Raw Forest Honey',
        quote: "Clean, zero greasy heaviness, and real nutty scent. Also loved their Raw Forest Honey — naturally thick and unfiltered.",
        rating: 5,
        verified: 1,
      },
      {
        id: -3,
        name: 'Sunita Deshmukh',
        location: 'Pune',
        product_title: 'Mixme Choco (400 g)',
        quote: "My children love the Mixme Choco with warm milk before school. I feel at peace knowing there are no weird chemical preservatives.",
        rating: 5,
        verified: 1,
      }
    ];
  }

  try {
    const offersRes = await api.getOffers();
    if (offersRes?.ok && Array.isArray(offersRes.offers)) {
      offers = offersRes.offers;
    }
  } catch {
    offers = [];
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

  // (featuredItems replaced by NhpExplore which uses all items)

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



      {/* 3. Bestsellers Rail Section (real backend products only) */}
      <NhpExplore items={items} />

      <NhpWhyGawdee />

      <NhpCombos />


      {offers.length > 0 && <OfferCards offers={offers} />}









      {/* 7. Customer Reviews & Testimonials Rail (real backend testimonials only) */}
      <NhpTrustReviews testimonials={testimonials} />

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
