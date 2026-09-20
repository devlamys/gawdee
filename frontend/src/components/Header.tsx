'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { StorefrontSettings } from '@/types';
import { money, resolveImageUrl } from '@/lib/utils';
import { env } from '@/config/env';

interface HeaderProps {
  settings?: StorefrontSettings;
}

export const Header: React.FC<HeaderProps> = ({ settings }) => {
  const router = useRouter();
  const pathname = usePathname();
  const { count: cartCount, openCart } = useCart();
  const { customer } = useAuth();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const mobileSearchRef = React.useRef<HTMLInputElement>(null);
  const desktopSearchRef = React.useRef<HTMLInputElement>(null);

  const brandLogo = resolveImageUrl(settings?.brand_logo, env.defaults.brandLogo);
  const brandName = settings?.brand_name || env.defaults.brandName;
  const shippingThreshold = Number(settings?.free_shipping_threshold || env.defaultShippingThreshold);
  const offerCode = settings?.offer_code || '';

  const handleCategoryNav = (e: React.MouseEvent, categoryKey: string) => {
    if (pathname === '/products') {
      e.preventDefault();
      const targetUrl = categoryKey === 'all' ? '/products' : `/products?category=${categoryKey}`;
      router.push(targetUrl, { scroll: false });
      window.dispatchEvent(new CustomEvent('gawdee:category-filter', { detail: categoryKey }));
      const catalogEl = document.getElementById('product-catalog');
      if (catalogEl) {
        catalogEl.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  const handleMobileCategoryNav = (e: React.MouseEvent, categoryKey: string) => {
    setMobileMenuOpen(false);
    if (pathname === '/products') {
      e.preventDefault();
      const targetUrl = categoryKey === 'all' ? '/products' : `/products?category=${categoryKey}`;
      router.push(targetUrl, { scroll: false });
      window.dispatchEvent(new CustomEvent('gawdee:category-filter', { detail: categoryKey }));
      const catalogEl = document.getElementById('product-catalog');
      if (catalogEl) {
        catalogEl.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  useEffect(() => {
    document.body.classList.toggle('is-locked', mobileMenuOpen);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    if (mobileMenuOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.classList.remove('is-locked');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
    }
  };

  const toggleSearch = () => {
    setSearchOpen((open) => {
      if (!open) {
        requestAnimationFrame(() => desktopSearchRef.current?.focus());
      }
      return !open;
    });
  };

  return (
    <header className={`commerce-header ${isScrolled ? 'is-scrolled' : ''}`} data-header>
      {/* Top Announcement Promo Bar */}
      <div className="header-announcement" data-header-announcement>
        <div className="container header-announcement__content">
          <div className="announcement-text">
            <i className="ph-fill ph-sparkle"></i>
            <span>
              <strong>100% Certified Organic &amp; Pure</strong> · Free Shipping over {money(shippingThreshold)}
            </span>
          </div>
          {offerCode && (
            <div className="announcement-cta">
              <Link href="/offers" className="announcement-badge">
                <i className="ph ph-ticket"></i> Code: <strong>{offerCode}</strong>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Main Header Bar */}
      <div className="container commerce-header__main">
        <button
          className="commerce-icon mobile-menu-toggle mobile-only"
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open menu"
          aria-expanded={mobileMenuOpen}
        >
          <i className="ph ph-list" aria-hidden="true"></i>
        </button>

        <Link className="commerce-logo gx-brand-logo" href="/" aria-label={`${brandName} home`}>
          {!videoError && (
            <video
              className="gx-brand-video"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              poster={brandLogo}
              disablePictureInPicture
              onError={() => setVideoError(true)}
            >
              <source src="/assets/images/logo/Make_please.mp4" type="video/mp4" onError={() => setVideoError(true)} />
            </video>
          )}
          <img
            src={brandLogo}
            alt="Gawdee — The Soul of Wellness"
            className="header-logo-img gx-brand__fallback"
            hidden={!videoError}
          />
        </Link>

        <nav className="desktop-main-nav desktop-only" aria-label="Primary navigation">
          <Link
            href="/products"
            className="nav-link"
            onClick={(e) => handleCategoryNav(e, 'all')}
          >
            All Products
          </Link>
          <Link
            href="/products?category=ghee"
            className="nav-link"
            data-nav-filter="ghee"
            onClick={(e) => handleCategoryNav(e, 'ghee')}
          >
            Ghee
          </Link>
          <Link
            href="/products?category=honey"
            className="nav-link"
            data-nav-filter="honey"
            onClick={(e) => handleCategoryNav(e, 'honey')}
          >
            Honey
          </Link>
          <Link
            href="/products?category=nutrition"
            className="nav-link"
            data-nav-filter="nutrition"
            onClick={(e) => handleCategoryNav(e, 'nutrition')}
          >
            Mix Me
          </Link>
          <Link
            href="/products?category=sugar"
            className="nav-link"
            data-nav-filter="sugar"
            onClick={(e) => handleCategoryNav(e, 'sugar')}
          >
            Sugar
          </Link>
          <Link
            href="/products?category=wellness"
            className="nav-link"
            data-nav-filter="wellness"
            onClick={(e) => handleCategoryNav(e, 'wellness')}
          >
            Drops
          </Link>
          <Link href="/reels" className="nav-link">
            Reels <span className="nav-badge-hot">NEW</span>
          </Link>
          <Link href="/offers" className="nav-link nav-link--offers">
            Offers
          </Link>
          <Link href="/blog" className="nav-link">
            Blog
          </Link>
        </nav>

        <div className="commerce-actions">
          <div className={`header-search desktop-only ${searchOpen ? 'is-open' : ''}`}>
            <form
              className="header-search-form"
              onSubmit={handleSearchSubmit}
              role="search"
            >
              <i className="ph ph-magnifying-glass search-icon" aria-hidden="true"></i>
              <input
                ref={desktopSearchRef}
                type="search"
                name="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setSearchOpen(false);
                }}
                placeholder="Search pure essentials..."
                aria-label="Search products"
                autoComplete="off"
                tabIndex={searchOpen ? 0 : -1}
              />
            </form>
            <button
              type="button"
              className="commerce-action commerce-action--icon"
              onClick={toggleSearch}
              aria-label="Search products"
              aria-expanded={searchOpen}
            >
              <i className="ph ph-magnifying-glass" aria-hidden="true"></i>
            </button>
          </div>

          <Link
            className="commerce-action commerce-action--icon desktop-only"
            href={customer ? '/account' : '/login'}
            aria-label={customer ? `Account, signed in as ${customer.name.split(' ')[0]}` : 'Account, sign in'}
          >
            <i
              className={`ph ${customer ? 'ph-user-circle-check' : 'ph-user'}`}
              aria-hidden="true"
            ></i>
          </Link>


          <button
            className="commerce-action commerce-action--icon"
            type="button"
            onClick={openCart}
            aria-label={cartCount > 0 ? `Open shopping bag, ${cartCount} items` : 'Open shopping bag, empty'}
          >
            <span className="commerce-action__icon">
              <i className="ph ph-shopping-cart" aria-hidden="true"></i>
              {cartCount > 0 && <b data-cart-count>{cartCount > 99 ? '99+' : cartCount}</b>}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Backdrop Overlay */}
      {mobileMenuOpen && (
        <div
          className="mobile-nav-backdrop is-active"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile Navigation Drawer */}
      <nav
        className={`mobile-nav commerce-mobile-nav ${mobileMenuOpen ? 'is-open' : ''}`}
        aria-label="Mobile navigation"
      >
        <div className="mobile-nav-top-bar">
          <button
            className="mobile-nav-close-btn"
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            <i className="ph ph-x" aria-hidden="true"></i>
          </button>
          <span className="mobile-nav-title">
            <i className="ph ph-compass"></i> Explore
          </span>
        </div>

        {/* Mobile In-Drawer Search */}
        <form
          className="mobile-nav-search"
          onSubmit={(e) => {
            handleSearchSubmit(e);
            setMobileMenuOpen(false);
          }}
          role="search"
        >
          <i className="ph ph-magnifying-glass search-icon" aria-hidden="true"></i>
          <input
            ref={mobileSearchRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search pure essentials..."
            aria-label="Search products"
            autoComplete="off"
          />
          {searchQuery && (
            <button
              type="button"
              className="mobile-nav-search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <i className="ph ph-x"></i>
            </button>
          )}
        </form>
        <Link href="/products" onClick={(e) => handleMobileCategoryNav(e, 'all')}>
          <span className="mobile-nav__visual">
            <img src="/assets/icons/navigation/products.webp" alt="" width={38} height={38} loading="lazy" />
          </span>
          <span>All Products</span> <i className="ph ph-arrow-right"></i>
        </Link>
        <Link href="/products?category=ghee" onClick={(e) => handleMobileCategoryNav(e, 'ghee')}>
          <span className="mobile-nav__visual">
            <img src="/assets/icons/navigation/ghee.webp" alt="" width={38} height={38} loading="lazy" />
          </span>
          <span>A2 Gir Cow Ghee</span> <i className="ph ph-arrow-right"></i>
        </Link>
        <Link href="/products?category=honey" onClick={(e) => handleMobileCategoryNav(e, 'honey')}>
          <span className="mobile-nav__visual">
            <img src="/assets/icons/navigation/honey.webp" alt="" width={38} height={38} loading="lazy" />
          </span>
          <span>Raw Forest Honey</span> <i className="ph ph-arrow-right"></i>
        </Link>
        <Link href="/products?category=nutrition" onClick={(e) => handleMobileCategoryNav(e, 'nutrition')}>
          <span className="mobile-nav__visual">
            <img src="/assets/icons/navigation/mixme.webp" alt="" width={38} height={38} loading="lazy" />
          </span>
          <span>Mix Me Nutrition</span> <i className="ph ph-arrow-right"></i>
        </Link>
        <Link href="/products?category=sugar" onClick={(e) => handleMobileCategoryNav(e, 'sugar')}>
          <span className="mobile-nav__visual">
            <img src="/assets/icons/navigation/sugar.webp" alt="" width={38} height={38} loading="lazy" />
          </span>
          <span>Natural Sugar</span> <i className="ph ph-arrow-right"></i>
        </Link>
        <Link href="/products?category=wellness" onClick={(e) => handleMobileCategoryNav(e, 'wellness')}>
          <span className="mobile-nav__visual">
            <img src="/assets/icons/navigation/drops.webp" alt="" width={38} height={38} loading="lazy" />
          </span>
          <span>Wellness Drops</span> <i className="ph ph-arrow-right"></i>
        </Link>
        <Link href="/reels" onClick={() => setMobileMenuOpen(false)}>
          <span className="mobile-nav__visual">
            <img src="/assets/icons/navigation/reels.webp" alt="" width={38} height={38} loading="lazy" />
          </span>
          <span>Watch Reels &amp; Videos</span> <i className="ph ph-arrow-right"></i>
        </Link>
        <Link href="/offers" onClick={() => setMobileMenuOpen(false)}>
          <span className="mobile-nav__visual">
            <img src="/assets/icons/navigation/offers.webp" alt="" width={38} height={38} loading="lazy" />
          </span>
          <span>Special Offers</span> <i className="ph ph-arrow-right"></i>
        </Link>
        <Link href="/blog" onClick={() => setMobileMenuOpen(false)}>
          <span className="mobile-nav__visual">
            <img src="/assets/icons/navigation/blog.webp" alt="" width={38} height={38} loading="lazy" />
          </span>
          <span>Wellness Stories &amp; Blog</span> <i className="ph ph-arrow-right"></i>
        </Link>
        <Link href={customer ? '/account' : '/login'} onClick={() => setMobileMenuOpen(false)}>
          <span className="mobile-nav__visual">
            <img src="/assets/icons/navigation/account.webp" alt="" width={38} height={38} loading="lazy" />
          </span>
          <span>{customer ? 'My Account & Orders' : 'Sign In / Register'}</span> <i className="ph ph-arrow-right"></i>
        </Link>
      </nav>
    </header>
  );
};
