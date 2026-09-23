'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useCart } from '@/context/CartContext';
import { api } from '@/lib/api';
import { money, resolveImageUrl } from '@/lib/utils';
import type { CartItem, CatalogItem, CatalogVariant, HeroSlideRow } from '@/types';
import { firstValidVariant, itemCardImage, variantCartLine, variantDetailGallery, variantDiscountPercent } from '@/lib/catalog';

interface SlideConfig {
  cat: string;
  title: string;
  word: string;
  sub: string;
  img: string;
  alt: string;
  url: string;
  cartId: string;
  cartName: string;
  cartImage: string;
}

interface HeroSlide extends SlideConfig {
  priceLabel: string;
  mrpLabel: string;
  off: string;
  reviews: string;
  cartPrice: number;
  cartLine: Omit<CartItem, 'quantity'> | null;
  inStock: boolean;
}

/** Escape dynamic catalog text embedded into slide title HTML. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Merge live backend variant data (price/stock/cart) into slide creative. */
function mergeLive(
  base: SlideConfig,
  item: CatalogItem,
  variant: CatalogVariant,
  overrides: { priceLabel?: string; mrpLabel?: string; off?: string; reviews?: string } = {}
): HeroSlide {
  const price = Number(variant.sellingPrice) || 0;
  const mrp = Number(variant.mrp) || price;
  const offPct = variantDiscountPercent(variant);
  const rating = Number(item.rating) || 0;
  const reviewCount = Number(item.reviewCount) || 0;
  const line = variantCartLine(item, variant);
  return {
    ...base,
    cartImage: line.image || base.cartImage,
    cartName: line.name,
    url: item.slug ? `/products/${item.slug}` : base.url,
    priceLabel: overrides.priceLabel || money(price),
    mrpLabel: overrides.mrpLabel || money(mrp),
    off: overrides.off || (offPct > 0 ? `Save ${offPct}%` : ''),
    reviews:
      overrides.reviews ||
      (rating > 0 ? `${rating.toFixed(1)} — ${reviewCount} review${reviewCount === 1 ? '' : 's'}` : ''),
    cartId: line.id,
    cartPrice: price,
    cartLine: line,
    inStock: variant.stock > 0,
  };
}

/** Map one admin-managed slide row to a hero slide (live data wins when the cart_id resolves). */
function dbRowToSlide(
  row: HeroSlideRow,
  map: Record<string, { item: CatalogItem; variant: CatalogVariant }>
): HeroSlide | null {
  const key = (row.cart_id || '').trim();
  const found = (key && (map[key] ?? map[String(key)])) || null;
  const item = found?.item ?? null;
  const variant = found?.variant ?? null;
  const name = item?.name || row.cart_name || row.title || 'Featured product';
  const img =
    resolveImageUrl(row.product_image || '', '') ||
    (variant ? variantDetailGallery(variant)[0] || '' : '') ||
    (item ? itemCardImage(item) : '') ||
    resolveImageUrl(row.cart_image || '', '');
  if (!img) return null;
  const price = variant ? Number(variant.sellingPrice) || 0 : Number(row.cart_price) || 0;
  const mrp = variant ? Number(variant.mrp) || price : price;
  const line = item && variant ? variantCartLine(item, variant) : null;
  return {
    cat: row.cat || item?.category || 'Featured • Gawdee',
    title: (row.title_html || row.title || escapeHtml(name)).trim() || escapeHtml(name),
    word: (row.word || name.split(/\s+/)[0] || 'GAWDEE').toUpperCase(),
    sub: row.sub || item?.description || '',
    img,
    alt: name,
    url: (item?.slug ? `/products/${item.slug}` : key ? `/products/${key}` : '/products'),
    cartId: `db-${row.id}`,
    cartName: row.cart_name || line?.name || name,
    cartImage: line?.image || resolveImageUrl(row.cart_image || '', '') || img,
    priceLabel: row.price_label || (price ? money(price) : ''),
    mrpLabel: row.mrp_label || (mrp ? money(mrp) : ''),
    off: row.off_badge || '',
    reviews: row.reviews_label || '',
    cartPrice: price,
    cartLine: line,
    inStock: variant ? variant.stock > 0 : false,
  };
}

/** Build a slide from whatever the catalog actually has (last-resort fallback). */
function catalogSlide(item: CatalogItem): HeroSlide | null {
  const variant = firstValidVariant(item);
  if (!variant) return null;
  const img = variantDetailGallery(variant)[0] || itemCardImage(item);
  if (!img) return null;
  const name = item.name || 'Featured product';
  const vName = variant.variantName || '';
  return mergeLive(
    {
      cat: item.category || 'Featured • Gawdee',
      title: `${escapeHtml(name)}${vName ? `<br><span>${escapeHtml(vName)}</span>` : ''}`,
      word: (name.split(/\s+/)[0] || 'GAWDEE').toUpperCase(),
      sub: (item.description || '').slice(0, 160),
      img,
      alt: name,
      url: item.slug ? `/products/${item.slug}` : '/products',
      cartId: String(variant.id),
      cartName: name,
      cartImage: img,
    },
    item,
    variant
  );
}

// Static creative (copy/artwork) only — every price, discount, rating and
// availability value is merged in from the real backend product below.
const SLIDE_CONFIGS: SlideConfig[] = [
  {
    cat: 'A2 Vedic • Grass-Fed',
    title: 'A2 Vedic<br><span>Gir Cow Ghee</span>',
    word: 'GHEE',
    sub: 'Pure & Healthy Gir Cow A2 Ghee hand-churned using traditional Bilona method. Nutty, aromatic & nourishing.',
    img: '/assets/images/Banners/IMG_1438.PNG',
    alt: 'GAWDEE Pure Gir Cow A2 Bilona Ghee Jar',
    url: '/products/gawdee-gir-cow-a2-ghee-500-ml',
    cartId: 'ghee-500',
    cartName: 'Gawdee Gir Cow A2 Ghee 500ml',
    cartImage: '/assets/images/products/ghee-500.webp',
  },
  {
    cat: '100% Natural • Homemade Taste',
    title: 'MixMe Powder<br><span>Vanilla Flavour</span>',
    word: 'MIXME',
    sub: 'Nutritive food powder for kids (2+ yrs) & adults. Packed with Ashwagandha, Shatavari, Brahmi, Peanut & Dates.',
    img: '/assets/images/Banners/IMG_1439.PNG',
    alt: 'GAWDEE MixMe Nutritive Food Powder Vanilla Flavour Pouch',
    url: '/products/gawdee-mixme-vanilla-500-g',
    cartId: 'mixme-vanilla',
    cartName: 'Gawdee MixMe — Vanilla 500g',
    cartImage: '/assets/uploads/products/products-fb1c5b2c7521f2a1f5.png',
  },
  {
    cat: '100% Natural • Homemade Taste',
    title: 'MixMe Powder<br><span>Cardamom Flavour</span>',
    word: 'MIXME',
    sub: 'Nutritive food powder blend with Vavding, Ganthoda, Brahmi & Shankhpushpi in soothing Cardamom flavour.',
    img: '/assets/images/Banners/IMG_1441 (1).PNG',
    alt: 'GAWDEE MixMe Nutritive Food Powder Cardamom Flavour Pouch',
    url: '/products/gawdee-mixme-elaichi-500-g',
    cartId: 'mixme-elaichi',
    cartName: 'Gawdee MixMe — Elaichi 500g',
    cartImage: '/assets/images/products/mixme-elaichi.webp',
  },
  {
    cat: 'Traditional • Unrefined Sweetness',
    title: 'Burra Sugar<br><span>Khandsari 1kg</span>',
    word: 'BURRA',
    sub: 'Naturally processed khandsari sugar with zero chemical processing. Fine crystals for tea, milk, sweets & halwa.',
    img: '/assets/images/Banners/IMG_1442 (1).PNG',
    alt: 'GAWDEE Burra Khandsari Sugar 1kg Pouch',
    url: '/products/gawdee-bura-sugar-1-kg',
    cartId: 'burra-sugar',
    cartName: 'Gawdee Burra Sugar 1kg',
    cartImage: '/assets/images/products/burra-sugar.webp',
  },
  {
    cat: 'Authentic Nasya • Belly Button Drops',
    title: 'Taral Drop<br><span>(Nasya) 30ml</span>',
    word: 'TARAL',
    sub: 'Authentic organic nutrition drops for nose & belly button. Boosts clarity, breath & natural wellness.',
    img: '/assets/images/Banners/IMG_1447 (1).PNG',
    alt: 'GAWDEE Taral Drop Nasya Bottle 30ml',
    url: '/products/gawdee-taral-drop-30-ml',
    cartId: 'taral-drop',
    cartName: 'Gawdee Taral Drop 30ml',
    cartImage: '/assets/images/products/taral-drop.webp',
  },
];

const MARQUEE_WORDS = [
  'Ghee',
  'MixMe Nutritive Blend',
  'MixMe Nutritive Blend',
  'Burra',
  'Taral',
  'No Refined Sugar',
  'Farm Fresh Purity',
  'Ghee',
  'MixMe Nutritive Blend',
  'MixMe Nutritive Blend',
  'Burra',
  'Taral',
  'No Refined Sugar',
  'Farm Fresh Purity',
];

export const AnimatedHero: React.FC = () => {
  const { addItem } = useCart();
  // Canonical items keyed by every variant slug + item slug, so static hero
  // configs always resolve to real backend variants (never stale/fake data).
  const [variantBySlug, setVariantBySlug] = useState<Record<string, { item: CatalogItem; variant: CatalogVariant }>>({});
  // Admin-managed slides (Admin > Animated hero) — win over static configs when present.
  const [dbSlides, setDbSlides] = useState<HeroSlideRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.catalog.getItems()
      .then((res) => {
        if (cancelled) return;
        if (res?.ok && Array.isArray(res.items)) {
          const map: Record<string, { item: CatalogItem; variant: CatalogVariant }> = {};
          for (const item of res.items) {
            if (item.slug) map[item.slug] = { item, variant: firstValidVariant(item) } as { item: CatalogItem; variant: CatalogVariant };
            for (const v of item.variants ?? []) {
              if (v.slug) map[v.slug] = { item, variant: v };
              map[String(v.id)] = { item, variant: v };
            }
          }
          // Drop placeholder entries whose item has no purchasable variant.
          for (const key of Object.keys(map)) {
            if (!map[key].variant) delete map[key];
          }
          setVariantBySlug(map);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.getHeroSlides()
      .then((res) => {
        if (cancelled) return;
        if (res?.ok && Array.isArray(res.slides)) {
          setDbSlides(res.slides);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Slide sources, in priority order:
  // 1. Admin-managed slides (live variant data merged in when cart_id resolves).
  // 2. Curated static configs merged with live backend data.
  // 3. Dynamic slides built from whatever the catalog actually has —
  //    the hero never renders empty while products exist.
  const slides: HeroSlide[] = useMemo(() => {
    if (dbSlides.length > 0) {
      const out: HeroSlide[] = [];
      for (const row of dbSlides) {
        const s = dbRowToSlide(row, variantBySlug);
        if (s) out.push(s);
      }
      if (out.length > 0) return out;
    }
    const out: HeroSlide[] = [];
    for (const cfg of SLIDE_CONFIGS) {
      const slug = cfg.url.split('/products/')[1] || '';
      const found = variantBySlug[slug] ?? variantBySlug[cfg.cartId];
      if (!found) continue;
      out.push(mergeLive(cfg, found.item, found.variant));
    }
    if (out.length > 0) return out;
    const seen = new Set<string>();
    for (const key of Object.keys(variantBySlug)) {
      const entry = variantBySlug[key];
      if (!entry?.item || seen.has(String(entry.item.id))) continue;
      seen.add(String(entry.item.id));
      const s = catalogSlide(entry.item);
      if (s) out.push(s);
      if (out.length >= 5) break;
    }
    return out;
  }, [variantBySlug, dbSlides]);

  const heroRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const slidesRef = useRef<HTMLDivElement[]>([]);

  const addItemRef = useRef(addItem);
  addItemRef.current = addItem;

  const currentRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const controlsRef = useRef<{
    next: () => void;
    prev: (explicit?: number) => void;
    goTo: (target: number) => void;
  } | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const floatTweenRef = useRef<gsap.core.Tween | null>(null);
  const touchStartXRef = useRef<number>(0);

  const N = slides.length;
  const AUTOPLAY_MS = 3200;
  const DUR = 1.15;
  const EASE = 'power3.inOut';

  useEffect(() => {
    const stage = stageRef.current;
    const PRODUCTS = slides;
    const count = PRODUCTS.length;
    if (!stage || !count) return;

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function positions() {
      const W = stage?.clientWidth || 600;
      return {
        previewX: Math.min(W * 0.36, 340),
        offRightX: W * 0.75,
        offLeftX: -W * 0.85,
      };
    }

    function setText(id: string, value: string) {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    }

    function paintText(p: HeroSlide) {
      setText('gxCat', p.cat);
      const titleEl = document.getElementById('gxTitle');
      if (titleEl) titleEl.innerHTML = p.title;
      setText('gxSub', p.sub);
      setText('gxPrice', p.priceLabel);
      setText('gxMrp', p.mrpLabel);
      setText('gxOff', p.off);
      setText('gxReviews', p.reviews);
      const reviewsWrap = document.getElementById('gxReviewsWrap');
      if (reviewsWrap) reviewsWrap.style.display = p.reviews ? '' : 'none';
      const offEl = document.getElementById('gxOff');
      if (offEl) offEl.style.display = p.off ? '' : 'none';
      const mini = document.querySelector('#gxCartBtn .gx-mini');
      if (mini) mini.textContent = p.priceLabel;
      const shop = document.getElementById('gxShopBtn');
      if (shop && p.url) shop.setAttribute('href', p.url);
      const cart = document.getElementById('gxCartBtn');
      if (cart) {
        cart.setAttribute('data-id', p.cartId);
        cart.setAttribute('data-name', p.cartName);
        cart.setAttribute('data-price', String(p.cartPrice));
        cart.setAttribute('data-image', p.cartImage);
        (cart as HTMLButtonElement).disabled = !p.inStock;
      }
    }

    function syncMeta() {
      const current = currentRef.current;
      const dots = dotsRef.current?.querySelectorAll<HTMLButtonElement>('.gx-dot');
      dots?.forEach((d, i) => {
        d.classList.toggle('active', i === current);
        d.setAttribute('aria-selected', i === current ? 'true' : 'false');
      });
      setText('gxCount', `${String(current + 1).padStart(2, '0')} — ${String(count).padStart(2, '0')}`);
      setText('gxIndex', String(current + 1).padStart(2, '0'));
      const np = PRODUCTS[(current + 1) % count];
      setText('gxNextName', np.word.charAt(0) + np.word.slice(1).toLowerCase());

      if (count > 1) {
        gsap.fromTo(
          '#gxProgressBar',
          { scaleX: 0 },
          {
            scaleX: 1,
            duration: AUTOPLAY_MS / 1000,
            ease: 'none',
            overwrite: true,
          }
        );
      }
    }

    function layoutInstant() {
      const pos = positions();
      const current = currentRef.current;
      slidesRef.current.forEach((el, i) => {
        if (!el) return;
        if (i === current) {
          gsap.set(el, {
            x: 0,
            y: 0,
            scale: 1.06,
            opacity: 1,
            zIndex: 30,
            rotationY: 0,
            rotation: 0,
          });
        } else if (i === (current + 1) % count) {
          gsap.set(el, {
            x: pos.previewX,
            y: 0,
            scale: 0.64,
            opacity: 0.38,
            zIndex: 10,
            rotationY: -18,
            rotation: 4,
          });
        } else if (i === (current - 1 + count) % count) {
          gsap.set(el, {
            x: pos.offLeftX,
            y: 0,
            scale: 0.8,
            opacity: 0,
            zIndex: 5,
            rotation: -10,
            rotationY: 18,
          });
        } else {
          gsap.set(el, {
            x: pos.offRightX,
            y: 0,
            scale: 0.55,
            opacity: 0,
            zIndex: 1,
            rotation: 0,
            rotationY: 0,
          });
        }
      });
      paintText(PRODUCTS[current]);
      syncMeta();
    }

    function startFloat() {
      if (reduceMotion) return;
      if (floatTweenRef.current) floatTweenRef.current.kill();
      const current = currentRef.current;
      const currentSlide = slidesRef.current[current];
      if (!currentSlide) return;

      floatTweenRef.current = gsap.to(currentSlide, {
        y: -18,
        duration: 2.1,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });

      if (shadowRef.current) {
        gsap.to(shadowRef.current, {
          scale: 0.82,
          opacity: 0.7,
          duration: 2.1,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
        });
      }
    }

    function animateTextOutIn(inIdx: number, tl: gsap.core.Timeline) {
      const p = PRODUCTS[inIdx];
      tl.to('#gxText', { y: -28, opacity: 0, duration: 0.45, ease: 'power3.in' }, 0);
      tl.add(() => {
        paintText(p);
        setText('gxCount', `${String(inIdx + 1).padStart(2, '0')} — ${String(count).padStart(2, '0')}`);
        setText('gxIndex', String(inIdx + 1).padStart(2, '0'));
        const dots = dotsRef.current?.querySelectorAll<HTMLButtonElement>('.gx-dot');
        dots?.forEach((d, i) => {
          d.classList.toggle('active', i === inIdx);
          d.setAttribute('aria-selected', i === inIdx ? 'true' : 'false');
        });

        gsap.fromTo(
          '#gxProgressBar',
          { scaleX: 0 },
          {
            scaleX: 1,
            duration: AUTOPLAY_MS / 1000,
            ease: 'none',
            overwrite: true,
          }
        );
        const np = PRODUCTS[(inIdx + 1) % count];
        setText('gxNextName', np.word.charAt(0) + np.word.slice(1).toLowerCase());
      }, DUR * 0.45);
      tl.fromTo(
        '#gxText',
        { y: 44, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.75, ease: 'expo.out' },
        DUR * 0.5
      );
    }

    function next() {
      if (isAnimatingRef.current || count <= 1) return;
      isAnimatingRef.current = true;
      if (floatTweenRef.current) floatTweenRef.current.kill();
      if (shadowRef.current) gsap.killTweensOf(shadowRef.current);

      const pos = positions();
      const current = currentRef.current;
      const outIdx = current;
      const inIdx = (current + 1) % count;
      const upIdx = (current + 2) % count;

      const outEl = slidesRef.current[outIdx];
      const inEl = slidesRef.current[inIdx];
      const upEl = slidesRef.current[upIdx];

      if (upEl) {
        gsap.set(upEl, {
          x: pos.offRightX,
          scale: 0.55,
          opacity: 0,
          zIndex: 1,
          y: 0,
        });
      }

      const tl = gsap.timeline({
        defaults: { duration: DUR, ease: EASE },
        onComplete: () => {
          currentRef.current = inIdx;
          isAnimatingRef.current = false;
          layoutInstant();
          startFloat();
          restartAuto();
        },
      });

      if (outEl) {
        tl.to(
          outEl,
          {
            x: pos.offLeftX,
            opacity: 0,
            scale: 0.8,
            rotation: -10,
            rotationY: 18,
            y: 0,
            zIndex: 5,
          },
          0
        );
      }

      if (inEl) {
        tl.to(
          inEl,
          {
            x: 0,
            opacity: 1,
            scale: 1.06,
            rotation: 0,
            rotationY: 0,
            y: 0,
            zIndex: 30,
          },
          0
        );
      }

      if (upEl) {
        tl.to(
          upEl,
          {
            x: pos.previewX,
            opacity: 0.38,
            scale: 0.64,
            rotation: 4,
            rotationY: -18,
            zIndex: 10,
          },
          0.08
        );
      }

      if (shadowRef.current) {
        tl.to(
          shadowRef.current,
          {
            scale: 0.7,
            opacity: 0.4,
            duration: DUR / 2,
            ease: 'power2.in',
            yoyo: true,
            repeat: 1,
          },
          0
        );
      }

      animateTextOutIn(inIdx, tl);
    }

    function prev(explicit?: number) {
      if (isAnimatingRef.current || count <= 1) return;
      isAnimatingRef.current = true;
      if (floatTweenRef.current) floatTweenRef.current.kill();
      if (shadowRef.current) gsap.killTweensOf(shadowRef.current);

      const pos = positions();
      const current = currentRef.current;
      const inIdx = explicit !== undefined && explicit !== null ? explicit : (current - 1 + count) % count;
      const outEl = slidesRef.current[current];
      const inEl = slidesRef.current[inIdx];

      if (inEl) {
        gsap.set(inEl, {
          x: pos.offLeftX,
          scale: 0.8,
          opacity: 0,
          zIndex: 30,
          y: 0,
          rotation: -10,
        });
      }

      const oldNext = slidesRef.current[(current + 1) % count];

      const tl = gsap.timeline({
        defaults: { duration: DUR, ease: EASE },
        onComplete: () => {
          currentRef.current = inIdx;
          isAnimatingRef.current = false;
          layoutInstant();
          startFloat();
          restartAuto();
        },
      });

      if (outEl) {
        tl.to(
          outEl,
          {
            x: pos.previewX,
            opacity: 0.38,
            scale: 0.64,
            rotation: 4,
            rotationY: -18,
            zIndex: 10,
          },
          0
        );
      }

      if (inEl) {
        tl.to(
          inEl,
          {
            x: 0,
            opacity: 1,
            scale: 1.06,
            rotation: 0,
            rotationY: 0,
            zIndex: 30,
          },
          0
        );
      }

      if (oldNext) {
        tl.to(oldNext, { x: pos.offRightX, opacity: 0, scale: 0.55, zIndex: 1 }, 0);
      }

      if (shadowRef.current) {
        tl.to(
          shadowRef.current,
          {
            scale: 0.7,
            opacity: 0.4,
            duration: DUR / 2,
            ease: 'power2.in',
            yoyo: true,
            repeat: 1,
          },
          0
        );
      }

      animateTextOutIn(inIdx, tl);
    }

    function goTo(target: number) {
      if (isAnimatingRef.current || target === currentRef.current || count <= 1) {
        restartAuto();
        return;
      }
      const current = currentRef.current;
      const fwd = (target - current + count) % count;
      if (fwd <= count / 2) {
        if ((current + 1) % count === target) {
          next();
        } else {
          currentRef.current = (target - 1 + count) % count;
          layoutInstant();
          next();
        }
      } else {
        prev(target);
      }
    }

    function restartAuto() {
      if (timerRef.current) clearInterval(timerRef.current);
      if (count <= 1 || reduceMotion) return;
      timerRef.current = setInterval(() => {
        if (typeof document !== 'undefined' && !document.hidden) {
          next();
        }
      }, AUTOPLAY_MS);
    }

    controlsRef.current = { next, prev, goTo };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', handleKeyDown);

    const handleResize = () => {
      if (!isAnimatingRef.current) layoutInstant();
    };
    window.addEventListener('resize', handleResize);

    // Initial setup inside GSAP context
    const ctx = gsap.context(() => {
      layoutInstant();
      startFloat();
      restartAuto();

      if (!reduceMotion) {
        gsap.fromTo(
          '.gx-hero .gx-intro',
          { y: 34, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 1,
            stagger: 0.12,
            ease: 'expo.out',
            delay: 0.2,
          }
        );
        gsap.fromTo(
          '#gxText',
          { y: 50, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 1.1,
            ease: 'expo.out',
            delay: 0.35,
          }
        );
      }
    }, heroRef);

    return () => {
      ctx.revert();
      if (timerRef.current) clearInterval(timerRef.current);
      if (floatTweenRef.current) floatTweenRef.current.kill();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [slides]);

  const handleNext = () => {
    controlsRef.current?.next();
  };

  const handlePrev = () => {
    controlsRef.current?.prev();
  };

  const handleGoTo = (index: number) => {
    controlsRef.current?.goTo(index);
  };

  const handleMouseEnter = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    gsap.killTweensOf('#gxProgressBar');
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (typeof document !== 'undefined' && !document.hidden) {
        controlsRef.current?.next();
      }
    }, AUTOPLAY_MS);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartXRef.current;
    if (Math.abs(dx) > 40) {
      if (dx < 0) {
        controlsRef.current?.next();
      } else {
        controlsRef.current?.prev();
      }
    }
  };

  const handleAddToCart = () => {
    const current = currentRef.current;
    const p = slides[current];
    if (!p || !p.inStock || !p.cartLine) return;
    addItemRef.current(p.cartLine, 1, true);

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) return;

    const dot = document.createElement('div');
    dot.style.cssText =
      'position:fixed;width:16px;height:16px;border-radius:999px;background:#005c4e;z-index:100;pointer-events:none;left:50%;top:60%';
    document.body.appendChild(dot);
    gsap.to(dot, {
      x: window.innerWidth / 2 - 120,
      y: -window.innerHeight / 2 + 80,
      scale: 0.3,
      duration: 0.8,
      ease: 'power3.in',
      onComplete: () => {
        dot.remove();
      },
    });
  };

  // No backend products yet (or fetch failed) — render nothing instead of fake data.
  if (slides.length === 0) return null;

  const first = slides[0];
  const nextUp = slides[1] || slides[0];

  return (
    <section className="gx-hero grain" aria-label="Featured organic products" ref={heroRef}>
      <div className="gx-hero__bg" aria-hidden="true">
        <div className="gx-hero__bg-left"></div>
        <div className="gx-hero__bg-right"></div>
        <div className="gx-hero__watermark">
          <div className="gx-hero__wm-top-left"></div>
          <div className="gx-hero__wm-bottom-right"></div>
        </div>
      </div>
      <div className="gx-hero__glow gx-hero__glow--left" aria-hidden="true"></div>
      <div className="gx-hero__glow gx-hero__glow--right" aria-hidden="true"></div>

      <div className="gx-hero__grid">
        <div className="gx-hero__copy">
          <div className="gx-hero__kicker gx-intro">
            <span className="gx-hero__kicker-line" aria-hidden="true"></span>
            <span className="gx-hero__pill" id="gxCat">
              {first.cat}
            </span>
            <span className="gx-hero__count" id="gxCount">
              01 — {String(slides.length).padStart(2, '0')}
            </span>
          </div>

          <div id="gxText" aria-live="polite">
            <h1
              className="gx-hero__title"
              id="gxTitle"
              dangerouslySetInnerHTML={{ __html: first.title }}
            />
            <p className="gx-hero__sub" id="gxSub">
              {first.sub}
            </p>
            <div className="gx-hero__rating" id="gxReviewsWrap" style={first.reviews ? undefined : { display: 'none' }}>
              <span className="gx-hero__stars" aria-label="Customer rating">
                ★★★★★
              </span>
              <span className="gx-hero__reviews" id="gxReviews">
                {first.reviews}
              </span>
            </div>
            <div className="gx-hero__price-row">
              <span className="gx-hero__price" id="gxPrice">
                {first.priceLabel}
              </span>
              <span className="gx-hero__mrp" id="gxMrp">
                {first.mrpLabel}
              </span>
              {first.off && (
                <span className="gx-hero__off" id="gxOff">
                  {first.off}
                </span>
              )}
            </div>
          </div>

          <div className="gx-hero__cta gx-intro">
            <Link className="gx-btn-lux" id="gxShopBtn" href={first.url}>
              Shop Now <span className="gx-btn-lux__arrow" aria-hidden="true">→</span>
            </Link>
            <button
              type="button"
              className="gx-btn-cart"
              id="gxCartBtn"
              data-add-to-cart
              data-id={first.cartId}
              data-name={first.cartName}
              data-price={first.cartPrice}
              data-image={first.cartImage}
              onClick={handleAddToCart}
              disabled={!first.inStock}
            >
              {first.inStock ? (
                <>Add to Cart • <span className="gx-mini">{first.priceLabel}</span></>
              ) : (
                <>Out of stock</>
              )}
            </button>
          </div>

          <div className="gx-hero__controls gx-intro">
            <div className="gx-hero__arrows">
              <button
                type="button"
                className="gx-arrow gx-arrow--ghost"
                id="gxPrev"
                aria-label="Previous product"
                onClick={handlePrev}
              >
                ←
              </button>
              <button
                type="button"
                className="gx-arrow gx-arrow--solid"
                id="gxNext"
                aria-label="Next product"
                onClick={handleNext}
              >
                →
              </button>
            </div>
            <div
              className="gx-hero__dots"
              id="gxDots"
              role="tablist"
              aria-label="Choose a product"
              ref={dotsRef}
            >
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`gx-dot ${i === 0 ? 'active' : ''}`}
                  role="tab"
                  aria-selected={i === 0 ? 'true' : 'false'}
                  aria-label={`Go to slide ${i + 1}`}
                  onClick={() => handleGoTo(i)}
                />
              ))}
            </div>
            <div className="gx-hero__progress" aria-hidden="true">
              <div id="gxProgressBar"></div>
            </div>
          </div>

          <div className="gx-hero__trust gx-intro">
            <span>✦ Free shipping over ₹999</span>
            <span>✦ Lab-tested purity</span>
            <span>✦ COD available</span>
          </div>
        </div>

        <div className="gx-hero__stage-wrap">
          <div className="gx-hero__next gx-glass">
            <small>Next up</small>
            <strong id="gxNextName">
              {nextUp.word.charAt(0) + nextUp.word.slice(1).toLowerCase()}
            </strong>
          </div>
          <div
            className="gx-stage"
            id="gxStage"
            ref={stageRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* Stage rings removed in latest design update */}
            {slides.map((p, idx) => (
              <div
                key={p.cartId}
                className="gx-slide"
                ref={(el) => {
                  if (el) slidesRef.current[idx] = el;
                }}
              >
                <img
                  src={p.img}
                  alt={p.alt}
                  draggable={false}
                  decoding="async"
                  fetchPriority={idx === 0 ? 'high' : undefined}
                  loading={idx === 0 ? undefined : 'lazy'}
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
            ))}
            <div className="gx-shadow" id="gxShadow" ref={shadowRef} aria-hidden="true"></div>
          </div>
          <div className="gx-hero__badge gx-glass">
            <b id="gxIndex">01</b>
            <span className="gx-hero__badge-sep" aria-hidden="true"></span>
            <small>
              Organic
              <br />
              Certified
            </small>
          </div>
        </div>
      </div>

      <div className="gx-hero__marquee" aria-hidden="true">
        <div className="gx-marquee__viewport">
          <div className="gx-marquee__track">
            {MARQUEE_WORDS.map((word, i) => (
              <span key={i}>✦ {word}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
