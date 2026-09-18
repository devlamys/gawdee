import { CatalogCategory, CatalogItem, StorefrontSettings, Testimonial } from '@/types';
import { NhpHero } from './NhpHero';
import { NhpExplore } from './NhpExplore';
import { NhpWhyGawdee } from './NhpWhyGawdee';
import { NhpShopByNeed } from './NhpShopByNeed';
import { NhpLabTested } from './NhpLabTested';
import { NhpCombos } from './NhpCombos';
import { NhpTrustReviews } from './NhpTrustReviews';
import { NhpFaq } from './NhpFaq';

export interface NewHomePageProps {
  items: CatalogItem[];
  categories: CatalogCategory[];
  testimonials: Testimonial[];
  storeSettings: StorefrontSettings;
}

/**
 * Flag-gated homepage (Phase 2 scaffold, completed Phase 10).
 * Rendered by `src/app/page.tsx` only when `storeSettings.use_new_homepage === '1'`.
 * Sections follow the reference PDF order with anchors:
 * hero → #shop (explore) → #heritage (why) → shop-by-need → lab →
 * #combos → #reviews → #faq. Header/footer come from StorefrontShell.
 */
export function NewHomePage(props: NewHomePageProps) {
  const { items, testimonials } = props;
  return (
    <>
      <NhpHero />
      <NhpExplore items={items} />
      <NhpWhyGawdee />
      <NhpShopByNeed items={items} />
      <NhpLabTested />
      <NhpCombos items={items} />
      <NhpTrustReviews testimonials={testimonials} />
      <NhpFaq />
    </>
  );
}
