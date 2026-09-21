'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from '@/context/CartContext';

/**
 * Mobile sticky bottom navigation — Home · Categories · Coin Wallet · Cart.
 * Rendered only on small viewports (see .mobile-bottom-nav CSS).
 * Hidden on admin and checkout routes.
 */
export const MobileBottomNav: React.FC = () => {
  const pathname = usePathname();
  const { count, openCart } = useCart();

  if (pathname.startsWith('/admin') || pathname === '/checkout') {
    return null;
  }

  const isHome = pathname === '/';
  const isCategories = pathname.startsWith('/products');
  const isWallet = pathname === '/wallet' || pathname === '/account/loyalty';

  return (
    <nav className="mobile-bottom-nav" aria-label="Primary">
      <Link
        href="/"
        className={`mobile-bottom-nav__tab ${isHome ? 'is-active' : ''}`}
        aria-current={isHome ? 'page' : undefined}
      >
        <i className={`ph ${isHome ? 'ph-fill ph-house' : 'ph-house'}`} aria-hidden="true"></i>
        <span>Home</span>
      </Link>

      <Link
        href="/products"
        className={`mobile-bottom-nav__tab ${isCategories ? 'is-active' : ''}`}
        aria-current={isCategories ? 'page' : undefined}
      >
        <i className={`ph ${isCategories ? 'ph-fill ph-squares-four' : 'ph-squares-four'}`} aria-hidden="true"></i>
        <span>Shop</span>
      </Link>

      <Link
        href="/account"
        className={`mobile-bottom-nav__tab ${pathname === '/account' ? 'is-active' : ''}`}
      >
        <i className={`ph ${pathname === '/account' ? 'ph-fill ph-user' : 'ph-user'}`} aria-hidden="true"></i>
        <span>Account</span>
      </Link>

      <Link
        href="/wallet"
        className={`mobile-bottom-nav__tab ${isWallet ? 'is-active' : ''}`}
        aria-current={isWallet ? 'page' : undefined}
        aria-label="Coin wallet"
      >
        <i className={`ph ${isWallet ? 'ph-fill ph-coins' : 'ph-coins'}`} aria-hidden="true"></i>
        <span>Wallet</span>
      </Link>

      <button
        type="button"
        className="mobile-bottom-nav__tab"
        onClick={openCart}
        aria-label={count > 0 ? `Open bag, ${count} item${count === 1 ? '' : 's'}` : 'Open bag, empty'}
      >
        <i className="ph ph-shopping-bag" aria-hidden="true"></i>
        <span>Bag</span>
        {count > 0 && (
          <span className="mobile-bottom-nav__badge" aria-hidden="true">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
    </nav>
  );
};
