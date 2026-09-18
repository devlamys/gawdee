'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CatalogItem, CatalogVariant, Review } from '@/types';
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

  // Separate state per concern: item data / selected variant / selected
  // image / reviews / related / cart quantity / loading / error.
  const [item, setItem] = useState<CatalogItem | null>(null);
  const [selected, setSelected] = useState<CatalogVariant | null>(null);
  const [activeImage, setActiveImage] = useState<string>('');
  const [imgBroken, setImgBroken] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [legacyProductId, setLegacyProductId] = useState<string | null>(null);
  const [legacyInfo, setLegacyInfo] = useState<{ description?: string; benefits?: string; ingredients?: string }>({});
  const [relatedItems, setRelatedItems] = useState<CatalogItem[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const mainCtaRef = useRef<HTMLDivElement>(null);

  // Review modal state
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewAuthor, setReviewAuthor] = useState('');
  const [reviewEmail, setReviewEmail] = useState('');
  const [reviewBody, setReviewBody] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);

  // Notify Me toast (custom styled notice — never the browser alert()).
  const [notifyToast, setNotifyToast] = useState(false);
  const notifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reviews + legacy product id follow the SELECTED variant (variant slugs
  // match legacy catalogue rows). Cleared atomically on variant change so
  // stale reviews from another variant are never shown.
  const loadReviews = useCallback(async (variantSlug: string) => {
    setReviewsLoading(true);
    setReviews([]);
    setLegacyProductId(null);
    try {
      const res = await api.getProduct(variantSlug);
      if (res.ok) {
        if (res.product) {
          setLegacyProductId(res.product.id);
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
      setLegacyProductId(null);
    }
  }, [loadReviews]);

  // Clear the Notify Me toast timer if the page unmounts while visible.
  useEffect(() => () => {
    if (notifyTimer.current) clearTimeout(notifyTimer.current);
  }, []);

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
  const mainImage = (!imgBroken && activeImage) || galleryImages[0] || '';
  const displayTitle = `${item.name} ${selected.variantName}`.trim();

  const handleAddToCart = () => {
    if (!available) return;
    addItem(
      variantCartLine(item, selected),
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
    if (!reviewAuthor.trim() || !reviewEmail.trim() || !reviewBody.trim()) return;
    if (!legacyProductId) {
      alert('Reviews are unavailable for this variant right now.');
      return;
    }
    setReviewSubmitting(true);
    try {
      const res = await api.submitReview({
        product_id: legacyProductId,
        name: reviewAuthor.trim(),
        email: reviewEmail.trim(),
        review: reviewBody.trim(),
        rating: reviewRating,
      });
      if (res.ok) {
        setReviewSuccess(true);
        if (res.review) {
          setReviews((prev) => [{ ...res.review, id: Date.now(), product_id: legacyProductId } as Review, ...prev]);
        }
        setTimeout(() => {
          setReviewModalOpen(false);
          setReviewSuccess(false);
          setReviewAuthor('');
          setReviewEmail('');
          setReviewBody('');
        }, 1500);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to submit review');
    } finally {
      setReviewSubmitting(false);
    }
  };

  return (
    <div className="product-page product-page--reference ref-product-page" style={{ padding: '6rem 0 5rem' }}>
      <div className="container ref-product-container">
        {/* Product Hero Grid */}
        <section className="ref-product-hero pdp-hero-grid" aria-labelledby="product-title">
          {/* Gallery — images belong to the selected variant; cleared on switch */}
          <div className="ref-gallery">
            <div className="ref-gallery__thumbs" aria-label="Product images">
              {galleryImages.map((imgSrc, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`ref-gallery__thumb ${activeImage === imgSrc ? 'is-active' : ''}`}
                  onClick={() => {
                    setActiveImage(imgSrc);
                    setImgBroken(false);
                  }}
                  aria-label={`Show ${displayTitle} — image ${idx + 1}`}
                  aria-pressed={activeImage === imgSrc}
                >
                  <img
                    src={resolveImageUrl(imgSrc)}
                    alt=""
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                </button>
              ))}
            </div>
            <div className="ref-gallery__stage" style={{ ['--product-accent' as any]: item.accent || '#009a84' }}>
              <span className="ref-gallery__badge">{item.tag || 'Popular'}</span>              <button
                type="button"
                onClick={() => toggleWishlist(String(selected.id))}
                style={{
                  position: 'absolute',
                  top: '1rem',
                  right: '1rem',
                  background: '#fff',
                  border: '1px solid #ddd',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                }}
                aria-label="Wishlist toggle"
              >
                <i className={`ph ${wishlisted ? 'ph-fill ph-heart' : 'ph-heart'}`} style={{ color: wishlisted ? '#e03131' : '#555', fontSize: '1.2rem' }}></i>
              </button>
              {mainImage ? (
                <img
                  src={resolveImageUrl(mainImage)}
                  alt={displayTitle}
                  data-product-main-image
                  onError={() => setImgBroken(true)}
                />
              ) : (
                <div
                  className="ref-gallery__empty"
                  role="img"
                  aria-label={`No photos yet for ${displayTitle}`}
                  style={{
                    width: '100%',
                    minHeight: '320px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.6rem',
                    color: '#8a978f',
                    background: 'radial-gradient(circle at 30% 25%, rgba(31,77,58,0.07), transparent 55%), #faf7f2',
                  }}
                >
                  <i className="ph ph-image" style={{ fontSize: '3rem' }} aria-hidden="true"></i>
                  <span style={{ fontSize: '0.9rem' }}>Photos coming soon</span>
                </div>
              )}
            </div>
          </div>

          {/* Buybox */}
          <div className="ref-buybox">
            <h1 id="product-title" data-variant-title>
              {displayTitle}{' '}
              <i className="ph-fill ph-seal-check" aria-label="Verified product"></i>
            </h1>

            <div className="ref-buybox__header-row">
              <a className="ref-rating" href="#reviews">
                <span aria-hidden="true">★★★★★</span>
                {Number(item.rating) > 0 ? (
                  <>
                    <strong>{Number(item.rating).toFixed(1)}</strong>
                    <small>({reviews.length} review{reviews.length === 1 ? '' : 's'})</small>
                  </>
                ) : (
                  <>
                    <strong>New</strong>
                    <small>({reviews.length === 0 ? 'No reviews yet' : `${reviews.length} review${reviews.length === 1 ? '' : 's'}`})</small>
                  </>
                )}
              </a>

              <div className="ref-buybox__price-block">
                <div className="ref-price">
                  <strong data-variant-price>{money(selected.sellingPrice)}</strong>
                  {selected.mrp > selected.sellingPrice && (
                    <s data-variant-original-price>{money(selected.mrp)}</s>
                  )}
                  {discount > 0 && (
                    <span data-variant-discount>{discount}% OFF</span>
                  )}
                </div>
                <small className="ref-tax" data-variant-tax>
                  {selected.isInclusive ? 'Inclusive of all taxes' : 'Exclusive of taxes'}
                </small>
              </div>
            </div>

            {discount > 0 && selected.mrp > selected.sellingPrice && (
              <div className="ref-promo-badges">
                <div className="ref-badge-best-price">
                  <strong>Save {discount}%</strong>{' '}
                  <span className="ref-badge-best-price-code">vs MRP</span>
                </div>
              </div>
            )}

            {item.variants.length > 0 && (
              <>
                <div className="ref-variants-title">Select Variant</div>
                <div className="ref-variants">
                  <div className="ref-variants-grid">
                    {item.variants.map((v) => {
                      const isCurrent = v.id === selected.id;
                      const vDiscount = variantDiscountPercent(v);
                      const unitPrice = calculateUnitPrice(v.sellingPrice, v.variantName);
                      const vAvailable = isVariantAvailable(v);
                      return (
                        <button
                          key={v.id}
                          type="button"
                          className={`ref-variant-chip ${isCurrent ? 'is-active' : ''}`}
                          onClick={() => selectVariant(v)}
                          aria-label={`${v.variantName}, ${money(v.sellingPrice)}${vAvailable ? '' : ', sold out'}`}
                        >
                          <span className="ref-variant-weight">{v.variantName}{v.uom ? ` · ${v.uom}` : ''}</span>
                          <span className="ref-variant-pricing">
                            <span className="ref-variant-price">{money(v.sellingPrice)}</span>
                            {v.mrp > v.sellingPrice && (
                              <>
                                <span className="ref-variant-mrp">{money(v.mrp)}</span>
                                <span className="ref-variant-discount">{vDiscount}% off</span>
                              </>
                            )}
                          </span>
                          {unitPrice && (
                            <span className="ref-variant-unitprice">{unitPrice}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <div className="ref-buybox__description-wrap">
              <strong className="ref-description-title">PRODUCT DESCRIPTION</strong>
              <p className="ref-buybox__description">{item.description}</p>
            </div>

            <p className="ref-sku" style={{ fontSize: '0.72rem', marginTop: '-12px', marginBottom: '20px' }}>
              SKU: <strong data-variant-sku>{selected.sku || '—'}</strong>
              {selected.uom && (
                <> · UOM: <strong data-variant-uom>{selected.uom}</strong></>
              )}
            </p>

            <div className="ref-quantity-row">
              <strong>Quantity</strong>
              <div className="ref-quantity" aria-label="Quantity selector">
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
              <span className="ref-stock" data-variant-stock>
                <i></i>
                {available ? `In stock${validStock > 0 ? ` (${validStock} available)` : ''}` : 'Out of stock'}
              </span>
            </div>

            <div ref={mainCtaRef} className="ref-purchase-actions">
              {available ? (
                <>
                  <button
                    className="ref-add product-add"
                    type="button"
                    onClick={handleAddToCart}
                  >
                    Add to Cart <i className="ph ph-shopping-cart"></i>
                  </button>
                  <button
                    className="ref-buy-now"
                    type="button"
                    onClick={handleBuyNow}
                  >
                    Buy Now
                  </button>
                </>
              ) : (
                <button
                  className="ref-buy-now"
                  type="button"
                  onClick={handleNotifyMe}
                  style={{ gridColumn: '1 / -1' }}
                  aria-label={`Notify me when ${displayTitle} is back in stock`}
                >
                  Notify Me <i className="ph ph-bell-ringing"></i>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Shopping Assurances Strip */}
        <section className="ref-trust-strip" aria-label="Shopping assurances">
          <article className="ref-trust-item ref-trust-item--delivery">
            <img src="/assets/icons/product/free-delivery.webp" alt="Free Delivery" className="ref-trust-icon" width={48} height={48} loading="lazy" />
            <span><strong>Free Delivery</strong>On orders above ₹999</span>
          </article>
          <article className="ref-trust-item ref-trust-item--secure">
            <img src="/assets/icons/product/secure-payment.webp" alt="Secure Payment" className="ref-trust-icon" width={48} height={48} loading="lazy" />
            <span><strong>Secure Payment</strong>100% safe &amp; trusted</span>
          </article>
          <article className="ref-trust-item ref-trust-item--returns">
            <img src="/assets/icons/product/easy-returns.webp" alt="Easy Returns" className="ref-trust-icon" width={48} height={48} loading="lazy" />
            <span><strong>Easy Returns</strong>Hassle-free returns</span>
          </article>
          <article className="ref-trust-item ref-trust-item--support">
            <img src="/assets/icons/product/customer-support.webp" alt="Customer Support" className="ref-trust-icon" width={48} height={48} loading="lazy" />
            <span><strong>Customer Support</strong>Mon – Sat (9AM – 7PM)</span>
          </article>
        </section>

        {/* Purity Row & Story Card */}
        <section className="ref-purity-row">
          <div className="ref-purity-icons">
            <article className="ref-purity-item ref-purity-item--organic">
              <img src="/assets/icons/product/organic.webp" alt="100% Organic" className="ref-purity-icon" width={48} height={48} loading="lazy" />
              <div>
                <strong>100% Organic</strong>
                <span>Pure &amp; Natural</span>
              </div>
            </article>
            <article className="ref-purity-item ref-purity-item--chemicals">
              <img src="/assets/icons/product/no-chemicals.webp" alt="No Chemicals" className="ref-purity-icon" width={48} height={48} loading="lazy" />
              <div>
                <strong>No Chemicals</strong>
                <span>No Additives</span>
              </div>
            </article>
            {selected.isLabTested && (
              <article className="ref-purity-item ref-purity-item--lab">
                <img src="/assets/icons/product/lab-tested.webp" alt="Lab Tested" className="ref-purity-icon" width={48} height={48} loading="lazy" />
                <div>
                  <strong>Lab Tested</strong>
                  <span>For Purity</span>
                </div>
              </article>
            )}
            {selected.isNatural && (
              <article className="ref-purity-item ref-purity-item--natural">
                <i className="ph-fill ph-leaf" aria-hidden="true" style={{ fontSize: '48px', color: '#2e7d5b', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}></i>
                <div>
                  <strong>100% Natural</strong>
                  <span>Nothing Artificial</span>
                </div>
              </article>
            )}
            <article className="ref-purity-item ref-purity-item--quality">
              <img src="/assets/icons/product/premium-quality.webp" alt="Premium Quality" className="ref-purity-icon" width={48} height={48} loading="lazy" />
              <div>
                <strong>Premium Quality</strong>
                <span>Thoughtfully Made</span>
              </div>
            </article>
          </div>
          <article className="ref-story-card">
            <picture className="ref-story-card__picture">
              <source media="(max-width: 480px)" srcSet="/assets/images/story-mobile-portrait.webp" />
              <source media="(max-width: 768px)" srcSet="/assets/images/story-mobile-square.webp" />
              <img src="/assets/images/story-desktop.webp" alt="Rooted in Purity, Inspired by Nature - A2 Gir Cow Ghee" loading="lazy" className="ref-story-card__banner" />
            </picture>
          </article>
        </section>

        {/* Description, Benefits, Ingredients */}
        <div style={{ marginTop: '4rem', borderTop: '1px solid #eee', paddingTop: '3rem' }}>
          <div style={{ maxWidth: '800px' }}>
            <h2 style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>About this Product</h2>
            <p style={{ fontSize: '1.05rem', lineHeight: 1.7, color: '#444', whiteSpace: 'pre-line' }}>
              {item.description || legacyInfo.description || 'Handcrafted using traditional methods to preserve authentic flavor and natural nutrition.'}
            </p>

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

        {/* Customer Reviews */}
        <section style={{ marginTop: '4.5rem', borderTop: '1px solid #eee', paddingTop: '3rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.8rem', margin: 0 }}>Customer Reviews</h2>
              <p style={{ color: '#777', margin: '0.3rem 0 0' }}>Real feedback from verified ritual consumers.</p>
            </div>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setReviewModalOpen(true)}
              style={{ borderColor: '#009a84', color: '#009a84' }}
            >
              Write a review
            </button>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1.2rem' }}>
              {reviews.map((r) => (
                <div key={r.id} style={{ background: '#fff', border: '1px solid #eee', borderRadius: '12px', padding: '1.5rem' }}>
                  <div style={{ display: 'flex', color: '#c19a3d', gap: '0.2rem', marginBottom: '0.5rem' }}>
                    {[...Array(r.rating)].map((_, i) => (
                      <i key={i} className="ph-fill ph-star"></i>
                    ))}
                  </div>
                  {(r.title) && <strong style={{ display: 'block', marginBottom: '0.4rem', color: '#111' }}>{r.title}</strong>}
                  <p style={{ fontSize: '0.9rem', color: '#555', lineHeight: 1.5, margin: 0 }}>{r.review || r.body}</p>
                  <div style={{ marginTop: '1rem', paddingTop: '0.6rem', borderTop: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#888' }}>
                    <span>{r.name || r.author_name}</span>
                    <span>{r.created_at || r.date ? new Date((r.created_at || r.date) as string).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</span>
                  </div>
                </div>
              ))}
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
          className="pdp-sticky-bar"
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
            <div style={{ background: '#fff', borderRadius: '16px', maxWidth: '500px', width: '100%', padding: '2rem', position: 'relative' }}>
              <button
                type="button"
                onClick={() => setReviewModalOpen(false)}
                style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}
                aria-label="Close"
              >
                <i className="ph ph-x"></i>
              </button>

              <h3 style={{ fontSize: '1.4rem', marginBottom: '0.4rem' }}>Write a Review</h3>
              <p style={{ color: '#777', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Share your experience with {item.name}</p>

              {reviewSuccess ? (
                <div style={{ padding: '1.5rem', background: '#e6f6f2', color: '#009a84', borderRadius: '8px', textAlign: 'center', fontWeight: 600 }}>
                  <i className="ph ph-check-circle" style={{ fontSize: '1.8rem', display: 'block', marginBottom: '0.5rem' }}></i>
                  Thank you! Your review has been submitted.
                </div>
              ) : (
                <form onSubmit={handleReviewSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Rating</label>
                    <div style={{ display: 'flex', gap: '0.5rem', fontSize: '1.6rem', color: '#c19a3d', cursor: 'pointer' }}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <i
                          key={star}
                          className={`ph ${star <= reviewRating ? 'ph-fill ph-star' : 'ph-star'}`}
                          onClick={() => setReviewRating(star)}
                        ></i>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Your Name</label>
                    <input
                      type="text"
                      required
                      value={reviewAuthor}
                      onChange={(e) => setReviewAuthor(e.target.value)}
                      placeholder="e.g. Priya Sharma"
                      style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Email Address</label>
                    <input
                      type="email"
                      required
                      value={reviewEmail}
                      onChange={(e) => setReviewEmail(e.target.value)}
                      placeholder="name@example.com"
                      style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Review Details</label>
                    <textarea
                      required
                      rows={4}
                      value={reviewBody}
                      onChange={(e) => setReviewBody(e.target.value)}
                      placeholder="Tell other families how you enjoyed this product…"
                      style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px', fontFamily: 'inherit' }}
                    ></textarea>
                  </div>

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
