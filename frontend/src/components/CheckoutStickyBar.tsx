'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { money, resolveImageUrl } from '@/lib/utils';

export const CheckoutStickyBar: React.FC = () => {
  const pathname = usePathname();
  const { items, count, subtotal, openCart, isOpen } = useCart();
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY && currentScrollY > 50) {
        setIsVisible(false);
      } else if (currentScrollY < lastScrollY) {
        setIsVisible(true);
      }
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  // Do not show on checkout page, admin pages, single product pages (PDP), or if cart is empty/open
  if (
    pathname === '/checkout' ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/products/') ||
    count <= 0 ||
    isOpen
  ) {
    return null;
  }

  const lastItem = items[items.length - 1] || items[0];
  const imgSrc = lastItem?.image ? resolveImageUrl(lastItem.image) : '/assets/images/logo.png';

  return (
    <div className={`checkout-sticky-bar ${!isVisible ? 'is-hidden' : ''}`} data-checkout-sticky role="complementary" aria-label="Cart summary">
      <div className="checkout-sticky-bar__info">
        <div className="checkout-sticky-bar__img-wrap">
          <img src={imgSrc} alt={lastItem?.name || 'Cart item'} className="checkout-sticky-bar__img" />
        </div>
        <div className="checkout-sticky-bar__text">
          <span className="checkout-sticky-bar__count" data-sticky-count>
            {count} {count === 1 ? 'item' : 'items'}
          </span>
          <strong className="checkout-sticky-bar__price" data-sticky-price>
            {money(subtotal)}
          </strong>
        </div>
      </div>
      <button
        type="button"
        className="checkout-sticky-bar__btn"
        onClick={openCart}
        aria-label="Open shopping bag"
        data-cart-toggle
      >
        <i className="ph ph-shopping-cart"></i> <i className="ph ph-arrow-right"></i>
      </button>
    </div>
  );
};
