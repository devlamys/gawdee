'use client';
import '@/styles/new-pdp.css';
import '@/styles/product-marketing.css';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CatalogItem, CatalogVariant, ProductMarketingContent, Review } from '@/types';
import { ProductMarketingSections } from '@/components/ProductMarketingSections';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';
import { api } from '@/lib/api';
import { money, resolveImageUrl } from '@/lib/utils';
import {
  firstValidVariant,
  isVariantAvailable,
  variantCartLine,
  variantDetailGallery,
  variantDiscountPercent,
} from '@/lib/catalog';
import { ProductCard } from '@/components/ProductCard';
import { useAuth } from '@/context/AuthContext';

function calculateUnitPrice(price: number, weightStr?: string): string {
  if (!weightStr) return '';
  const clean = weightStr.toLowerCase().trim();
  const match = clean.match(/^([\d.]+)\s*(ml|l|kg|g|gm)/i);
  if (!match) return '';
  const val = parseFloat(match[1]);
  const type = match[2].toLowerCase();
  let qty = 1;
  let unit = 'L';
  if (type === 'ml') {
    qty = val / 1000;
    unit = 'L';
  } else if (type === 'g' || type === 'gm') {
    qty = val / 1000;
    unit = 'kg';
  } else if (type === 'l') {
    qty = val;
    unit = 'L';
  } else if (type === 'kg') {
    qty = val;
    unit = 'kg';
  }
  if (qty > 0) {
    return `₹${Math.round(price / qty).toLocaleString('en-IN')}/${unit}`;
  }
  return '';
}

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;

  const { addItem } = useCart();
  const { isWishlisted, toggleWishlist } = useWishlist();
  const { customer, loading: authLoading } = useAuth();

  // Separate state per concern: item data / selected variant / selected
  // image / reviews / related / cart quantity / loading / error.
  const [item, setItem] = useState<CatalogItem | null>(null);
  const [selected, setSelected] = useState<CatalogVariant | null>(null);
  const [activeImage, setActiveImage] = useState<string>('');
  const [imgBroken, setImgBroken] = useState(false);
  // Broken/unnecessary image URLs are dropped so they never render as broken thumbs.
  const [deadSrcs, setDeadSrcs] = useState<string[]>([]);
  const markDead = (src: string) => {
    if (!src) return;
    setDeadSrcs((prev) => (prev.includes(src) ? prev : [...prev, src]));
  };
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewProductId, setReviewProductId] = useState<number | null>(null);
  const [legacyInfo, setLegacyInfo] = useState<{ description?: string; benefits?: string; ingredients?: string }>({});
  const [relatedItems, setRelatedItems] = useState<CatalogItem[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [isStickyVisible, setIsStickyVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY && currentScrollY > 50) {
        setIsStickyVisible(false);
      } else if (currentScrollY < lastScrollY) {
        setIsStickyVisible(true);
      }
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purchaseType, setPurchaseType] = useState<'one_time' | 'subscribe'>('subscribe');
  const [deliveryFreq, setDeliveryFreq] = useState('1 month');
  const [packOffers, setPackOffers] = useState<Array<{ pack_quantity: number; purchase_plan: 'one_time' | 'monthly' | 'two_months'; base_coins: number; bonus_coins: number; estimated_coins: number }>>([]);
  const [packOffersLoading, setPackOffersLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);


  const mainCtaRef = useRef<HTMLDivElement>(null);

  // Review modal state
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewEligibility, setReviewEligibility] = useState<{ eligible: boolean; purchased: boolean; reviewed: boolean } | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);

  // Notify Me toast (custom styled notice — never the browser alert()).
  const [notifyToast, setNotifyToast] = useState(false);
  const notifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reviews + legacy product id follow the SELECTED variant (variant slugs
  // match legacy catalogue rows). Cleared atomically on variant change so
  // stale reviews from another variant are never shown.
  const loadReviews = useCallback(async (variantSlug: string) => {
    setReviewsLoading(true);
    setReviews([]);
    try {
      const res = await api.getProduct(variantSlug);
      if (res.ok) {
        if (res.product) {
          setLegacyInfo({
            description: res.product.description,
            benefits: res.product.benefits,
            ingredients: res.product.ingredients,
          });
        }
        setReviews(res.reviews || []);
      }
    } catch {
      // Reviews stay empty — the section shows its empty state.
    } finally {
      setReviewsLoading(false);
    }
  }, []);

  // Atomic variant switch: price, MRP, discount, stock, SKU, UOM, flags,
  // gallery image and quantity ALL update together — old data never lingers.
  const selectVariant = useCallback((v: CatalogVariant) => {
    setSelected(v);
    setReviewEligibility(null);
    setEligibilityLoading(true);
    setQuantity(1);
    setImgBroken(false);
    setLegacyInfo({});
    // Gallery is strictly this variant's own imagery — item images never enter.
    const gallery = variantDetailGallery(v);
    setActiveImage(gallery[0] || '');
    if (v.slug) {
      loadReviews(v.slug);
    } else {
      setReviews([]);
    }
  }, [loadReviews]);

  // Clear the Notify Me toast timer if the page unmounts while visible.
  useEffect(() => () => {
    if (notifyTimer.current) clearTimeout(notifyTimer.current);
  }, []);

  const selectedPlan = purchaseType === 'subscribe'
    ? (deliveryFreq === '2 months' ? 'two_months' : 'monthly')
    : 'one_time';

  useEffect(() => {
    if (!selected?.id) return;
    let cancelled = false;
    setPackOffersLoading(true);
    api.loyalty.getPackOffers(selected.id)
      .then((res) => {
        if (!cancelled && res.ok) setPackOffers(res.offers || []);
      })
      .catch(() => {
        if (!cancelled) setPackOffers([]);
      })
      .finally(() => {
        if (!cancelled) setPackOffersLoading(false);
      });
    return () => { cancelled = true; };
  }, [selected?.id]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setItem(null);
    setSelected(null);

    api.catalog.getItem(slug)
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.item && (res.item.variants ?? []).length > 0) {
          const itm = res.item;
          setItem(itm);
          setReviewProductId(itm.id);
          // Prefer the variant addressed by the URL; else deterministic default.
          const match =
            itm.variants.find((v) => v.slug === slug || String(v.id) === String(slug) || v.sku === slug) ??
            firstValidVariant(itm);
          if (match) {
            selectVariant(match);
          } else {
            setError('This product has no purchasable variants right now.');
          }

          // Related items: same backend category, excluding self.
          api.catalog.getItems().then((lRes) => {
            if (cancelled || !lRes.ok || !Array.isArray(lRes.items)) return;
            const others = lRes.items.filter(
              (p) =>
                p.id !== itm.id &&
                ((itm.categoryId != null && p.categoryId === itm.categoryId) ||
                  (p.categoryKey && itm.categoryKey && p.categoryKey === itm.categoryKey))
            ).slice(0, 4);
            setRelatedItems(others);
          }).catch(() => {});
        } else {
          setError('Product not found.');
        }
      })
      .catch(() => {
        if (!cancelled) setError('Unable to load product.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, selectVariant]);

  useEffect(() => {
    if (!reviewProductId || authLoading) return;
    if (!customer) {
      setEligibilityLoading(false);
      return;
    }
    let cancelled = false;
    setEligibilityLoading(true);
    api.getReviewEligibility(reviewProductId)
      .then((res) => {
        if (!cancelled) setReviewEligibility(res);
      })
      .catch(() => {
        if (!cancelled) setReviewEligibility(null);
      })
      .finally(() => {
        if (!cancelled) setEligibilityLoading(false);
      });
    return () => { cancelled = true; };
  }, [reviewProductId, customer, authLoading, selected?.id, selected?.slug]);



  if (loading) {
  


  return (
      <div style={{ textAlign: 'center', padding: '6rem 0', color: '#888' }}>
        <i className="ph ph-spinner ph-spin" style={{ fontSize: '2.5rem', color: '#009a84' }}></i>
        <p style={{ marginTop: '0.8rem' }}>Loading product details…</p>
      </div>
    );
  }

  if (error || !item || !selected) {
  


  return (
      <div style={{ textAlign: 'center', padding: '6rem 0' }}>
        <h2>Product not found</h2>
        <p style={{ color: '#666', marginTop: '0.5rem' }}>{error || 'The product you are looking for might be unavailable.'}</p>
        <Link className="button button--primary" href="/products" style={{ marginTop: '1.5rem', display: 'inline-block' }}>
          Back to Catalogue
        </Link>
      </div>
    );
  }

  const wishlisted = isWishlisted(String(selected.id));
  // Discount is a backend value — displayed as returned, never recalculated.
  const discount = variantDiscountPercent(selected);
  const available = isVariantAvailable(selected);
  const stock = Number(selected.stock);
  const validStock = Number.isFinite(stock) && stock >= 0 ? stock : 0;

  const galleryImages = variantDetailGallery(selected);
  // Only real, unique, loadable images — no placeholder fallbacks, no broken thumbs.
  const validGallery = galleryImages.filter(
    (src, i, arr) => !!src && !deadSrcs.includes(src) && arr.indexOf(src) === i
  );
  const activeValid =
    !imgBroken && activeImage && !deadSrcs.includes(activeImage) && validGallery.includes(activeImage)
      ? activeImage
      : '';
  const mainImage = activeValid || validGallery[0] || '';
  const displayTitle = `${item.name} ${selected.variantName}`.trim();

  const marketingContent: ProductMarketingContent = (() => {
    const raw = item.rich_image_sections ?? item.richImageSections ?? item.marketing_content ?? {};
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? { image_sections: parsed } : (parsed || {});
      } catch {
        return {};
      }
    }
    return Array.isArray(raw) ? { image_sections: raw } : raw;
  })();

  const handleAddToCart = () => {
    if (!available) return;
    addItem(
      { ...variantCartLine(item, selected), purchase_plan: selectedPlan },
      quantity,
      true
    );
  };

  const handleBuyNow = () => {
    if (!available) return;
    handleAddToCart();
    router.push('/checkout');
  };

  const handleNotifyMe = () => {
    setNotifyToast(true);
    if (notifyTimer.current) clearTimeout(notifyTimer.current);
    notifyTimer.current = setTimeout(() => setNotifyToast(false), 3500);
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReviewError('');
    if (!reviewBody.trim()) {
      setReviewError('Write at least 15 characters about your experience.');
      return;
    }
    if (!reviewProductId) {
      setReviewError('Reviews are unavailable for this variant right now.');
      return;
    }
    setReviewSubmitting(true);
    try {
      const res = await api.submitReview({
        product_id: reviewProductId,
        review: reviewBody.trim(),
        rating: reviewRating,
      });
      if (res.ok) {
        setReviewSuccess(true);
        if (res.review) {
          setReviews((prev) => [{ ...res.review, id: Date.now(), product_id: reviewProductId } as Review, ...prev]);
        }
        setTimeout(() => {
          setReviewModalOpen(false);
          setReviewSuccess(false);
          setReviewBody('');
          setReviewEligibility({ eligible: false, purchased: true, reviewed: true });
        }, 1500);
      }
    } catch (err: any) {
      setReviewError(err.message || 'Failed to submit review');
    } finally {
      setReviewSubmitting(false);
    }
  };




  return (
    <div className="product-page product-page--reference ref-product-page">
      <div className="container pv-container">
        <section className="pv-hero-grid">
          {/* Left: Gallery (Interactive) */}
          <div className="pv-gallery">
            <div className="pv-gallery__main">
              <span className="pv-gallery__badge">Delicious<br/>Daily<br/>Nutrition</span>
              {mainImage ? (
                <img
                  src={resolveImageUrl(mainImage)}
                  alt={displayTitle}
                  style={{ objectFit: 'contain' }}
                  onError={() => {
                    setImgBroken(true);
                    markDead(mainImage);
                  }}
                />
              ) : (
                <span className="pv-gallery__empty" aria-hidden="true">
                  <i className="ph ph-image"></i>
                </span>
              )}
            </div>
            {validGallery.length > 1 && (
              <div className="pv-gallery__thumbs">
                {validGallery.map((imgSrc, idx) => (
                  <button
                    key={`${imgSrc}-${idx}`}
                    type="button"
                    className={`pv-gallery__thumb ${(activeValid || validGallery[0]) === imgSrc ? 'is-active' : ''}`}
                    onClick={() => {
                      setActiveImage(imgSrc);
                      setImgBroken(false);
                    }}
                    aria-label={`View image ${idx + 1}`}
                  >
                    <img src={resolveImageUrl(imgSrc)} alt="" onError={() => markDead(imgSrc)} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Details (Interactive) */}
          <div className="pv-details">
            <h1 className="pv-title">{displayTitle || 'MULTIVITAMIN GUMMIES\nFOR ADULTS'}</h1>

            <p className="pv-subtitle">
              {((item as any)?.subtitle || legacyInfo?.benefits || legacyInfo?.description || item?.description || 'MILK FROM INDIGENOUS GIR COWS OF GUJARAT | BILONA-CHURNED FROM CURD | NATURALLY RICH IN CLA & BUTYRIC ACID')
                .replace(/<[^>]*>/g, '')
                .trim()
                .slice(0, 210)
                .toUpperCase()}
            </p>

            <div className="pv-social-proof">
              <span className="pv-stars">★★★★★</span>
              <span className="pv-reviews-count">{reviews.length > 0 ? `4.8 (${reviews.length}+ Reviews)` : '2,842+ Reviews'}</span>
            </div>

            <div className="pv-benefit-icons">
              <div className="pv-bicon"><i className="ph ph-leaf"></i></div>
              <div className="pv-bicon"><i className="ph ph-shield-check"></i></div>
              <div className="pv-bicon"><i className="ph ph-cube"></i></div>
              <div className="pv-bicon"><i className="ph ph-flask"></i></div>
              <div className="pv-bicon"><i className="ph ph-prohibit"></i></div>
            </div>

            <div className="pv-price-row">
              <strong className="pv-price">{money(purchaseType === 'subscribe' ? selected.sellingPrice * 0.85 : selected.sellingPrice)}</strong>
              {selected.mrp > selected.sellingPrice && (
                <s className="pv-price-strike">{money(selected.mrp)}</s>
              )}
              <span className="pv-price-badge">Save {discount > 0 ? discount : 25}%</span>
            </div>

            <div className="pv-pack-size">
              <span className="pv-label">Choose Pack Size</span>
              <div className="pv-dropdown-container" ref={dropdownRef} style={{ position: 'relative' }}>
                <div 
                  className="pv-dropdown-wrap" 
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                >
                  <span className="pv-dropdown-badge"><i className="ph-fill ph-star" style={{color: "#a47214", marginRight: 4, fontSize: "0.8rem"}}></i>Bestseller</span>
                  <img src={mainImage ? resolveImageUrl(mainImage) : '/assets/images/temp-products/WhatsApp Image 2026-09-15 at 6.45.50 PM.jpeg'} style={{ width: 32, height: 32, objectFit: 'contain', background: '#fff', borderRadius: 4, border: '1px solid #eaeaea', padding: 2 }} alt="" />
                  <div style={{ flex: 1, fontSize: '1.05rem', fontWeight: 600, color: '#111', userSelect: 'none' }}>
                    {selected ? selected.variantName : '60 Gummies (1 Pack)'}
                  </div>
                  <i className={`ph ph-caret-${dropdownOpen ? 'up' : 'down'} pv-dropdown-arrow`} style={{ transition: 'transform 0.2s' }}></i>
                </div>
                
                {dropdownOpen && (
                  <ul className="pv-custom-dropdown-menu">
                    {item.variants.length > 0 ? item.variants.map((v) => (
                      <li 
                        key={v.id} 
                        className={`pv-custom-dropdown-item ${selected && selected.id === v.id ? 'active' : ''}`}
                        onClick={() => {
                          selectVariant(v);
                          setDropdownOpen(false);
                        }}
                      >
                        {v.variantName}
                      </li>
                    )) : (
                      <li className="pv-custom-dropdown-item active" onClick={() => setDropdownOpen(false)}>
                        60 Gummies (1 Pack)
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>

            <div className="pv-pack-size">
              <span className="pv-label">Select Quantity:</span>
              <div className="pv-qty-grid" key={selectedPlan}>
                 {[1, 2, 3].map((q) => {
                   const offer = packOffers.find((entry) => entry.pack_quantity === q && entry.purchase_plan === selectedPlan);
                   const coins = offer ? `Earn ${offer.estimated_coins}` : 'Earn 0';
                   return (
                     <button 
                       key={q}
                       type="button" 
                       className={`pv-qty-btn ${quantity === q ? 'active' : ''}`}
                       onClick={() => setQuantity(q)}
                     >
                       <span className="pv-coin-badge"><i className="ph-fill ph-coin" style={{marginRight: 3}}></i>{packOffersLoading ? '…' : coins}</span>
                       {q}-PACK
                     </button>
                   );
                 })}
              </div>
              {(() => {
                if (packOffersLoading || packOffers.length === 0) return null;
                const hasSubscribeBonus = [1, 2, 3].some((q) => {
                  const oneTime = packOffers.find((e) => e.pack_quantity === q && e.purchase_plan === 'one_time')?.estimated_coins ?? 0;
                  const monthly = packOffers.find((e) => e.pack_quantity === q && e.purchase_plan === 'monthly')?.estimated_coins ?? 0;
                  const twoMonths = packOffers.find((e) => e.pack_quantity === q && e.purchase_plan === 'two_months')?.estimated_coins ?? 0;
                  return monthly > oneTime || twoMonths > oneTime;
                });
                if (!hasSubscribeBonus) return null;
                return (
                  <p className="pv-subscribe-hint">
                    <i className="ph-fill ph-coin" style={{ marginRight: 4, color: '#c78d1f' }} />
                    {selectedPlan === 'one_time'
                      ? 'Subscribe & Save earns more coins on every delivery'
                      : 'You\'re earning extra coins with your subscription ✓'}
                  </p>
                );
              })()}
            </div>

            <div className="pv-purchase-options">
              <span className="pv-label" style={{ marginBottom: 4 }}>Purchase Option:</span>
              <div className="pv-po-box">
                <label className="pv-po-radio" style={{ paddingBottom: '8px' }}>
                   <input 
                     type="radio" 
                     name="purchase_type" 
                     value="one_time" 
                     checked={purchaseType === 'one_time'}
                     onChange={() => setPurchaseType('one_time')}
                   />
                   <div className="pv-po-radio-content">
                      <div className="pv-po-row">
                        <span className="pv-po-label">One-time purchase</span>
                      </div>
                   </div>
                </label>
                
                <hr className="pv-po-divider" />
                
                <label className="pv-po-radio">
                   <input 
                     type="radio" 
                     name="purchase_type" 
                     value="subscribe"
                     checked={purchaseType === 'subscribe'}
                     onChange={() => setPurchaseType('subscribe')}
                   />
                   <div className="pv-po-radio-content">
                      <div className="pv-po-row">
                        <span className="pv-po-label" style={{ fontWeight: 800 }}>Subscribe & Save 15%</span>
                      </div>
                      <div className="pv-po-sub" style={{ display: purchaseType === 'subscribe' ? 'block' : 'none' }}>
                         <span className="pv-label" style={{ fontSize: '1rem', fontWeight: 500, color: '#333', marginBottom: 4 }}>Choose delivery frequency:</span>
                         <div className="pv-po-freqs">
                           <button 
                             type="button" 
                             className={deliveryFreq === '1 month' ? 'active' : ''}
                             onClick={(e) => { e.preventDefault(); setDeliveryFreq('1 month'); }}
                           >
                             Every 1 month
                           </button>
                           <button 
                             type="button" 
                             className={deliveryFreq === '2 months' ? 'active' : ''}
                             onClick={(e) => { e.preventDefault(); setDeliveryFreq('2 months'); }}
                           >
                             Every 2 months
                           </button>
                         </div>
                      </div>
                   </div>
                </label>
              </div>
            </div>

            <button 
              className="pv-add-cart" 
              type="button"
              onClick={available ? handleBuyNow : handleNotifyMe}
            >
               {available ? 'ADD TO CART' : 'NOTIFY ME'}
            </button>

            <div style={{ marginTop: '32px', marginBottom: '32px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, textTransform: 'uppercase', color: '#111', marginBottom: '12px' }}>
                Product Description
              </h3>
              <p style={{ fontSize: '1.05rem', lineHeight: 1.6, color: '#555', whiteSpace: 'pre-line' }}>
                {item.description || legacyInfo.description || 'Handcrafted using traditional methods to preserve authentic flavor and natural nutrition.'}
              </p>
            </div>

            <div className="pv-trust-badges">
               <div className="pv-tb">
                 <i className="ph ph-truck"></i>
                 <span>Free<br/>Worldwide Shipping</span>
               </div>
               <div className="pv-tb">
                 <i className="ph ph-lock-key"></i>
                 <span>Secure<br/>Checkout</span>
               </div>
               <div className="pv-tb">
                 <i className="ph ph-clock-counter-clockwise"></i>
                 <span>90 Day<br/>Money-Back Guarantee</span>
               </div>
            </div>
          </div>
        </section>

        {/* Description, Benefits, Ingredients */}
        <div style={{ marginTop: '4rem', borderTop: '1px solid #eee', paddingTop: '3rem' }}>
          <div style={{ maxWidth: '800px' }}>


            {legacyInfo.benefits && (
              <div style={{ marginTop: '2.5rem' }}>
                <h3 style={{ fontSize: '1.3rem', marginBottom: '0.8rem', color: '#111' }}>Key Benefits</h3>
                <div style={{ background: '#fafbf9', padding: '1.5rem', borderRadius: '12px', border: '1px solid #edf0ec', whiteSpace: 'pre-line', color: '#444', lineHeight: 1.6 }}>
                  {legacyInfo.benefits}
                </div>
              </div>
            )}

            {legacyInfo.ingredients && (
              <div style={{ marginTop: '2.5rem' }}>
                <h3 style={{ fontSize: '1.3rem', marginBottom: '0.8rem', color: '#111' }}>Ingredients &amp; Sourcing</h3>
                <p style={{ color: '#555', lineHeight: 1.6 }}>{legacyInfo.ingredients}</p>
              </div>
            )}
            

          </div>
        </div>

        <ProductMarketingSections content={marketingContent} productName={item.name} />

        {/* Customer Reviews */}
        <section style={{ marginTop: '4.5rem', borderTop: '1px solid #eee', paddingTop: '3rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.8rem', margin: 0 }}>Customer Reviews</h2>
              <p style={{ color: '#777', margin: '0.3rem 0 0' }}>Real feedback from verified ritual consumers.</p>
            </div>
            {!authLoading && !customer ? (
              <Link className="button button--secondary" href={`/login?next=/products/${slug}`}>
                Sign in to review
              </Link>
            ) : (
              <button
                className="button button--secondary"
                type="button"
                disabled={eligibilityLoading || Boolean(reviewEligibility?.reviewed)}
                onClick={() => {
                  if (reviewEligibility && !reviewEligibility.eligible && !reviewEligibility.purchased) {
                    setReviewError('Only verified buyers who have purchased this product can leave a review.');
                  } else {
                    setReviewError('');
                  }
                  setReviewModalOpen(true);
                }}
                title={reviewEligibility?.reviewed ? 'You already reviewed this product' : !reviewEligibility?.purchased ? 'Available after purchasing this product' : undefined}
              >
                {eligibilityLoading ? 'Checking purchase...' : reviewEligibility?.reviewed ? 'Review submitted' : 'Write a review'}
              </button>
            )}
          </div>

          {reviewsLoading && reviews.length === 0 ? (
            <div style={{ padding: '2rem', background: '#fbfcf9', borderRadius: '12px', textAlign: 'center', color: '#777' }}>
              <p><i className="ph ph-spinner ph-spin"></i> Loading reviews…</p>
            </div>
          ) : reviews.length === 0 ? (
            <div style={{ padding: '2rem', background: '#fbfcf9', borderRadius: '12px', textAlign: 'center', color: '#777' }}>
              <p>No reviews yet. Be the first to share your experience!</p>
            </div>
          ) : (
            <div className="pv-reviews-scroll">
              {reviews.map((r) => {
                const reviewText = r.review || r.body || '';
                const truncatedText = reviewText.length > 358 ? reviewText.slice(0, 358) + '...' : reviewText;
                
                return (
                  <div key={r.id} style={{ 
                    background: '#fcfaf6', 
                    border: '1px solid #f0eee5', 
                    borderRadius: '16px', 
                    padding: '1.5rem',
                    minWidth: '340px',
                    width: '340px',
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    <div style={{ display: 'flex', color: '#f59e0b', gap: '0.1rem', marginBottom: '1rem' }}>
                      {[...Array(r.rating || 5)].map((_, i) => (
                        <i key={i} className="ph-fill ph-star" style={{ fontSize: '1rem' }}></i>
                      ))}
                    </div>
                    
                    <p style={{ fontSize: '0.95rem', color: '#555', fontStyle: 'italic', lineHeight: 1.6, flex: 1, margin: 0 }}>
                      "{truncatedText}"
                    </p>
                    
                    <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #eae1d3', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <span style={{ fontWeight: 700, color: '#1e4027', fontSize: '0.95rem' }}>{r.name || r.author_name}</span>
                        <span style={{ fontSize: '0.8rem', color: '#4a7556' }}>{item.name || displayTitle}{r.location ? ` • ${r.location}` : ''}</span>
                      </div>
                      <div style={{ background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        Verified Buyer
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Related Products */}
        {relatedItems.length > 0 && (
          <section style={{ marginTop: '4rem', borderTop: '1px solid #eee', paddingTop: '3rem' }}>
            <h2 style={{ fontSize: 'clamp(1.4rem, 4vw, 1.8rem)', marginBottom: '1.5rem' }}>You may also like</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: '1.5rem' }}>
              {relatedItems.map((p) => (
                <ProductCard key={p.id} item={p} />
              ))}
            </div>
          </section>
        )}

        {/* Mobile Sticky Add to Bag Bar */}
        <div
          className={`pdp-sticky-bar ${!isStickyVisible ? 'is-hidden' : ''}`}
          data-pdp-sticky-bar
          aria-label="Quick purchase bar"
        >
          <div className="pdp-sticky-bar__quantity ref-quantity" aria-label="Quantity selector">
            <button
              type="button"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              aria-label="Decrease quantity"
            >
              <i className="ph ph-minus"></i>
            </button>
            <span aria-live="polite">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity(quantity + 1)}
              aria-label="Increase quantity"
            >
              <i className="ph ph-plus"></i>
            </button>
          </div>
          <button
            type="button"
            className="pdp-sticky-bar__btn"
            onClick={available ? handleAddToCart : handleNotifyMe}
            disabled={false}
          >
            {!available ? 'NOTIFY ME' : 'ADD TO CART'}
          </button>
        </div>

        {/* Notify Me toast — custom styled alert, auto-dismisses */}
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: '2rem',
            transform: notifyToast ? 'translate(-50%, 0)' : 'translate(-50%, 1rem)',
            opacity: notifyToast ? 1 : 0,
            visibility: notifyToast ? 'visible' : 'hidden',
            pointerEvents: notifyToast ? 'auto' : 'none',
            transition: 'opacity 0.3s ease, transform 0.3s ease, visibility 0.3s',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            maxWidth: 'min(92vw, 420px)',
            background: '#123524',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '14px',
            padding: '0.9rem 1rem',
            boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
          }}
        >
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              flexShrink: 0,
              borderRadius: '50%',
              background: '#1d7a5f',
            }}
          >
            <i className="ph-fill ph-bell-ringing" style={{ fontSize: '1.1rem' }}></i>
          </span>
          <span style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>
            <strong>Coming soon!</strong> We&apos;ll notify you when this product is back in stock.
          </span>
          <button
            type="button"
            onClick={() => setNotifyToast(false)}
            aria-label="Dismiss notification"
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 0,
              color: '#fff',
              cursor: 'pointer',
              fontSize: '1rem',
              lineHeight: 1,
              padding: '0.25rem',
              opacity: 0.8,
            }}
          >
            <i className="ph ph-x"></i>
          </button>
        </div>

        {/* Review Modal Dialog */}
        {reviewModalOpen && (
          <div
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setReviewModalOpen(false);
            }}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '1rem',
            }}
          >
            <div role="dialog" aria-modal="true" aria-labelledby="review-dialog-title" style={{ background: '#fff', borderRadius: '16px', maxWidth: '500px', width: '100%', padding: '2rem', position: 'relative' }}>
              <button
                type="button"
                onClick={() => setReviewModalOpen(false)}
                style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}
                aria-label="Close"
              >
                <i className="ph ph-x"></i>
              </button>

              <h3 id="review-dialog-title" style={{ fontSize: '1.4rem', marginBottom: '0.4rem' }}>Write a Review</h3>
              <p style={{ color: '#777', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Share your experience with {item.name}</p>

              {reviewSuccess ? (
                <div style={{ padding: '1.5rem', background: '#e6f6f2', color: '#009a84', borderRadius: '8px', textAlign: 'center', fontWeight: 600 }}>
                  <i className="ph ph-check-circle" style={{ fontSize: '1.8rem', display: 'block', marginBottom: '0.5rem' }}></i>
                  Thank you! Your review has been submitted.
                </div>
              ) : (
                <form noValidate onSubmit={handleReviewSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Rating</label>
                    <div style={{ display: 'flex', gap: '0.25rem', color: '#c19a3d' }} aria-label={`${reviewRating} out of 5 stars`}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          type="button"
                          key={star}
                          onClick={() => setReviewRating(star)}
                          aria-label={`${star} star${star === 1 ? '' : 's'}`}
                          style={{ border: 0, background: 'transparent', color: 'inherit', padding: '0.2rem', cursor: 'pointer', fontSize: '1.6rem' }}
                        ><i className={`ph ${star <= reviewRating ? 'ph-fill ph-star' : 'ph-star'}`}></i></button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Review Details</label>
                    <textarea
                      required
                      rows={4}
                      value={reviewBody}
                      onChange={(e) => setReviewBody(e.target.value)}
                      aria-invalid={Boolean(reviewError)}
                      aria-describedby={reviewError ? 'review-error' : undefined}
                      placeholder="Tell other families how you enjoyed this product…"
                      style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px', fontFamily: 'inherit', resize: 'none' }}
                    ></textarea>
                  </div>

                  {reviewError && <p id="review-error" role="alert" style={{ margin: 0, color: '#a12f2f', fontSize: '0.85rem' }}>{reviewError}</p>}

                  <button
                    type="submit"
                    disabled={reviewSubmitting}
                    className="button button--primary"
                    style={{ marginTop: '0.5rem' }}
                  >
                    {reviewSubmitting ? 'Submitting…' : 'Submit Review'}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
