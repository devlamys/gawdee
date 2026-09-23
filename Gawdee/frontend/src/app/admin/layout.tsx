'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AdminAuthProvider, useAdminAuth } from '@/context/AdminAuthContext';
import '@/styles/admin.css';

const NAV_ITEMS = [
  ['dashboard', 'ph-squares-four', 'Dashboard'],
  ['categories', 'ph-squares-four', 'Categories'],
  ['products', 'ph-package', 'Products'],
  ['orders', 'ph-receipt', 'Orders'],
  ['loyalty', 'ph-coins', 'Loyalty'],
  ['customer_reviews', 'ph-star', 'Customer reviews'],
  ['combos', 'ph-gift', 'Combos'],
  ['reels', 'ph-film-strip', 'Video Reels'],
  ['offers', 'ph-tag', 'Offers'],
  ['banners', 'ph-image', 'Hero banners'],
  ['banners_two', 'ph-film-strip', 'Animated hero'],
  ['cms', 'ph-layout', 'Homepage CMS'],
  ['testimonials', 'ph-quotes', 'Testimonials'],
  ['reviews', 'ph-star', 'Customer Reviews'],
  ['media', 'ph-video-camera', 'Homepage media'],
  ['blog', 'ph-article', 'Blog'],
  ['ai', 'ph-sparkle', 'AI studio'],
  ['integrations', 'ph-plugs-connected', 'Integrations'],
  ['settings', 'ph-sliders-horizontal', 'Settings'],
];

const VIEW_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  categories: 'Shop by Category',
  products: 'Products',
  orders: 'Orders',
  loyalty: 'Loyalty coins',
  customer_reviews: 'Customer reviews',
  reels: 'Video Reels',
  offers: 'Offers',
  combos: 'Combos',
  banners: 'Hero banners',
  banners_two: 'Animated hero',
  cms: 'Homepage CMS',
  testimonials: 'Testimonials',
  reviews: 'Customer Reviews',
  media: 'Homepage media',
  blog: 'Blog',
  ai: 'AI studio',
  integrations: 'Integrations',
  settings: 'Store settings',
};

function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { admin, loading, logout } = useAdminAuth();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isLoginPage = pathname === '/admin/login';
  const isRegisterPage = pathname === '/admin/register';
  const isPublicPage = isLoginPage || isRegisterPage;
  const isProductFormPage = pathname === '/admin/products/new' || pathname?.startsWith('/admin/products/');
  const currentView = pathname === '/admin/loyalty'
    ? 'loyalty'
    : isProductFormPage
      ? 'products'
      : (searchParams.get('view') || 'dashboard');
  const pageTitle = pathname === '/admin/products/new'
    ? 'Add Catalog Item'
    : pathname?.startsWith('/admin/products/') && pathname !== '/admin/products/new'
      ? 'Edit Catalog Item'
      : (VIEW_TITLES[currentView] || 'Control Centre');

  useEffect(() => {
    if (!loading && !admin && !isPublicPage) {
      router.push('/admin/login');
    }
  }, [loading, admin, isPublicPage, router]);

  // If we are on /admin/login or /admin/register, don't show shell (after all hooks called)
  if (isPublicPage) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#073c2b',
          color: '#fff',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <img src="/assets/images/logo.png" alt="Gawdee" style={{ height: '48px', marginBottom: '1rem' }} />
          <p>Loading administration portal...</p>
        </div>
      </div>
    );
  }

  if (!admin) {
    return null;
  }

  return (
    <div className="admin-app" data-admin-app>
      {/* Sidebar */}
      <aside className={`admin-sidebar ${mobileMenuOpen ? 'is-open' : ''}`}>
        <Link className="admin-logo" href="/admin">
          <img src="/assets/images/logo.png" alt="Gawdee" />
        </Link>

        <nav className="admin-nav" aria-label="Admin navigation">
          {NAV_ITEMS.map(([key, icon, label]) => (
            <Link
              key={key}
              className={currentView === key ? 'is-active' : ''}
              href={key === 'loyalty' ? '/admin/loyalty' : `/admin?view=${key}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              <i className={`ph ${icon}`}></i>
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="admin-sidebar__footer">
          <strong>{admin.name}</strong>
          <span>{admin.email}</span>
          <button
            type="button"
            onClick={logout}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#d48d85',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: 0,
              fontSize: '0.75rem',
              marginTop: '4px',
            }}
          >
            <i className="ph ph-sign-out"></i> Sign out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="admin-main">
        <header className="admin-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              className="admin-action-icon mobile-admin-toggle"
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
            >
              <i className="ph ph-list"></i>
            </button>
            <div>
              <h1>{pageTitle}</h1>
              <p>Gawdee commerce control centre</p>
            </div>
          </div>

          <div className="admin-topbar__actions">
            <Link href="/" target="_blank" title="View storefront" className="admin-action-icon">
              <i className="ph ph-arrow-square-out"></i>
            </Link>
            <Link className="admin-button admin-button--primary" href="/admin?view=orders">
              <i className="ph ph-receipt"></i> View orders
            </Link>
          </div>
        </header>

        <div className="admin-content">{children}</div>
      </main>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <React.Suspense fallback={null}>
        <AdminShell>{children}</AdminShell>
      </React.Suspense>
    </AdminAuthProvider>
  );
}
