'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CatalogItem } from '@/types';
import { useCart } from '@/context/CartContext';
import { money, resolveImageUrl } from '@/lib/utils';
import {
  firstValidVariant,
  isVariantAvailable,
  itemCardImage,
  itemHoverImage,
  variantCartLine,
  variantDiscountPercent,
} from '@/lib/catalog';

interface ProductCardProps {
  item: CatalogItem;
  index?: number;
}

export const ProductCard: React.FC<ProductCardProps> = ({ item }) => {
  const { addItem, updateQuantity, openVariantsDrawer, items } = useCart();
  const router = useRouter();
  const addBtnRef = useRef<HTMLButtonElement>(null);

  const variants = item.variants ?? [];
  const hasVariants = variants.length > 1;

  // Deterministic default: first valid backend variant (no invented pricing).
  const [selectedId, setSelectedId] = useState<number | null>(() => firstValidVariant(item)?.id ?? null);
  const selected = variants.find((v) => v.id === selectedId) ?? firstValidVariant(item);

  // Badge uses the real backend item tag only — never invent Best Seller / New Launch.
  const badgeText = (item.tag || '').trim();

  const rating = Number(item.rating) || 0;
  const reviewCount = Number(item.reviewCount) || 0;

  const discount = variantDiscountPercent(selected);
  const available = isVariantAvailable(selected);
  // Card imagery is strictly item-level: ImageUrl normally, HoverImageUrl on
  // hover (falling back to ImageUrl). Variant imagery never appears on cards.
  const mainImage = itemCardImage(item);
  const hoverImage = itemHoverImage(item);
  const [hovered, setHovered] = useState(false);
  const shownImage = hovered && hoverImage ? hoverImage : mainImage;

  const categoryText = (item.category || '').toUpperCase();
  const weightText = (selected?.variantName || '').toUpperCase();

  // 1-click stepper state comes straight from the real cart — no local guess.
  const cartQty = selected ? (items.find((i) => i.id === String(selected.id))?.quantity ?? 0) : 0;

  const playAddedAnimation = () => {
    if (typeof window !== 'undefined' && (window as any).lottie && addBtnRef.current) {
      const btn = addBtnRef.current;
      btn.classList.add('is-added');
      let lottieContainer = btn.querySelector('.lottie-btn-anim') as HTMLElement | null;
      if (!lottieContainer) {
        lottieContainer = document.createElement('div');
        lottieContainer.className = 'lottie-btn-anim';
        lottieContainer.style.position = 'absolute';
        lottieContainer.style.top = '50%';
        lottieContainer.style.left = '50%';
        lottieContainer.style.transform = 'translate(-50%, -50%)';
        lottieContainer.style.width = '36px';
        lottieContainer.style.height = '36px';
        lottieContainer.style.pointerEvents = 'none';
        btn.style.position = 'relative';
        btn.appendChild(lottieContainer);
      }
      lottieContainer.innerHTML = '';
      try {
        const anim = (window as any).lottie.loadAnimation({
          container: lottieContainer,
          renderer: 'svg',
          loop: false,
          autoplay: true,
          path: '/assets/images/animation/AddToCartSuccess.json',
        });
        anim.addEventListener('complete', () => {
          btn.classList.remove('is-added');
          if (lottieContainer) lottieContainer.innerHTML = '';
        });
      } catch {}
    }
  };

  const handleAddToCart = () => {
    if (!selected || !available) return;
    if (hasVariants) {
      openVariantsDrawer(item, variants);
      return;
    }
    playAddedAnimation();
    addItem(variantCartLine(item, selected), 1, true);
  };

  const handleBuyNow = () => {
    if (!selected || !available) return;
    if (hasVariants) {
      openVariantsDrawer(item, variants);
      return;
    }
    addItem(variantCartLine(item, selected), 1, true);
    router.push('/checkout');
  };

  if (!selected) {
    return (
      <article className="org-card reveal">
        <div className="org-card__body">
          <h3 className="org-card__title">{item.name}</h3>
          <p style={{ color: '#777' }}>This product has no purchasable variants right now.</p>
          <Link className="text-link" href={`/products/${item.slug}`}>
            View details <i className="ph ph-arrow-right"></i>
          </Link>
        </div>
      </article>
    );
  }

  return (
    <article
      className="org-card reveal"
      data-category={item.categoryKey || item.category?.toLowerCase()}
      data-search-name={`${item.name} ${item.category}`.toLowerCase()}
    >
      <Link
        className="org-card__media"
        href={`/products/${item.slug}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {badgeText && <span className="org-card__badge">{badgeText}</span>}
        {discount > 0 && <span className="org-card__off">{discount}% off</span>}
        {shownImage ? (
          <img
            src={resolveImageUrl(shownImage)}
            alt={`${item.name} ${selected.variantName}`.trim()}
            loading="lazy"
          />
        ) : (
          <span className="org-card__noimage" aria-hidden="true">
            <i className="ph ph-image"></i>
          </span>
        )}
      </Link>

      <div className="org-card__body">
        <ul className="org-card__trust" aria-label="Quality promises">
          {selected.isLabTested && (
            <li>
              <i className="ph-fill ph-flask-conical" aria-hidden="true"></i> Lab Tested
            </li>
          )}
          {selected.isNatural && (
            <li>
              <i className="ph-fill ph-leaf" aria-hidden="true"></i> Natural
            </li>
          )}
          <li>
            <i className="ph-fill ph-seal-check" aria-hidden="true"></i> Authentic
          </li>
        </ul>

        <div className="org-card__meta">
          {categoryText} {categoryText && weightText ? '•' : ''} {weightText}
        </div>

        <h3 className="org-card__title">
          <Link href={`/products/${item.slug}`}>{item.name}</Link>
        </h3>

        {hasVariants && (
          <div className="card-variant-pills" role="group" aria-label="Choose a pack size">
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`card-variant-pill ${v.id === selected.id ? 'is-active' : ''}`}
                onClick={() => setSelectedId(v.id)}
                aria-pressed={v.id === selected.id}
                aria-label={`${v.variantName}, ${money(v.sellingPrice)}${isVariantAvailable(v) ? '' : ', sold out'}`}
              >
                {v.variantName}
              </button>
            ))}
          </div>
        )}

        <div className="org-card__rating">
          <i className="ph-fill ph-star" aria-hidden="true"></i>
          {rating > 0 ? (
            <>
              <span>{rating.toFixed(1)}</span>
              {reviewCount > 0 && <small>({reviewCount})</small>}
            </>
          ) : (
            <small>New · No reviews yet</small>
          )}
        </div>

        <div className="org-card__price">
          <strong>{money(selected.sellingPrice)}</strong>
          {selected.mrp > selected.sellingPrice && (
            <s>{money(selected.mrp)}</s>
          )}
          {discount > 0 && <em>Save {discount}%</em>}
        </div>

        <div className="org-card__actions">
          {!available ? (
            <button type="button" className="org-btn" disabled>
              Out of stock
            </button>
          ) : hasVariants ? (
            <button
              type="button"
              className="org-btn"
              onClick={() => openVariantsDrawer(item, variants)}
              aria-label={`Choose a pack size for ${item.name}`}
            >
              Choose pack <i className="ph ph-caret-down" aria-hidden="true"></i>
            </button>
          ) : cartQty > 0 ? (
            <div className="org-stepper" aria-label={`Quantity of ${item.name} in bag`}>
              <button
                type="button"
                onClick={() => updateQuantity(String(selected.id), -1)}
                aria-label={`Remove one ${item.name} from bag`}
              >
                <i className="ph ph-minus" aria-hidden="true"></i>
              </button>
              <strong aria-live="polite">{cartQty}</strong>
              <button
                type="button"
                onClick={() => updateQuantity(String(selected.id), 1)}
                aria-label={`Add one more ${item.name} to bag`}
              >
                <i className="ph ph-plus" aria-hidden="true"></i>
              </button>
            </div>
          ) : (
            <button
              ref={addBtnRef}
              type="button"
              className="org-btn"
              data-add-to-cart
              onClick={handleAddToCart}
              aria-label={`Add ${item.name} to bag`}
            >
              <i className="ph ph-shopping-bag" aria-hidden="true"></i> Add
            </button>
          )}
          {available && (
            <button
              type="button"
              className="org-btn org-btn--ghost"
              data-buy-now
              onClick={handleBuyNow}
              aria-label={`Buy ${item.name} now`}
            >
              Buy now
            </button>
          )}
        </div>
      </div>
    </article>
  );
};
