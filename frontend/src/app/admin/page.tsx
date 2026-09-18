'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { adminApi } from '@/lib/admin-api';
import { money } from '@/lib/utils';

// Mirrors backend make_slug: lowercase, non-alphanumerics → hyphen.
function autoSlug(name: string): string {
  return (name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function VariantImageManager({
  images,
  uploading,
  onUpload,
  onRename,
  onReplace,
  onDelete,
  onMove,
}: {
  images: any[];
  uploading: boolean;
  onUpload: (file: File) => void;
  onRename: (imageId: number, name: string) => void;
  onReplace: (imageId: number, file: File) => void;
  onDelete: (imageId: number) => void;
  onMove: (imageId: number, dir: -1 | 1) => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <strong style={{ fontSize: '0.72rem', color: '#005c4e' }}>
          <i className="ph ph-images"></i> Variant images ({images.length})
        </strong>
        <label
          className="admin-button admin-button--secondary"
          style={{ fontSize: '0.68rem', padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          <i className="ph ph-upload-simple"></i> {uploading ? 'Uploading…' : 'Upload image'}
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {images.length === 0 ? (
        <p style={{ fontSize: '0.7rem', color: '#88968d', margin: 0 }}>
          No images yet — upload the first one. The first image is used as the variant cover.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
          {images.map((g: any, gi: number) => (
            <div
              key={g.id ?? gi}
              style={{ border: '1px solid #e1e7e2', borderRadius: '10px', padding: '8px', background: '#fff' }}
            >
              <img
                src={g.imageUrl ? `/${String(g.imageUrl).replace(/^\//, '')}` : '/assets/images/logo.png'}
                alt={g.name || `Variant image ${gi + 1}`}
                style={{ width: '100%', height: '90px', objectFit: 'contain', borderRadius: '6px', background: '#f8faf9' }}
                loading="lazy"
              />
              <input
                type="text"
                placeholder="Image name (e.g. Front)"
                defaultValue={g.name || ''}
                key={`name-${g.id}-${g.name}`}
                onBlur={(e) => {
                  if (e.target.value !== (g.name || '')) onRename(g.id, e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                style={{ width: '100%', marginTop: '6px', padding: '5px 7px', fontSize: '0.68rem' }}
                aria-label="Image name"
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
                <button type="button" className="admin-action-icon" style={{ width: '26px', height: '26px' }} disabled={gi === 0} onClick={() => onMove(g.id, -1)} title="Move earlier" aria-label="Move image earlier">
                  <i className="ph ph-arrow-up"></i>
                </button>
                <button type="button" className="admin-action-icon" style={{ width: '26px', height: '26px' }} disabled={gi === images.length - 1} onClick={() => onMove(g.id, 1)} title="Move later" aria-label="Move image later">
                  <i className="ph ph-arrow-down"></i>
                </button>
                <label className="admin-action-icon" style={{ width: '26px', height: '26px', cursor: 'pointer' }} title="Replace image">
                  <i className="ph ph-arrows-clockwise"></i>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onReplace(g.id, file);
                      e.target.value = '';
                    }}
                  />
                </label>
                <button type="button" className="admin-action-icon admin-action-icon--danger" style={{ width: '26px', height: '26px', marginLeft: 'auto' }} onClick={() => onDelete(g.id)} title="Delete image" aria-label="Delete image">
                  <i className="ph ph-trash"></i>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminPageContent() {  const searchParams = useSearchParams();
  const view = searchParams.get('view') || 'dashboard';

  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // View Specific State
  const [stats, setStats] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [reels, setReels] = useState<any[]>([]);
  const [banners, setBanners] = useState<any[]>([]);
  const [bannersTwo, setBannersTwo] = useState<any[]>([]);
  const [testimonials, setTestimonials] = useState<any[]>([]);
  const [blogPosts, setBlogPosts] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, any>>({});

  // Filter state for orders
  const [orderFilter, setOrderFilter] = useState('all');
  const [orderSearch, setOrderSearch] = useState('');

  // Filter state for categories
  const [categorySearch, setCategorySearch] = useState('');

  // Modal / Form state
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [modalData, setModalData] = useState<any>({});
  const [uploadingImage, setUploadingImage] = useState(false);

  const showFlash = (message: string, type: 'success' | 'error' = 'success') => {
    setFlash({ message, type });
    setTimeout(() => setFlash(null), 4000);
  };

  const handleUploadImage = async (file: File, callback: (url: string) => void, folder: string = 'products') => {
    setUploadingImage(true);
    try {
      const res = await adminApi.uploadMedia(file, folder);
      const url = res?.file_path || res?.path || res?.url;
      if (res?.ok && url) {
        callback(url);
        showFlash('Image uploaded successfully');
      } else {
        throw new Error(res?.detail || 'Upload failed');
      }
    } catch (err: any) {
      showFlash(err.message || 'Image upload error', 'error');
    } finally {
      setUploadingImage(false);
    }
  };

  // Which variant row has its image manager expanded (variant id or `new-<index>`).
  const [expandedImgVariant, setExpandedImgVariant] = useState<string | null>(null);

  const patchModalVariantImages = (vKey: string | number, images: any[]) => {
    setModalData((prev: any) => ({
      ...prev,
      variants: (prev.variants || []).map((v: any, i: number) =>
        (v.id ?? `new-${i}`) === vKey ? { ...v, images } : v
      ),
    }));
  };

  const handleAddVariantImage = async (vKey: string | number, variantId: number, file: File) => {
    await handleUploadImage(file, async (url) => {
      try {
        const base = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Image';
        const res = await adminApi.catalogAddVariantImage(variantId, { name: base, imageUrl: url });
        if (res?.ok && res.image) {
          setModalData((prev: any) => ({
            ...prev,
            variants: (prev.variants || []).map((v: any, i: number) =>
              (v.id ?? `new-${i}`) === vKey
                ? { ...v, images: [...(v.images || []), { id: res.image.id, name: res.image.name, imageUrl: res.image.imageUrl }] }
                : v
            ),
          }));
          showFlash('Image added to variant');
        }
      } catch (err: any) {
        showFlash(err.message || 'Failed to add image', 'error');
      }
    });
  };

  const handleRenameVariantImage = async (vKey: string | number, imageId: number, name: string) => {
    try {
      await adminApi.catalogUpdateVariantImage(imageId, { name });
      patchModalVariantImages(vKey, (modalData.variants || [])
        .find((v: any, i: number) => (v.id ?? `new-${i}`) === vKey)?.images
        ?.map((g: any) => (g.id === imageId ? { ...g, name } : g)) || []);
      showFlash('Image name updated');
    } catch (err: any) {
      showFlash(err.message || 'Failed to rename image', 'error');
    }
  };

  const handleDeleteVariantImage = async (vKey: string | number, imageId: number) => {
    if (!confirm('Delete this image?')) return;
    try {
      await adminApi.catalogDeleteVariantImage(imageId);
      const row = (modalData.variants || []).find((v: any, i: number) => (v.id ?? `new-${i}`) === vKey);
      patchModalVariantImages(vKey, (row?.images || []).filter((g: any) => g.id !== imageId));
      showFlash('Image deleted');
    } catch (err: any) {
      showFlash(err.message || 'Failed to delete image', 'error');
    }
  };

  const handleReplaceVariantImage = async (vKey: string | number, imageId: number, file: File) => {
    await handleUploadImage(file, async (url) => {
      try {
        await adminApi.catalogUpdateVariantImage(imageId, { imageUrl: url });
        const row = (modalData.variants || []).find((v: any, i: number) => (v.id ?? `new-${i}`) === vKey);
        patchModalVariantImages(vKey, (row?.images || []).map((g: any) => (g.id === imageId ? { ...g, imageUrl: url } : g)));
        showFlash('Image replaced');
      } catch (err: any) {
        showFlash(err.message || 'Failed to replace image', 'error');
      }
    });
  };

  const handleReorderVariantImage = async (vKey: string | number, imageId: number, dir: -1 | 1) => {
    const row = (modalData.variants || []).find((v: any, i: number) => (v.id ?? `new-${i}`) === vKey);
    const imgs = [...(row?.images || [])].sort((a: any, b: any) => (a.sortOrder ?? a.sort_order ?? 0) - (b.sortOrder ?? b.sort_order ?? 0));
    const idx = imgs.findIndex((g: any) => g.id === imageId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= imgs.length) return;
    try {
      const [a, b] = [imgs[idx], imgs[j]];
      const aOrder = a.sortOrder ?? a.sort_order ?? idx;
      const bOrder = b.sortOrder ?? b.sort_order ?? j;
      await adminApi.catalogUpdateVariantImage(a.id, { sortOrder: bOrder });
      await adminApi.catalogUpdateVariantImage(b.id, { sortOrder: aOrder });
      const next = [...imgs];
      next[idx] = { ...b, sortOrder: bOrder };
      next[j] = { ...a, sortOrder: aOrder };
      patchModalVariantImages(vKey, next);
    } catch (err: any) {
      showFlash(err.message || 'Failed to reorder images', 'error');
    }
  };

  const loadViewData = async () => {
    setLoading(true);
    try {
      if (view === 'dashboard') {
        const [statsRes, settingsRes] = await Promise.all([
          adminApi.getStats(),
          adminApi.getSettings().catch(() => ({ ok: false })),
        ]);
        if (statsRes?.ok) setStats(statsRes);
        if (settingsRes?.ok) setSettings((settingsRes as any).settings || {});
      } else if (view === 'products') {
        const [res, catRes] = await Promise.all([
          adminApi.catalogAdminItems().catch((e: any) => {
            throw new Error(e?.message || 'Unable to load catalogue items.');
          }),
          adminApi.getCategories().catch(() => ({ ok: false, categories: [] })),
        ]);
        if (res?.ok) setProducts(res.items || []);
        if (catRes?.ok) setCategories(catRes.categories || []);
      } else if (view === 'categories') {
        const [catRes, itemsRes] = await Promise.all([
          adminApi.getCategories(),
          adminApi.catalogAdminItems().catch(() => ({ ok: false, items: [] })),
        ]);
        if (catRes?.ok) setCategories(catRes.categories || []);
        if (itemsRes?.ok) setProducts(itemsRes.items || []);
      } else if (view === 'orders') {
        const res = await adminApi.getOrders(orderFilter, orderSearch);
        if (res?.ok) setOrders(res.orders || []);
      } else if (view === 'reels') {
        const res = await adminApi.getReels();
        if (res?.ok) setReels(res.reels || []);
      } else if (view === 'banners') {
        const res = await adminApi.getBanners();
        if (res?.ok) setBanners(res.banners || []);
      } else if (view === 'banners_two') {
        const res = await adminApi.getBannersTwo();
        if (res?.ok) setBannersTwo(res.banners || []);
      } else if (view === 'testimonials') {
        const res = await adminApi.getTestimonials();
        if (res?.ok) setTestimonials(res.testimonials || []);
      } else if (view === 'blog') {
        const res = await adminApi.getBlog();
        if (res?.ok) setBlogPosts(res.posts || []);
      } else if (view === 'settings' || view === 'integrations' || view === 'ai') {
        const res = await adminApi.getSettings();
        if (res?.ok) setSettings(res.settings || {});
      }
    } catch (err: any) {
      showFlash(err.message || 'Error loading view data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadViewData();
  }, [view, orderFilter]);

  // Product & Item Actions (canonical DTO rows always carry variants)
  const handleToggleProduct = async (p: any) => {
    try {
      await adminApi.toggleItem(p.id);
      showFlash('Product status updated');
      loadViewData();
    } catch (err: any) {
      showFlash(err.message, 'error');
    }
  };

  const handleDeleteProduct = async (p: any) => {
    if (!confirm(`Are you sure you want to delete "${p.name || 'this item'}"?`)) return;
    try {
      await adminApi.deleteItem(p.id);
      showFlash('Product deleted successfully');
      loadViewData();
    } catch (err: any) {
      showFlash(err.message, 'error');
    }
  };

  // Order Actions
  const handleUpdateOrderStatus = async (orderId: number, newStatus: string) => {
    try {
      await adminApi.updateOrderStatus(orderId, newStatus);
      showFlash(`Order marked as ${newStatus}`);
      loadViewData();
    } catch (err: any) {
      showFlash(err.message, 'error');
    }
  };

  const handleUpdateTracking = async (orderId: number, trackingNum: string, courier: string) => {
    try {
      await adminApi.updateOrderTracking(orderId, trackingNum, courier);
      showFlash('Tracking updated successfully');
      loadViewData();
    } catch (err: any) {
      showFlash(err.message, 'error');
    }
  };

  // Settings Save
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApi.saveSettings(settings);
      showFlash('Settings saved successfully');
    } catch (err: any) {
      showFlash(err.message, 'error');
    }
  };

  return (
    <>
      {flash && (
        <div
          className={`admin-alert admin-flash ${
            flash.type === 'error' ? 'admin-alert--error' : 'admin-alert--success'
          }`}
          style={{ marginBottom: '1.5rem' }}
        >
          <i className={`ph ${flash.type === 'error' ? 'ph-warning-circle' : 'ph-check-circle'}`}></i>{' '}
          {flash.message}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          1. DASHBOARD VIEW
          ────────────────────────────────────────────────────────────────────────── */}
      {view === 'dashboard' && (
        <>
          <div className="admin-grid admin-grid--stats">
            <article className="stat-card">
              <i className="ph ph-receipt"></i>
              <span>Total orders</span>
              <strong>{stats?.stats?.orders ?? 0}</strong>
            </article>
            <article className="stat-card">
              <i className="ph ph-currency-inr"></i>
              <span>Paid revenue</span>
              <strong>₹{(stats?.stats?.revenue ?? 0).toLocaleString('en-IN')}</strong>
            </article>
            <article className="stat-card">
              <i className="ph ph-calendar-check"></i>
              <span>Orders today</span>
              <strong>{stats?.stats?.today ?? 0}</strong>
            </article>
            <article className="stat-card">
              <i className="ph ph-warning-circle"></i>
              <span>Needs attention</span>
              <strong>{stats?.stats?.attention ?? 0}</strong>
            </article>
          </div>

          <div className="admin-grid" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(280px,.6fr)', marginTop: '20px' }}>
            <section className="admin-card">
              <div className="admin-card__header">
                <div>
                  <h2>Recent orders</h2>
                  <p>Latest checkout activity</p>
                </div>
                <Link className="admin-button admin-button--ghost" href="/admin?view=orders">
                  <i className="ph ph-shopping-cart"></i> All orders
                </Link>
              </div>
              {stats?.recent_orders?.length > 0 ? (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Customer</th>
                        <th>Total</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats?.recent_orders?.map((o: any) => (
                        <tr key={o.id}>
                          <td>
                            <strong>{o.order_number}</strong>
                            <br />
                            <small>{o.created_at}</small>
                          </td>
                          <td>{o.customer_name}</td>
                          <td>₹{(o.total_amount ?? 0).toLocaleString('en-IN')}</td>
                          <td>
                            <span className={`status-pill status-pill--${o.status}`}>
                              {o.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <i className="ph ph-basket"></i>
                  <h3>No orders yet</h3>
                  <p>Completed checkouts will appear here.</p>
                </div>
              )}
            </section>

            <section className="admin-card">
              <div className="admin-card__header">
                <div>
                  <h2>Launch checklist</h2>
                  <p>Integration readiness</p>
                </div>
              </div>
              <div className="admin-card__body" style={{ display: 'grid', gap: '12px' }}>
                {[
                  ['Razorpay', !!(settings as any)?.razorpay_key_id],
                  ['DTDC', !!(settings as any)?.dtdc_configured],
                  ['AI provider', !!(settings as any)?.ai_configured],
                  ['Hero banners', (stats?.stats?.products ?? 0) > 0],
                ].map(([label, ready]) => (
                  <div
                    key={label as string}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '.72rem',
                    }}
                  >
                    <span>{label as string}</span>
                    <span className={`status-pill ${ready ? '' : 'status-pill--pending'}`}>
                      <i className={`ph ${ready ? 'ph-check' : 'ph-clock'}`}></i>{' '}
                      {ready ? 'Ready' : 'Setup needed'}
                    </span>
                  </div>
                ))}
                <Link className="admin-button admin-button--secondary" href="/admin?view=integrations">
                  Configure integrations
                </Link>
              </div>
            </section>
          </div>
        </>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          2. PRODUCTS VIEW
          ────────────────────────────────────────────────────────────────────────── */}
      {view === 'products' && (
        <section className="admin-card">
          <div className="admin-card__header">
            <div>
              <h2>Storefront catalogue ({products.length} items)</h2>
              <p>Manage product items, size variants, inventory SKUs, and pricing.</p>
            </div>
            <button
              className="admin-button admin-button--primary"
              type="button"
              onClick={() => {
                setModalData({
                  name: '',
                  categoryId: categories[0]?.id ?? null,
                  flavor: '',
                  tag: '',
                  accent: '#0a7540',
                  imageUrl: '',
                  hoverImageUrl: '',
                  description: '',
                  is_active: true,
                  variants: [],
                  origVariants: {},
                });
                setActiveModal('product');
              }}
            >
              <i className="ph ph-plus"></i> Add item &amp; variants
            </button>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Variants &amp; Sizes</th>
                  <th>Price Range</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const variants = Array.isArray(p.variants) ? p.variants : [];
                  const hasVariants = variants.length > 0;
                  const totalStock = hasVariants
                    ? variants.reduce((acc: number, v: any) => acc + (Number(v.stock) || 0), 0)
                    : 0;
                  const prices = variants.map((v: any) => Number(v.sellingPrice) || 0);
                  const minPrice = hasVariants ? Math.min(...prices) : 0;
                  const maxPrice = hasVariants ? Math.max(...prices) : 0;
                  const categoryName = p.categoryObj?.name || p.category || '—';

                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ display: 'flex', alignItems: 'center' }}>
                            <img
                              src={p.image ? `/${p.image.replace(/^\//, '')}` : '/assets/images/logo.png'}
                              alt={p.name}
                              title="Item image"
                              style={{ width: '44px', height: '44px', objectFit: 'contain', borderRadius: '8px', background: '#f8faf9', padding: '2px', border: '1px solid #e1e7e2' }}
                            />
                            {(p.hoverImageUrl || p.hoverImage) && (
                              <img
                                src={`/${String(p.hoverImageUrl || p.hoverImage).replace(/^\//, '')}`}
                                alt=""
                                title="Hover image"
                                style={{ width: '28px', height: '28px', objectFit: 'contain', borderRadius: '8px', background: '#f8faf9', padding: '2px', border: '1px dashed #b9c6bd', marginLeft: '-10px', marginTop: '18px' }}
                              />
                            )}
                          </span>
                          <div>
                            <strong>{p.full_name || p.name}</strong>
                            {p.flavor && <small style={{ display: 'block', color: '#556960' }}>{p.flavor}</small>}
                            <small style={{ display: 'block', color: '#888' }}>Slug: {p.slug || p.id}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="status-pill" style={{ background: '#eef5f1', color: '#075f37' }}>
                          {categoryName}
                        </span>
                      </td>
                      <td>
                        {hasVariants ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', maxWidth: '260px' }}>
                            {variants.map((v: any, vi: number) => (
                              <span
                                key={v.id ?? vi}
                                style={{
                                  fontSize: '0.62rem',
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                  background: Number(v.stock) > 0 ? '#faf6f0' : '#fbeaea',
                                  border: '1px solid #ebd9c0',
                                  color: '#6e4c19',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                                title={`SKU: ${v.sku || 'Auto'} | Stock: ${v.stock} | MRP: ₹${v.mrp} | Selling: ₹${v.sellingPrice} | Discount: ${v.discountPercent ?? v.discount ?? 0}%`}
                              >
                                <strong>{v.variantName}</strong>
                                <small style={{ color: '#005c4e', fontWeight: 700 }}>₹{v.sellingPrice}</small>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: '#b00' }}>No variants</span>
                        )}
                      </td>
                      <td>
                        {hasVariants ? (
                          <div>
                            <strong>
                              ₹{minPrice.toLocaleString('en-IN')}
                              {minPrice !== maxPrice && ` - ₹${maxPrice.toLocaleString('en-IN')}`}
                            </strong>
                            <small style={{ display: 'block', color: '#888', fontSize: '0.62rem' }}>
                              {variants.length} variant{variants.length > 1 ? 's' : ''}
                            </small>
                          </div>
                        ) : (
                          <span style={{ color: '#b00' }}>—</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`status-pill ${
                            totalStock > 10 ? 'status-pill--paid' : totalStock > 0 ? 'status-pill--pending' : 'status-pill--cancelled'
                          }`}
                        >
                          {totalStock > 0 ? `${totalStock} in stock` : 'Out of stock'}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => handleToggleProduct(p)}
                          className={`status-pill ${
                            p.is_active ? 'status-pill--delivered' : 'status-pill--pending'
                          }`}
                          style={{ cursor: 'pointer', border: 'none' }}
                        >
                          {p.is_active ? 'Active' : 'Draft'}
                        </button>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setModalData({
                                id: p.id,
                                name: p.name,
                                flavor: p.flavor || '',
                                categoryId: p.categoryId ?? p.categoryObj?.id ?? null,
                                tag: p.tag || '',
                                accent: p.accent || '#0a7540',
                                imageUrl: p.imageUrl || p.image || '',
                                hoverImageUrl: p.hoverImageUrl || p.hoverImage || '',
                                description: p.description || '',
                                is_active: p.isActive !== 0,
                                variants: (p.variants || []).map((v: any) => ({
                                  id: v.id,
                                  variantName: v.variantName || 'Standard',
                                  sku: v.sku || '',
                                  stock: Number(v.stock) || 0,
                                  mrp: Number(v.mrp) || 0,
                                  sellingPrice: Number(v.sellingPrice) || 0,
                                  discount: Number(v.discount) || 0,
                                  discountPercent: Number(v.discountPercent) || 0,
                                  uom: v.uom || '',
                                  isInclusive: v.isInclusive !== false,
                                  isLabTested: v.isLabTested !== false,
                                  isNatural: v.isNatural !== false,
                                  image: v.image || '',
                                  images: (v.images || []).map((g: any) => ({
                                    id: g.id,
                                    name: g.name || '',
                                    imageUrl: g.imageUrl || g.image || '',
                                    sortOrder: g.sortOrder ?? g.sort_order ?? 0,
                                  })),
                                })),
                                origVariants: Object.fromEntries(
                                  (p.variants || []).map((v: any) => [v.id, { mrp: Number(v.mrp) || 0, sellingPrice: Number(v.sellingPrice) || 0 }])
                                ),
                              });
                              setActiveModal('product');
                            }}
                            className="admin-action-icon"
                            title="Edit item & variants"
                          >
                            <i className="ph ph-pencil-simple"></i>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(p)}
                            className="admin-action-icon admin-action-icon--danger"
                            title="Delete item"
                          >
                            <i className="ph ph-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          3. CATEGORIES VIEW
          ────────────────────────────────────────────────────────────────────────── */}
      {view === 'categories' && (
        <section className="admin-card">
          <div className="admin-card__head">
            <div>
              <h2>Product Categories ({categories.length})</h2>
              <p>Organize storefront collections and navigation filters.</p>
            </div>
            <button
              className="admin-button admin-button--primary"
              type="button"
              onClick={() => {
                setModalData({ name: '', filter: '', image_url: '', icon: '', sort_order: 10, is_active: true });
                setActiveModal('category');
              }}
            >
              <i className="ph ph-plus"></i> New category
            </button>
          </div>

          <div className="order-filter-bar" style={{ display: 'flex', gap: '12px', margin: '0 0 1rem' }}>
            <div className="field-icon" style={{ flex: 1, maxWidth: '360px' }}>
              <i className="ph ph-magnifying-glass"></i>
              <input
                type="search"
                placeholder="Search categories by name or filter key..."
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
              />
            </div>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Category Name</th>
                  <th>Filter Key</th>
                  <th>Parent</th>
                  <th>Items</th>
                  <th>Order</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories
                  .filter((c) => {
                    const q = categorySearch.trim().toLowerCase();
                    if (!q) return true;
                    return (c.name || '').toLowerCase().includes(q) || (c.filter || '').toLowerCase().includes(q);
                  })
                  .map((c) => {
                    const itemCount = products.filter((p: any) => p.categoryId === c.id).length;
                    const img = c.imageUrl || c.image;
                    const pid = c.parentId ?? c.parent_id ?? null;
                    const parentName = pid ? categories.find((q: any) => q.id === pid)?.name || `#${pid}` : null;
                    const childCount = categories.filter((q: any) => (q.parentId ?? q.parent_id) === c.id).length;
                    return (
                      <tr key={c.id}>
                        <td>
                          {img ? (
                            <img
                              src={`/${String(img).replace(/^\//, '')}`}
                              alt={c.name}
                              style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e1e7e2', background: '#f8faf9' }}
                            />
                          ) : (
                            <span style={{ color: '#aaa', fontSize: '0.75rem' }}>—</span>
                          )}
                        </td>
                        <td>
                          <strong>{c.name}</strong>
                        </td>
                        <td>
                          <code>{c.filter}</code>
                        </td>
                        <td>
                          {parentName ? (
                            <div>
                              <small style={{ display: 'block', color: '#888' }}>under</small>
                              <strong style={{ fontSize: '0.8rem' }}>{parentName}</strong>
                            </div>
                          ) : (
                            <span style={{ color: '#aaa' }}>—</span>
                          )}
                          {childCount > 0 && (
                            <span className="status-pill" style={{ background: '#eef3fb', color: '#2b4d8f', marginTop: '4px', display: 'inline-block' }}>
                              {childCount} subcategor{childCount > 1 ? 'ies' : 'y'}
                            </span>
                          )}
                        </td>
                        <td>{itemCount}</td>
                        <td>{c.sort_order ?? c.sortOrder ?? 0}</td>
                        <td>
                          <span
                            className={`status-pill ${
                              c.isActive ?? c.is_active ? 'status-pill--paid' : 'status-pill--pending'
                            }`}
                          >
                            {c.isActive ?? c.is_active ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setModalData({
                                  id: c.id,
                                  name: c.name || '',
                                  filter: c.filter || '',
                                  image_url: c.imageUrl || c.image || '',
                                  icon: c.icon || '',
                                  parent_id: c.parentId ?? c.parent_id ?? null,
                                  sort_order: c.sort_order ?? c.sortOrder ?? 0,
                                  is_active: (c.isActive ?? c.is_active) ? true : false,
                                });
                                setActiveModal('category');
                              }}
                              className="admin-action-icon"
                              title="Edit category"
                            >
                              <i className="ph ph-pencil-simple"></i>
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (confirm(`Delete category "${c.name}"? Items linked to it will be unlinked, not deleted.`)) {
                                  try {
                                    await adminApi.deleteCategory(c.id);
                                    showFlash('Category deleted');
                                    loadViewData();
                                  } catch (err: any) {
                                    showFlash(err.message || 'Failed to delete category', 'error');
                                  }
                                }
                              }}
                              className="admin-action-icon admin-action-icon--danger"
                              title="Delete category"
                            >
                              <i className="ph ph-trash"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          4. ORDERS WORKBENCH VIEW
          ────────────────────────────────────────────────────────────────────────── */}
      {view === 'orders' && (
        <section className="admin-card">
          <div className="admin-card__head orders-heading">
            <div>
              <h2>Orders &amp; Fulfilment Workbench</h2>
              <p>Process payments, update courier tracking and deliver packages.</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {['all', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setOrderFilter(st)}
                  className={`admin-button ${
                    orderFilter === st ? 'admin-button--primary' : 'admin-button--subtle'
                  }`}
                  style={{ textTransform: 'capitalize' }}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="order-filter-bar" style={{ display: 'flex', gap: '12px', margin: '1rem 0' }}>
            <div className="field-icon" style={{ flex: 1 }}>
              <i className="ph ph-magnifying-glass"></i>
              <input
                type="search"
                placeholder="Search orders by number, customer, email or phone..."
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadViewData()}
              />
            </div>
            <button className="admin-button admin-button--secondary" type="button" onClick={loadViewData}>
              Filter
            </button>
          </div>

          <div className="admin-table-wrap">
            {orders.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#888' }}>
                <i className="ph ph-receipt" style={{ fontSize: '2.5rem', marginBottom: '0.8rem' }}></i>
                <h3>No matching orders found</h3>
                <p>Orders placed via the storefront checkout will appear here.</p>
              </div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Destination</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Tracking</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <strong>#{o.order_number}</strong>
                        <small style={{ display: 'block', color: '#888' }}>
                          {new Date(o.created_at).toLocaleDateString('en-IN')}
                        </small>
                      </td>
                      <td>
                        <strong>{o.customer_name}</strong>
                        <small style={{ display: 'block', color: '#666' }}>{o.phone}</small>
                        <small style={{ display: 'block', color: '#999' }}>{o.email}</small>
                      </td>
                      <td>
                        {o.city}, {o.state} - {o.pincode}
                      </td>
                      <td>
                        <strong>{money(o.total)}</strong>
                        <span
                          className={`status-pill ${
                            o.payment_status === 'paid' ? 'status-pill--paid' : 'status-pill--pending'
                          }`}
                          style={{ display: 'block', width: 'fit-content', marginTop: '4px' }}
                        >
                          {o.payment_status}
                        </span>
                      </td>
                      <td>
                        <select
                          value={o.status}
                          onChange={(e) => handleUpdateOrderStatus(o.id, e.target.value)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: '1px solid #ccc',
                            fontSize: '0.8rem',
                          }}
                        >
                          <option value="pending">Pending</option>
                          <option value="processing">Processing</option>
                          <option value="shipped">Shipped</option>
                          <option value="delivered">Delivered</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </td>
                      <td>
                        {o.tracking_number ? (
                          <span>
                            <strong>{o.courier_name || 'Courier'}</strong>: {o.tracking_number}
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="admin-button admin-button--subtle"
                            style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                            onClick={() => {
                              const tNum = prompt('Enter Tracking Number / AWB:');
                              if (tNum) {
                                const cName = prompt('Enter Courier Partner (e.g. Shiprocket, DTDC):') || 'DTDC';
                                handleUpdateTracking(o.id, tNum, cName);
                              }
                            }}
                          >
                            + Add AWB
                          </button>
                        )}
                      </td>
                      <td>
                        <Link
                          href={`/account/orders/${o.order_number}`}
                          target="_blank"
                          className="admin-action-icon"
                          title="View customer invoice"
                        >
                          <i className="ph ph-file-text"></i>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          5. REELS VIEW
          ────────────────────────────────────────────────────────────────────────── */}
      {view === 'reels' && (
        <section className="admin-card">
          <div className="admin-card__head">
            <div>
              <h2>Video Reels &amp; Shoppable Media ({reels.length})</h2>
              <p>Manage Instagram-style video clips linking to catalog products.</p>
            </div>
            <button
              className="admin-button admin-button--primary"
              type="button"
              onClick={() => {
                setModalData({ title: '', file_path: '', product_slug: '', sort_order: 0 });
                setActiveModal('reel');
              }}
            >
              <i className="ph ph-plus"></i> Add Reel
            </button>
          </div>

          <div className="reel-card-grid" style={{ marginTop: '1rem' }}>
            {reels.map((r) => (
              <div key={r.id} className="reel-card-admin">
                <div style={{ height: '220px', background: '#000', position: 'relative' }}>
                  {r.file_path ? (
                    <video
                      src={`/${r.file_path.replace(/^\//, '')}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      muted
                      loop
                      playsInline
                    />
                  ) : (
                    <div
                      style={{
                        height: '100%',
                        display: 'grid',
                        placeItems: 'center',
                        color: '#666',
                      }}
                    >
                      <i className="ph ph-video" style={{ fontSize: '3rem' }}></i>
                    </div>
                  )}
                  <span
                    style={{
                      position: 'absolute',
                      top: '10px',
                      left: '10px',
                      background: 'rgba(0,0,0,0.75)',
                      color: '#fff',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                    }}
                  >
                    #{r.sort_order}
                  </span>
                </div>
                <div style={{ padding: '14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <strong style={{ fontSize: '0.95rem' }}>{r.title}</strong>
                  {r.product_slug && (
                    <small style={{ color: '#009a84', marginTop: '4px' }}>
                      <i className="ph ph-tag"></i> {r.product_slug}
                    </small>
                  )}
                  <div style={{ marginTop: 'auto', paddingTop: '10px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      type="button"
                      title="Edit reel"
                      onClick={() => {
                        setModalData({ ...r });
                        setActiveModal('reel');
                      }}
                      className="admin-action-icon"
                    >
                      <i className="ph ph-pencil-simple"></i>
                    </button>
                    <button
                      type="button"
                      title="Delete reel"
                      onClick={async () => {
                        if (confirm('Delete this reel?')) {
                          await adminApi.deleteReel(r.id);
                          loadViewData();
                        }
                      }}
                      className="admin-action-icon admin-action-icon--danger"
                    >
                      <i className="ph ph-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          6. BANNERS TWO (HERO 3D SLIDES)
          ────────────────────────────────────────────────────────────────────────── */}
      {view === 'banners_two' && (
        <section className="admin-card">
          <div className="admin-card__head">
            <div>
              <h2>Hero 3D Animated Slides ({bannersTwo.length})</h2>
              <p>Configure the 3D rotating product slides on the homepage carousel.</p>
            </div>
            <button
              className="admin-button admin-button--primary"
              type="button"
              onClick={() => {
                setModalData({
                  title: '',
                  cat: 'Ghee',
                  title_html: '',
                  word: '',
                  sub: '',
                  price_label: '',
                  mrp_label: '',
                  off_badge: '',
                  reviews_label: '',
                  product_image: '',
                  cart_id: '',
                  cart_name: '',
                  cart_price: 0,
                  cart_image: '',
                  sort_order: bannersTwo.length,
                  is_active: true,
                });
                setActiveModal('banner_two');
              }}
            >
              <i className="ph ph-plus"></i> Add Slide
            </button>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Slide Title</th>
                  <th>Category</th>
                  <th>Display Price</th>
                  <th>Product Image</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bannersTwo.length === 0 && (
                  <tr className="admin-table__empty">
                    <td colSpan={5}>
                      <i className="ph ph-film-strip" style={{ fontSize: '1.6rem', display: 'block', marginBottom: '8px' }}></i>
                      No slides yet — click &ldquo;Add Slide&rdquo; to create the first 3D hero slide.
                    </td>
                  </tr>
                )}
                {bannersTwo.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <strong>{b.title}</strong>
                    </td>
                    <td>{b.cat}</td>
                    <td>
                      {b.price_label} <small style={{ color: '#999' }}>{b.mrp_label}</small>
                    </td>
                    <td>
                      <img
                        src={b.product_image ? `/${b.product_image.replace(/^\//, '')}` : '/assets/images/logo.png'}
                        alt={b.title}
                        style={{ width: '45px', height: '45px', objectFit: 'contain', borderRadius: '10px', border: '1px solid #e1e7e2', background: '#f6f8f6' }}
                      />
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          title="Edit slide"
                          onClick={() => {
                            setModalData({ ...b });
                            setActiveModal('banner_two');
                          }}
                          className="admin-action-icon"
                        >
                          <i className="ph ph-pencil-simple"></i>
                        </button>
                        <button
                          type="button"
                          title="Delete slide"
                          onClick={async () => {
                            if (confirm('Delete banner slide?')) {
                              await adminApi.deleteBannerTwo(b.id);
                              loadViewData();
                            }
                          }}
                          className="admin-action-icon admin-action-icon--danger"
                        >
                          <i className="ph ph-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          7. SETTINGS & INTEGRATIONS VIEW
          ────────────────────────────────────────────────────────────────────────── */}
      {(view === 'settings' || view === 'integrations' || view === 'ai') && (
        <section className="admin-card">
          <div className="admin-card__head">
            <div>
              <h2>{view === 'settings' ? 'Storefront Settings' : view === 'integrations' ? 'Integrations' : 'AI Assistant'}</h2>
              <p>Platform parameters, contact details, and third-party API configurations.</p>
            </div>
          </div>

          <form onSubmit={handleSaveSettings} className="admin-form" style={{ maxWidth: '640px' }}>
            {view === 'settings' && (
              <>
                <label>
                  <span>Brand Name</span>
                  <input
                    type="text"
                    value={settings.brand_name || 'Gawdee'}
                    onChange={(e) => setSettings({ ...settings, brand_name: e.target.value })}
                  />
                </label>
                <label>
                  <span>Support Email</span>
                  <input
                    type="email"
                    value={settings.support_email || 'care@gawdee.com'}
                    onChange={(e) => setSettings({ ...settings, support_email: e.target.value })}
                  />
                </label>
                <label>
                  <span>Support Phone / WhatsApp</span>
                  <input
                    type="text"
                    value={settings.support_phone || '+91 98765 43210'}
                    onChange={(e) => setSettings({ ...settings, support_phone: e.target.value })}
                  />
                </label>
                <label>
                  <span>Free Shipping Threshold (₹)</span>
                  <input
                    type="number"
                    value={settings.free_shipping_threshold || 999}
                    onChange={(e) => setSettings({ ...settings, free_shipping_threshold: e.target.value })}
                  />
                </label>
                <label>
                  <span>Promo Code</span>
                  <input
                    type="text"
                    value={settings.offer_code || 'FREEDOM10'}
                    onChange={(e) => setSettings({ ...settings, offer_code: e.target.value })}
                  />
                </label>
              </>
            )}

            {view === 'integrations' && (
              <>
                <label>
                  <span>Shiprocket Email</span>
                  <input
                    type="email"
                    value={settings.shiprocket_email || ''}
                    onChange={(e) => setSettings({ ...settings, shiprocket_email: e.target.value })}
                    placeholder="shiprocket@account.com"
                  />
                </label>
                <label>
                  <span>Shiprocket Password</span>
                  <input
                    type="password"
                    value={settings.shiprocket_password || ''}
                    onChange={(e) => setSettings({ ...settings, shiprocket_password: e.target.value })}
                  />
                </label>
                <label>
                  <span>Razorpay Key ID</span>
                  <input
                    type="text"
                    value={settings.razorpay_key_id || ''}
                    onChange={(e) => setSettings({ ...settings, razorpay_key_id: e.target.value })}
                    placeholder="rzp_live_..."
                  />
                </label>
                <label>
                  <span>Razorpay Key Secret</span>
                  <input
                    type="password"
                    value={settings.razorpay_key_secret || ''}
                    onChange={(e) => setSettings({ ...settings, razorpay_key_secret: e.target.value })}
                  />
                </label>
              </>
            )}

            {view === 'ai' && (
              <>
                <label>
                  <span>AI Assistant Name</span>
                  <input
                    type="text"
                    value={settings.ai_bot_name || 'Gawdee AI Assistant'}
                    onChange={(e) => setSettings({ ...settings, ai_bot_name: e.target.value })}
                  />
                </label>
                <label>
                  <span>System Prompt &amp; Brand Tone</span>
                  <textarea
                    rows={6}
                    value={
                      settings.ai_system_prompt ||
                      'You are the helpful wellness advisor for Gawdee. Answer questions about A2 Gir Cow Ghee, Forest Honey, and Mix Me nutrition.'
                    }
                    onChange={(e) => setSettings({ ...settings, ai_system_prompt: e.target.value })}
                  />
                </label>
              </>
            )}

            <button className="admin-button admin-button--primary" type="submit" style={{ marginTop: '1.2rem' }}>
              <i className="ph ph-floppy-disk"></i> Save changes
            </button>
          </form>
        </section>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL: ADD / EDIT CATEGORY
          ────────────────────────────────────────────────────────────────────────── */}
      {activeModal === 'category' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 99999,
            display: 'grid',
            placeItems: 'center',
            padding: '20px',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '20px',
              maxWidth: '560px',
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: '28px',
              boxShadow: '0 25px 60px rgba(0,0,0,0.22)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '14px', borderBottom: '1px solid #e1e7e2' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#005c4e' }}>
                  {modalData.id ? `Edit Category: ${modalData.name}` : 'New Category'}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: '#7b8981' }}>
                  Categories group items in the storefront catalogue and filters.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                style={{ background: '#f0f4f2', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'grid', placeItems: 'center', fontSize: '1.1rem', cursor: 'pointer', color: '#445' }}
              >
                <i className="ph ph-x"></i>
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const name = (modalData.name || '').trim();
                  if (name.length < 2) throw new Error('Category name must be at least 2 characters.');
                  const filter = (modalData.filter || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
                  if (!filter) throw new Error('Filter key is required (used in catalogue URLs).');
                  await adminApi.saveCategory({
                    id: modalData.id || undefined,
                    name,
                    filter,
                    image: modalData.image_url || '',
                    image_url: modalData.image_url || '',
                    icon: modalData.icon || '',
                    parent_id: modalData.parent_id ?? null,
                    sort_order: Math.max(0, parseInt(modalData.sort_order ?? 0) || 0),
                    is_active: modalData.is_active !== false,
                  });
                  showFlash(modalData.id ? 'Category updated successfully' : 'Category created successfully');
                  setActiveModal(null);
                  loadViewData();
                } catch (err: any) {
                  showFlash(err.message || 'Failed to save category', 'error');
                }
              }}
              className="admin-form"
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <label>
                  <span>Category Name *</span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. A2 Gir Cow Ghee"
                    value={modalData.name || ''}
                    onChange={(e) => setModalData({ ...modalData, name: e.target.value })}
                  />
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <label>
                    <span>Filter Key *</span>
                    <input
                      type="text"
                      required
                      placeholder="e.g. ghee"
                      value={modalData.filter || ''}
                      onChange={(e) => setModalData({ ...modalData, filter: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Sort Order</span>
                    <input
                      type="number"
                      min={0}
                      value={modalData.sort_order ?? 0}
                      onChange={(e) => setModalData({ ...modalData, sort_order: parseInt(e.target.value) || 0 })}
                    />
                  </label>
                </div>

                <label>
                  <span>Category Image</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {(modalData.image_url) && (
                      <img
                        src={`/${String(modalData.image_url).replace(/^\//, '')}`}
                        alt=""
                        style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e1e7e2', flexShrink: 0 }}
                      />
                    )}
                    <input
                      type="text"
                      placeholder="/assets/images/... or upload"
                      value={modalData.image_url || ''}
                      onChange={(e) => setModalData({ ...modalData, image_url: e.target.value })}
                      style={{ flex: 1 }}
                    />
                    <label
                      className="admin-button admin-button--ghost"
                      style={{ whiteSpace: 'nowrap', cursor: 'pointer', padding: '9px 12px' }}
                    >
                      <i className="ph ph-upload-simple"></i> Upload
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleUploadImage(file, (url) => {
                              setModalData((prev: any) => ({ ...prev, image_url: url }));
                            }, 'categories');
                          }
                        }}
                      />
                    </label>
                  </div>
                </label>

                <label>
                  <span>Icon Class (optional)</span>
                  <input
                    type="text"
                    placeholder="e.g. ph-bowl-steam"
                    value={modalData.icon || ''}
                    onChange={(e) => setModalData({ ...modalData, icon: e.target.value })}
                  />
                </label>

                <label>
                  <span>Parent Category (optional — nests this category under another)</span>
                  <select
                    value={modalData.parent_id ?? ''}
                    onChange={(e) =>
                      setModalData({
                        ...modalData,
                        parent_id: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  >
                    <option value="">None (top-level category)</option>
                    {categories
                      .filter((c: any) => {
                        if (modalData.id && c.id === modalData.id) return false;
                        // Exclude descendants (would create a cycle).
                        let cursor = c.parentId ?? c.parent_id ?? null;
                        const seen = new Set<number>([c.id]);
                        while (cursor) {
                          if (cursor === modalData.id) return false;
                          if (seen.has(cursor)) break;
                          seen.add(cursor);
                          const next = categories.find((q: any) => q.id === cursor);
                          cursor = next ? (next.parentId ?? next.parent_id ?? null) : null;
                        }
                        return true;
                      })
                      .map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.name} (#{c.id})
                        </option>
                      ))}
                  </select>
                </label>

                <label className="form-switch" style={{ padding: 0 }}>
                  <input
                    type="checkbox"
                    checked={modalData.is_active !== false}
                    onChange={(e) => setModalData({ ...modalData, is_active: e.target.checked })}
                  />
                  <span>Category is visible in storefront</span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button
                  type="button"
                  className="admin-button admin-button--ghost"
                  onClick={() => setActiveModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admin-button admin-button--primary"
                  disabled={uploadingImage}
                >
                  <i className="ph ph-check"></i> {modalData.id ? 'Update Category' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL: ADD / EDIT HERO 3D SLIDE (BANNERS TWO)
          ────────────────────────────────────────────────────────────────────────── */}
      {activeModal === 'banner_two' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 99999,
            display: 'grid',
            placeItems: 'center',
            padding: '20px',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '20px',
              maxWidth: '680px',
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: '28px',
              boxShadow: '0 25px 60px rgba(0,0,0,0.22)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '14px', borderBottom: '1px solid #e1e7e2' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#005c4e' }}>
                  {modalData.id ? `Edit Slide: ${modalData.title}` : 'New Hero 3D Slide'}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: '#7b8981' }}>
                  Slides rotate in the homepage 3D carousel. Prices/ratings merge from live catalog data.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                style={{ background: '#f0f4f2', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'grid', placeItems: 'center', fontSize: '1.1rem', cursor: 'pointer', color: '#445', flexShrink: 0 }}
              >
                <i className="ph ph-x"></i>
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const title = (modalData.title || '').trim();
                  if (title.length < 2) throw new Error('Slide title must be at least 2 characters.');
                  await adminApi.saveBannerTwo({
                    id: modalData.id || undefined,
                    title,
                    cat: modalData.cat || '',
                    title_html: modalData.title_html || '',
                    word: modalData.word || '',
                    sub: modalData.sub || '',
                    price_label: modalData.price_label || '',
                    mrp_label: modalData.mrp_label || '',
                    off_badge: modalData.off_badge || '',
                    reviews_label: modalData.reviews_label || '',
                    product_image: modalData.product_image || '',
                    cart_id: modalData.cart_id || '',
                    cart_name: modalData.cart_name || '',
                    cart_price: Math.max(0, parseInt(modalData.cart_price ?? 0) || 0),
                    cart_image: modalData.cart_image || '',
                    sort_order: Math.max(0, parseInt(modalData.sort_order ?? 0) || 0),
                    is_active: modalData.is_active !== false,
                  });
                  showFlash(modalData.id ? 'Slide updated successfully' : 'Slide created successfully');
                  setActiveModal(null);
                  loadViewData();
                } catch (err) {
                  showFlash(err instanceof Error ? err.message : 'Failed to save slide', 'error');
                }
              }}
              className="admin-form"
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <label>
                  <span>Slide Title *</span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. A2 Gir Cow Ghee"
                    value={modalData.title || ''}
                    onChange={(e) => setModalData({ ...modalData, title: e.target.value })}
                  />
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <label>
                    <span>Category Pill</span>
                    <input
                      type="text"
                      placeholder="e.g. A2 Vedic • Grass-Fed"
                      value={modalData.cat || ''}
                      onChange={(e) => setModalData({ ...modalData, cat: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Background Word</span>
                    <input
                      type="text"
                      placeholder="e.g. GHEE"
                      value={modalData.word || ''}
                      onChange={(e) => setModalData({ ...modalData, word: e.target.value })}
                    />
                  </label>
                </div>

                <label>
                  <span>Title HTML (use &lt;br&gt; and &lt;span&gt; for the two-line look)</span>
                  <input
                    type="text"
                    placeholder="e.g. A2 Vedic<br><span>Gir Cow Ghee</span>"
                    value={modalData.title_html || ''}
                    onChange={(e) => setModalData({ ...modalData, title_html: e.target.value })}
                  />
                </label>

                <label>
                  <span>Subtitle</span>
                  <input
                    type="text"
                    placeholder="Short slide description shown under the title"
                    value={modalData.sub || ''}
                    onChange={(e) => setModalData({ ...modalData, sub: e.target.value })}
                  />
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <label>
                    <span>Display Price</span>
                    <input
                      type="text"
                      placeholder="e.g. ₹649"
                      value={modalData.price_label || ''}
                      onChange={(e) => setModalData({ ...modalData, price_label: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>MRP Label</span>
                    <input
                      type="text"
                      placeholder="e.g. ₹799"
                      value={modalData.mrp_label || ''}
                      onChange={(e) => setModalData({ ...modalData, mrp_label: e.target.value })}
                    />
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <label>
                    <span>Offer Badge</span>
                    <input
                      type="text"
                      placeholder="e.g. Save 19%"
                      value={modalData.off_badge || ''}
                      onChange={(e) => setModalData({ ...modalData, off_badge: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Reviews Label</span>
                    <input
                      type="text"
                      placeholder="e.g. 4.8 — 120 reviews"
                      value={modalData.reviews_label || ''}
                      onChange={(e) => setModalData({ ...modalData, reviews_label: e.target.value })}
                    />
                  </label>
                </div>

                <label>
                  <span>Product Image (cutout PNG/WebP)</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {(modalData.product_image) && (
                      <img
                        src={`/${String(modalData.product_image).replace(/^\//, '')}`}
                        alt=""
                        style={{ width: '44px', height: '44px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #e1e7e2', background: '#f6f8f6', flexShrink: 0 }}
                      />
                    )}
                    <input
                      type="text"
                      placeholder="/assets/uploads/... or upload"
                      value={modalData.product_image || ''}
                      onChange={(e) => setModalData({ ...modalData, product_image: e.target.value })}
                      style={{ flex: 1 }}
                    />
                    <label
                      className="admin-button admin-button--ghost"
                      style={{ whiteSpace: 'nowrap', cursor: 'pointer', padding: '9px 12px' }}
                    >
                      <i className="ph ph-upload-simple"></i> Upload
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleUploadImage(file, (url) => {
                              setModalData((prev: any) => ({ ...prev, product_image: url }));
                            }, 'banners');
                          }
                        }}
                      />
                    </label>
                  </div>
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <label>
                    <span>Cart Product ID (variant slug/id — links live price &amp; stock)</span>
                    <input
                      type="text"
                      placeholder="e.g. gawdee-gir-cow-a2-ghee-500-ml"
                      value={modalData.cart_id || ''}
                      onChange={(e) => setModalData({ ...modalData, cart_id: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Cart Product Name</span>
                    <input
                      type="text"
                      placeholder="e.g. Gawdee Gir Cow A2 Ghee 500ml"
                      value={modalData.cart_name || ''}
                      onChange={(e) => setModalData({ ...modalData, cart_name: e.target.value })}
                    />
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <label>
                    <span>Cart Price (₹)</span>
                    <input
                      type="number"
                      min={0}
                      value={modalData.cart_price ?? 0}
                      onChange={(e) => setModalData({ ...modalData, cart_price: parseInt(e.target.value) || 0 })}
                    />
                  </label>
                  <label>
                    <span>Sort Order</span>
                    <input
                      type="number"
                      min={0}
                      value={modalData.sort_order ?? 0}
                      onChange={(e) => setModalData({ ...modalData, sort_order: parseInt(e.target.value) || 0 })}
                    />
                  </label>
                </div>

                <label>
                  <span>Cart Image</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {(modalData.cart_image) && (
                      <img
                        src={`/${String(modalData.cart_image).replace(/^\//, '')}`}
                        alt=""
                        style={{ width: '44px', height: '44px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #e1e7e2', background: '#f6f8f6', flexShrink: 0 }}
                      />
                    )}
                    <input
                      type="text"
                      placeholder="/assets/uploads/... or upload"
                      value={modalData.cart_image || ''}
                      onChange={(e) => setModalData({ ...modalData, cart_image: e.target.value })}
                      style={{ flex: 1 }}
                    />
                    <label
                      className="admin-button admin-button--ghost"
                      style={{ whiteSpace: 'nowrap', cursor: 'pointer', padding: '9px 12px' }}
                    >
                      <i className="ph ph-upload-simple"></i> Upload
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleUploadImage(file, (url) => {
                              setModalData((prev: any) => ({ ...prev, cart_image: url }));
                            }, 'banners');
                          }
                        }}
                      />
                    </label>
                  </div>
                </label>

                <label className="form-switch" style={{ padding: 0 }}>
                  <input
                    type="checkbox"
                    checked={modalData.is_active !== false}
                    onChange={(e) => setModalData({ ...modalData, is_active: e.target.checked })}
                  />
                  <span>Slide is visible in the carousel</span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button
                  type="button"
                  className="admin-button admin-button--ghost"
                  onClick={() => setActiveModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admin-button admin-button--primary"
                  disabled={uploadingImage}
                >
                  <i className="ph ph-check"></i> {modalData.id ? 'Update Slide' : 'Create Slide'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL: ADD / EDIT REEL
          ────────────────────────────────────────────────────────────────────────── */}
      {activeModal === 'reel' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 99999,
            display: 'grid',
            placeItems: 'center',
            padding: '20px',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '20px',
              maxWidth: '560px',
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: '28px',
              boxShadow: '0 25px 60px rgba(0,0,0,0.22)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '14px', borderBottom: '1px solid #e1e7e2' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#005c4e' }}>
                  {modalData.id ? `Edit Reel: ${modalData.title}` : 'New Reel'}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: '#7b8981' }}>
                  Instagram-style video clips linking to catalog products.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                style={{ background: '#f0f4f2', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'grid', placeItems: 'center', fontSize: '1.1rem', cursor: 'pointer', color: '#445', flexShrink: 0 }}
              >
                <i className="ph ph-x"></i>
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const title = (modalData.title || '').trim();
                  if (title.length < 2) throw new Error('Reel title must be at least 2 characters.');
                  await adminApi.saveReel({
                    id: modalData.id || undefined,
                    title,
                    subtitle: modalData.subtitle || '',
                    file_path: modalData.file_path || '',
                    poster_path: modalData.poster_path || '',
                    external_url: modalData.external_url || '',
                    link_url: modalData.link_url || '',
                    alt_text: modalData.alt_text || '',
                    product_slug: modalData.product_slug || '',
                    sort_order: Math.max(0, parseInt(modalData.sort_order ?? 0) || 0),
                    is_active: modalData.is_active !== false,
                  });
                  showFlash(modalData.id ? 'Reel updated successfully' : 'Reel created successfully');
                  setActiveModal(null);
                  loadViewData();
                } catch (err) {
                  showFlash(err instanceof Error ? err.message : 'Failed to save reel', 'error');
                }
              }}
              className="admin-form"
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <label>
                  <span>Reel Title *</span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Bilona Ghee Process"
                    value={modalData.title || ''}
                    onChange={(e) => setModalData({ ...modalData, title: e.target.value })}
                  />
                </label>

                <label>
                  <span>Video File</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="/assets/uploads/... or upload"
                      value={modalData.file_path || ''}
                      onChange={(e) => setModalData({ ...modalData, file_path: e.target.value })}
                      style={{ flex: 1 }}
                    />
                    <label
                      className="admin-button admin-button--ghost"
                      style={{ whiteSpace: 'nowrap', cursor: 'pointer', padding: '9px 12px' }}
                    >
                      <i className="ph ph-upload-simple"></i> Upload
                      <input
                        type="file"
                        accept="video/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleUploadImage(file, (url) => {
                              setModalData((prev: any) => ({ ...prev, file_path: url }));
                            }, 'reels');
                          }
                        }}
                      />
                    </label>
                  </div>
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <label>
                    <span>Linked Product Slug</span>
                    <input
                      type="text"
                      placeholder="e.g. gawdee-gir-cow-a2-ghee-500-ml"
                      value={modalData.product_slug || ''}
                      onChange={(e) => setModalData({ ...modalData, product_slug: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Sort Order</span>
                    <input
                      type="number"
                      min={0}
                      value={modalData.sort_order ?? 0}
                      onChange={(e) => setModalData({ ...modalData, sort_order: parseInt(e.target.value) || 0 })}
                    />
                  </label>
                </div>

                <label className="form-switch" style={{ padding: 0 }}>
                  <input
                    type="checkbox"
                    checked={modalData.is_active !== false}
                    onChange={(e) => setModalData({ ...modalData, is_active: e.target.checked })}
                  />
                  <span>Reel is visible in storefront</span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button
                  type="button"
                  className="admin-button admin-button--ghost"
                  onClick={() => setActiveModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admin-button admin-button--primary"
                  disabled={uploadingImage}
                >
                  <i className="ph ph-check"></i> {modalData.id ? 'Update Reel' : 'Create Reel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL: ADD PRODUCT / VARIANT
          ────────────────────────────────────────────────────────────────────────── */}
      {activeModal === 'product' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 99999,
            display: 'grid',
            placeItems: 'center',
            padding: '20px',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '20px',
              maxWidth: '860px',
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: '28px',
              boxShadow: '0 25px 60px rgba(0,0,0,0.22)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '14px', borderBottom: '1px solid #e1e7e2' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#005c4e' }}>
                  {modalData.id ? `Edit Catalog Item: ${modalData.name}` : 'Add Catalog Item & Variants'}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: '#7b8981' }}>
                  Manage base product information and configure multi-variant pricing, SKUs, and stock.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                style={{ background: '#f0f4f2', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'grid', placeItems: 'center', fontSize: '1.1rem', cursor: 'pointer', color: '#445' }}
              >
                <i className="ph ph-x"></i>
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const name = (modalData.name || '').trim();
                  if (!name) throw new Error('Product name is required.');
                  const rows = modalData.variants || [];
                  if (rows.length === 0) throw new Error('Add at least one variant.');
                  rows.forEach((v: any, i: number) => {
                    const label = v.variantName || `Variant ${i + 1}`;
                    if (!(v.variantName || '').trim()) throw new Error(`Variant ${i + 1}: size/weight name is required.`);
                    const mrp = Number(v.mrp ?? 0);
                    const sell = Number(v.sellingPrice ?? 0);
                    const stock = Number(v.stock ?? 0);
                    if (!Number.isFinite(mrp) || mrp < 0) throw new Error(`${label}: MRP must be 0 or more.`);
                    if (!Number.isFinite(sell) || sell < 0) throw new Error(`${label}: selling price must be 0 or more.`);
                    if (!Number.isInteger(stock) || stock < 0) throw new Error(`${label}: stock must be a whole number, 0 or more.`);
                    if (v.uom && !/^[A-Za-z]{1,10}$/.test(String(v.uom).trim())) throw new Error(`${label}: UOM must be 1–10 letters (e.g. g, kg, ml).`);
                  });
                  const cat = categories.find((c: any) => c.id === modalData.categoryId);
                  const payload = {
                    id: modalData.id || undefined,
                    name,
                    slug: autoSlug(name) || (modalData.id ? `item-${modalData.id}` : undefined),
                    category: cat?.name || '',
                    category_key: cat?.filter || '',
                    category_id: modalData.categoryId ?? null,
                    flavor: modalData.flavor || '',
                    tag: modalData.tag || '',
                    accent: modalData.accent || '#0a7540',
                    image: modalData.imageUrl || modalData.image || '',
                    image_url: modalData.imageUrl || modalData.image || '',
                    hover_image: modalData.hoverImageUrl || '',
                    hover_image_url: modalData.hoverImageUrl || '',
                    description: modalData.description || '',
                    is_active: modalData.is_active ? 1 : 0,
                    variants: rows.map((v: any) => ({
                      id: typeof v.id === 'number' ? v.id : undefined,
                      variant_name: (v.variantName || 'Standard').trim(),
                      sku: (v.sku || '').trim(),
                      stock_quantity: Math.max(0, parseInt(v.stock ?? 0) || 0),
                      mrp: Math.max(0, parseInt(v.mrp ?? 0) || 0),
                      selling_price: Math.max(0, parseInt(v.sellingPrice ?? 0) || 0),
                      uom: (v.uom || '').trim(),
                      is_inclusive_tax: v.isInclusive !== false ? 1 : 0,
                      is_lab_tested: v.isLabTested !== false ? 1 : 0,
                      is_natural: v.isNatural !== false ? 1 : 0,
                      is_active: v.isActive !== false ? 1 : 0,
                      image: v.image || '',
                    })),
                  };

                  await adminApi.saveItem(payload);
                  showFlash(modalData.id ? 'Item updated successfully' : 'Item and variants created successfully');
                  setActiveModal(null);
                  loadViewData();
                } catch (err: any) {
                  showFlash(err.message || 'Failed to save item', 'error');
                }
              }}
              className="admin-form"
            >
              {/* SECTION 1: ITEM DETAILS */}
              <div style={{ background: '#fbfcfb', border: '1px solid #e5ede7', borderRadius: '14px', padding: '18px' }}>
                <h4 style={{ margin: '0 0 14px', fontSize: '0.85rem', color: '#005c4e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ph ph-package"></i> 1. Base Item Information
                </h4>
                
                <label>
                  <span>Product Name *</span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. A2 Gir Cow Cultured Bilona Ghee"
                    value={modalData.name || ''}
                    onChange={(e) => setModalData({ ...modalData, name: e.target.value })}
                  />
                </label>

                <div style={{ marginTop: '12px' }}>
                  <small style={{ color: '#77887e' }}>
                    URL Slug: <code>{autoSlug(modalData.name || '') || (modalData.id ? `item-${modalData.id}` : '—')}</code>
                    <span style={{ color: '#999' }}> (generated automatically from the product name)</span>
                  </small>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginTop: '12px' }}>
                  <label>
                    <span>Category *</span>
                    <select
                      value={modalData.categoryId ?? ''}
                      onChange={(e) =>
                        setModalData({
                          ...modalData,
                          categoryId: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                    >
                      <option value="">No category</option>
                      {categories.map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>Flavor / Subtitle</span>
                    <input
                      type="text"
                      placeholder="e.g. Cultured Bilona Method"
                      value={modalData.flavor || ''}
                      onChange={(e) => setModalData({ ...modalData, flavor: e.target.value })}
                    />
                  </label>

                  <label>
                    <span>Badge / Tag</span>
                    <input
                      type="text"
                      placeholder="e.g. Pure Vedic, Bestseller"
                      value={modalData.tag || ''}
                      onChange={(e) => setModalData({ ...modalData, tag: e.target.value })}
                    />
                  </label>
                </div>

                <div style={{ marginTop: '12px' }}>
                  <label>
                    <span>Item Image (card / listing)</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {modalData.imageUrl ? (
                        <span style={{ position: 'relative', flexShrink: 0 }}>
                          <img
                            src={`/${String(modalData.imageUrl).replace(/^\//, '')}`}
                            alt=""
                            style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e1e7e2', background: '#f8faf9' }}
                          />
                          <button
                            type="button"
                            onClick={() => setModalData({ ...modalData, imageUrl: '' })}
                            title="Remove item image"
                            aria-label="Remove item image"
                            style={{ position: 'absolute', top: '-8px', right: '-8px', width: '20px', height: '20px', borderRadius: '50%', border: '1px solid #e1e7e2', background: '#fff', cursor: 'pointer', fontSize: '0.6rem', lineHeight: 1, color: '#b00' }}
                          >
                            <i className="ph ph-x"></i>
                          </button>
                        </span>
                      ) : null}
                      <input
                        type="text"
                        placeholder="/assets/images/products/... or upload"
                        value={modalData.imageUrl || ''}
                        onChange={(e) => setModalData({ ...modalData, imageUrl: e.target.value })}
                      />
                      <label
                        className="admin-button admin-button--ghost"
                        style={{ whiteSpace: 'nowrap', cursor: 'pointer', padding: '9px 12px' }}
                      >
                        <i className="ph ph-upload-simple"></i> Upload
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleUploadImage(file, (url) => {
                                setModalData((prev: any) => ({ ...prev, imageUrl: url }));
                              });
                            }
                          }}
                        />
                      </label>
                    </div>
                  </label>

                  <label style={{ display: 'block', marginTop: '12px' }}>
                    <span>Hover Image (card hover)</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {modalData.hoverImageUrl ? (
                        <span style={{ position: 'relative', flexShrink: 0 }}>
                          <img
                            src={`/${String(modalData.hoverImageUrl).replace(/^\//, '')}`}
                            alt=""
                            style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e1e7e2', background: '#f8faf9' }}
                          />
                          <button
                            type="button"
                            onClick={() => setModalData({ ...modalData, hoverImageUrl: '' })}
                            title="Remove hover image"
                            aria-label="Remove hover image"
                            style={{ position: 'absolute', top: '-8px', right: '-8px', width: '20px', height: '20px', borderRadius: '50%', border: '1px solid #e1e7e2', background: '#fff', cursor: 'pointer', fontSize: '0.6rem', lineHeight: 1, color: '#b00' }}
                          >
                            <i className="ph ph-x"></i>
                          </button>
                        </span>
                      ) : null}
                      <input
                        type="text"
                        placeholder="/assets/images/products/... or upload"
                        value={modalData.hoverImageUrl || ''}
                        onChange={(e) => setModalData({ ...modalData, hoverImageUrl: e.target.value })}
                      />
                      <label
                        className="admin-button admin-button--ghost"
                        style={{ whiteSpace: 'nowrap', cursor: 'pointer', padding: '9px 12px' }}
                      >
                        <i className="ph ph-upload-simple"></i> Upload
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleUploadImage(file, (url) => {
                                setModalData((prev: any) => ({ ...prev, hoverImageUrl: url }));
                              });
                            }
                          }}
                        />
                      </label>
                    </div>
                  </label>
                </div>

                <div style={{ marginTop: '12px' }}>
                  <label>
                    <span>Description</span>
                    <textarea
                      rows={3}
                      placeholder="Traditional hand-churned Vedic Bilona method from free-grazing Gir cows..."
                      value={modalData.description || ''}
                      onChange={(e) => setModalData({ ...modalData, description: e.target.value })}
                    />
                  </label>
                </div>

                <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <label className="form-switch" style={{ padding: 0 }}>
                    <input
                      type="checkbox"
                      checked={modalData.is_active !== false && modalData.is_active !== 0}
                      onChange={(e) => setModalData({ ...modalData, is_active: e.target.checked })}
                    />
                    <span>Item is visible &amp; active in storefront catalogue</span>
                  </label>
                </div>
              </div>

              {/* SECTION 2: VARIANTS & SIZES TABLE */}
              <div style={{ background: '#fff', border: '1px solid #e1e7e2', borderRadius: '14px', padding: '18px', marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.85rem', color: '#005c4e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <i className="ph ph-stack"></i> 2. Size Variants &amp; Pricing ({modalData.variants?.length || 0})
                    </h4>
                    <small style={{ color: '#77887e', fontSize: '0.65rem' }}>
                      Configure weight sizes, individual SKUs, inventory counts, MRP, and discounts.
                    </small>
                  </div>
                  <button
                    type="button"
                    className="admin-button admin-button--secondary"
                    style={{ fontSize: '0.68rem', padding: '6px 12px' }}
                    onClick={() => {
                      const count = (modalData.variants || []).length;
                      const defaultName = count === 0 ? '250 ml' : count === 1 ? '500 ml' : count === 2 ? '1 Litre' : `Size ${count + 1}`;
                      setModalData({
                        ...modalData,
                        variants: [
                          ...(modalData.variants || []),
                          {
                            variant_name: defaultName,
                            sku: '',
                            stock_quantity: 0,
                            mrp: 0,
                            discount: 0,
                            selling_price: 0,
                            is_inclusive_tax: true,
                            // Mirrors DB DEFAULT 1 for new variants; persisted rows load real values.
                            isLabTested: true,
                            isNatural: true,
                            is_active: true,
                            image: '',
                          },
                        ],
                      });
                    }}
                  >
                    <i className="ph ph-plus-circle"></i> Add variant
                  </button>
                </div>

                <div className="admin-table-wrap" style={{ border: '1px solid #edf0ed', borderRadius: '10px' }}>
                  <table className="admin-table" style={{ fontSize: '0.68rem' }}>
                    <thead>
                      <tr>
                        <th>Size / Weight</th>
                        <th>SKU</th>
                        <th>Stock</th>
                        <th>MRP (₹)</th>
                        <th>Selling (₹)</th>
                        <th>Discount</th>
                        <th>UOM</th>
                        <th>Tax</th>
                        <th>Lab Tested</th>
                        <th>Natural</th>
                        <th>Active</th>
                        <th>Images</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(modalData.variants || []).map((v: any, idx: number) => {
                        const vKey = v.id ?? `new-${idx}`;
                        const orig = v.id ? modalData.origVariants?.[v.id] : undefined;
                        const dirty = !orig
                          ? true
                          : Number(v.mrp) !== Number(orig.mrp) || Number(v.sellingPrice) !== Number(orig.sellingPrice);
                        const shownDiscount = Number(v.discountPercent ?? v.discount) || 0;
                        const imgCount = (v.images || []).length;
                        const expanded = expandedImgVariant === vKey;
                        return (
                          <React.Fragment key={v.id ?? `new-${idx}`}>
                            <tr>
                              <td style={{ minWidth: '100px' }}>
                                <input
                                  type="text"
                                  required
                                  placeholder="e.g. 500 ml"
                                  value={v.variantName || ''}
                                  style={{ padding: '6px 8px', fontSize: '0.7rem' }}
                                  onChange={(e) => {
                                    const newV = [...modalData.variants];
                                    newV[idx] = { ...newV[idx], variantName: e.target.value };
                                    setModalData({ ...modalData, variants: newV });
                                  }}
                                />
                              </td>
                              <td style={{ minWidth: '110px' }}>
                                <input
                                  type="text"
                                  placeholder="Auto / SKU"
                                  value={v.sku || ''}
                                  style={{ padding: '6px 8px', fontSize: '0.7rem' }}
                                  onChange={(e) => {
                                    const newV = [...modalData.variants];
                                    newV[idx] = { ...newV[idx], sku: e.target.value.toUpperCase() };
                                    setModalData({ ...modalData, variants: newV });
                                  }}
                                />
                              </td>
                              <td style={{ width: '70px' }}>
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  placeholder="0"
                                  value={v.stock ?? ''}
                                  style={{ padding: '6px 8px', fontSize: '0.7rem' }}
                                  onChange={(e) => {
                                    const newV = [...modalData.variants];
                                    newV[idx] = { ...newV[idx], stock: parseInt(e.target.value) || 0 };
                                    setModalData({ ...modalData, variants: newV });
                                  }}
                                />
                              </td>
                              <td style={{ width: '80px' }}>
                                <input
                                  type="number"
                                  min={0}
                                  placeholder="₹ MRP"
                                  value={v.mrp ?? ''}
                                  style={{ padding: '6px 8px', fontSize: '0.7rem' }}
                                  onChange={(e) => {
                                    const newV = [...modalData.variants];
                                    newV[idx] = { ...newV[idx], mrp: parseInt(e.target.value) || 0 };
                                    setModalData({ ...modalData, variants: newV });
                                  }}
                                />
                              </td>
                              <td style={{ width: '80px' }}>
                                <input
                                  type="number"
                                  min={0}
                                  placeholder="₹ Price"
                                  value={v.sellingPrice ?? ''}
                                  style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 'bold', color: '#005c4e' }}
                                  onChange={(e) => {
                                    const newV = [...modalData.variants];
                                    newV[idx] = { ...newV[idx], sellingPrice: parseInt(e.target.value) || 0 };
                                    setModalData({ ...modalData, variants: newV });
                                  }}
                                />
                              </td>
                              <td style={{ width: '80px', textAlign: 'center' }}>
                                {dirty ? (
                                  <small style={{ color: '#999', fontStyle: 'italic' }} title="Calculated by the backend on save">auto on save</small>
                                ) : shownDiscount > 0 ? (
                                  <strong style={{ color: '#005c4e' }}>{shownDiscount}%</strong>
                                ) : (
                                  <span style={{ color: '#aaa' }}>—</span>
                                )}
                              </td>
                              <td style={{ width: '60px' }}>
                                <input
                                  type="text"
                                  placeholder="ml"
                                  value={v.uom || ''}
                                  style={{ padding: '6px 8px', fontSize: '0.7rem' }}
                                  onChange={(e) => {
                                    const newV = [...modalData.variants];
                                    newV[idx] = { ...newV[idx], uom: e.target.value };
                                    setModalData({ ...modalData, variants: newV });
                                  }}
                                />
                              </td>
                              <td style={{ textAlign: 'center', width: '44px' }}>
                                <input
                                  type="checkbox"
                                  checked={v.isInclusive !== false}
                                  onChange={(e) => {
                                    const newV = [...modalData.variants];
                                    newV[idx] = { ...newV[idx], isInclusive: e.target.checked };
                                    setModalData({ ...modalData, variants: newV });
                                  }}
                                  title="Tax included"
                                />
                              </td>
                              <td style={{ textAlign: 'center', width: '52px' }}>
                                <input
                                  type="checkbox"
                                  checked={v.isLabTested !== false}
                                  onChange={(e) => {
                                    const newV = [...modalData.variants];
                                    newV[idx] = { ...newV[idx], isLabTested: e.target.checked };
                                    setModalData({ ...modalData, variants: newV });
                                  }}
                                  title="Lab tested"
                                />
                              </td>
                              <td style={{ textAlign: 'center', width: '52px' }}>
                                <input
                                  type="checkbox"
                                  checked={v.isNatural !== false}
                                  onChange={(e) => {
                                    const newV = [...modalData.variants];
                                    newV[idx] = { ...newV[idx], isNatural: e.target.checked };
                                    setModalData({ ...modalData, variants: newV });
                                  }}
                                  title="Natural"
                                />
                              </td>
                              <td style={{ textAlign: 'center', width: '44px' }}>
                                <input
                                  type="checkbox"
                                  checked={v.isActive !== false}
                                  onChange={(e) => {
                                    const newV = [...modalData.variants];
                                    newV[idx] = { ...newV[idx], isActive: e.target.checked };
                                    setModalData({ ...modalData, variants: newV });
                                  }}
                                  title="Active"
                                />
                              </td>
                              <td style={{ textAlign: 'center', width: '70px' }}>
                                <button
                                  type="button"
                                  className="admin-button admin-button--ghost"
                                  style={{ padding: '4px 8px', fontSize: '0.68rem' }}
                                  onClick={() => setExpandedImgVariant(expanded ? null : (v.id ?? `new-${idx}`))}
                                  aria-expanded={expanded}
                                  title="Manage variant images"
                                >
                                  <i className="ph ph-images"></i> {imgCount}
                                </button>
                              </td>
                              <td style={{ textAlign: 'center', width: '44px' }}>
                                <button
                                  type="button"
                                  disabled={modalData.variants?.length <= 1}
                                  onClick={() => {
                                    if (modalData.variants?.length <= 1) return;
                                    const newV = modalData.variants.filter((_: any, i: number) => i !== idx);
                                    setModalData({ ...modalData, variants: newV });
                                  }}
                                  className="admin-action-icon admin-action-icon--danger"
                                  style={{ opacity: modalData.variants?.length <= 1 ? 0.3 : 1, width: '28px', height: '28px' }}
                                  title="Delete variant"
                                >
                                  <i className="ph ph-trash"></i>
                                </button>
                              </td>
                            </tr>
                            {expanded && (
                              <tr>
                                <td colSpan={11} style={{ background: '#fbfdfb', padding: '12px 16px' }}>
                                  {typeof v.id !== 'number' ? (
                                    <small style={{ color: '#77887e' }}>
                                      <i className="ph ph-info"></i> Save the item first to upload and manage images for this new variant.
                                    </small>
                                  ) : (
                                    <VariantImageManager
                                      images={[...(v.images || [])].sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))}
                                      uploading={uploadingImage}
                                      onUpload={(file: File) => handleAddVariantImage(v.id ?? `new-${idx}`, v.id, file)}
                                      onRename={(imageId: number, name: string) => handleRenameVariantImage(v.id ?? `new-${idx}`, imageId, name)}
                                      onReplace={(imageId: number, file: File) => handleReplaceVariantImage(v.id ?? `new-${idx}`, imageId, file)}
                                      onDelete={(imageId: number) => handleDeleteVariantImage(v.id ?? `new-${idx}`, imageId)}
                                      onMove={(imageId: number, dir: -1 | 1) => handleReorderVariantImage(v.id ?? `new-${idx}`, imageId, dir)}
                                    />
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button
                  type="button"
                  className="admin-button admin-button--ghost"
                  onClick={() => setActiveModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admin-button admin-button--primary"
                  disabled={uploadingImage}
                >
                  <i className="ph ph-check"></i> {modalData.id ? 'Update Catalog Item' : 'Save Catalog Item & Variants'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default function AdminPage() {
  return (
    <React.Suspense fallback={<div style={{ padding: '2rem' }}>Loading...</div>}>
      <AdminPageContent />
    </React.Suspense>
  );
}
