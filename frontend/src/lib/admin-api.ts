/**
 * Gawdee Admin API Client
 * Parity with FastAPI /api/admin/* endpoints
 */

import { env } from '@/config/env';
import type { CatalogItem, CatalogVariant, CatalogVariantImage } from '@/types';

const API_BASE = typeof window === 'undefined' ? env.internalApiUrl : env.publicApiUrl;

function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  const local = localStorage.getItem('gawdee_admin_token');
  if (local) return local;
  const match = document.cookie.match(/(?:^|;\s*)admin_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function setAdminToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) {
    localStorage.setItem('gawdee_admin_token', token);
    document.cookie = `admin_token=${encodeURIComponent(token)}; path=/; max-age=604800; SameSite=Lax`;
  } else {
    localStorage.removeItem('gawdee_admin_token');
    document.cookie = 'admin_token=; path=/; max-age=0';
  }
}

async function adminFetch<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAdminToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // If body is not FormData, add application/json
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}/admin${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.detail || data.message || `Request failed with status ${res.status}`);
  }

  return data;
}

// Same auth/headers as adminFetch but rooted at /api/catalog (canonical
// hierarchy endpoints). Admin-only routes still require the bearer token.
async function catalogFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAdminToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}/catalog${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.detail || data.message || `Request failed with status ${res.status}`);
  }

  return data;
}

export const adminApi = {
  // Auth
  async login(email: string, password: string) {    const data = await adminFetch('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.token) {
      setAdminToken(data.token);
    }
    return data;
  },

  async me() {
    return adminFetch('/me');
  },

  async setupStatus() {
    return adminFetch<{ ok: boolean; setup_required: boolean }>('/setup-status');
  },

  async setup(payload: { name: string; email: string; password: string; password_confirmation: string }) {
    const data = await adminFetch('/setup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (data.token) {
      setAdminToken(data.token);
    }
    return data;
  },

  async logout() {
    try {
      await adminFetch('/logout', { method: 'POST' });
    } finally {
      setAdminToken(null);
    }
  },

  // Stats
  async getStats() {
    return adminFetch('/stats');
  },

  // Products
  async getProducts() {
    return adminFetch('/products');
  },

  async saveProduct(payload: any) {
    return adminFetch('/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async toggleProduct(productId: string) {
    return adminFetch(`/products/${productId}/toggle`, {
      method: 'POST',
    });
  },

  async deleteProduct(productId: string) {
    return adminFetch(`/products/${productId}`, {
      method: 'DELETE',
    });
  },

  // Items & Variants
  async getItems() {
    return adminFetch('/items');
  },
  async saveItem(payload: any) {
    return adminFetch('/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async toggleItem(itemId: number) {
    return adminFetch(`/items/${itemId}/toggle`, {
      method: 'POST',
    });
  },

  async deleteItem(itemId: number) {
    return adminFetch(`/items/${itemId}`, {
      method: 'DELETE',
    });
  },

  // Canonical hierarchy (Category → Item → Variant → VariantImage)
  async catalogAdminItems(): Promise<{ ok: boolean; items: CatalogItem[] }> {
    return catalogFetch<{ ok: boolean; items: CatalogItem[] }>('/admin/items');
  },

  async catalogAdminGetItem(itemId: number): Promise<{ ok: boolean; item: CatalogItem }> {
    return catalogFetch<{ ok: boolean; item: CatalogItem }>(`/items/${itemId}?include_inactive=1`);
  },

  async catalogCreateVariant(payload: Record<string, unknown>): Promise<{ ok: boolean; message?: string; variant_id: number; variant: CatalogVariant }> {
    return catalogFetch<{ ok: boolean; message?: string; variant_id: number; variant: CatalogVariant }>('/admin/variants', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async catalogUpdateVariant(variantId: number, payload: Record<string, unknown>): Promise<{ ok: boolean; message?: string; variant: CatalogVariant }> {
    return catalogFetch<{ ok: boolean; message?: string; variant: CatalogVariant }>(`/admin/variants/${variantId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async catalogUpdateVariantPrice(variantId: number, payload: { mrp?: number; sellingPrice?: number }): Promise<{ ok: boolean; message?: string; variant: CatalogVariant }> {
    return catalogFetch<{ ok: boolean; message?: string; variant: CatalogVariant }>(`/admin/variants/${variantId}/price`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async catalogUpdateVariantStock(variantId: number, stock: number): Promise<{ ok: boolean; message?: string; variant: CatalogVariant }> {
    return catalogFetch<{ ok: boolean; message?: string; variant: CatalogVariant }>(`/admin/variants/${variantId}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({ stock }),
    });
  },

  async catalogAddVariantImage(variantId: number, payload: { name?: string; imageUrl: string }): Promise<{ ok: boolean; message?: string; image_id: number; image: CatalogVariantImage }> {
    return catalogFetch<{ ok: boolean; message?: string; image_id: number; image: CatalogVariantImage }>(`/admin/variants/${variantId}/images`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async catalogUpdateVariantImage(imageId: number, payload: Record<string, unknown>): Promise<{ ok: boolean; message?: string; image_id?: number }> {
    return catalogFetch<{ ok: boolean; message?: string; image_id?: number }>(`/admin/variant-images/${imageId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async catalogDeleteVariantImage(imageId: number): Promise<{ ok: boolean; message?: string; image_id?: number }> {
    return catalogFetch<{ ok: boolean; message?: string; image_id?: number }>(`/admin/variant-images/${imageId}`, {
      method: 'DELETE',
    });
  },

  // Categories
  async getCategories() {
    return adminFetch('/categories');
  },

  async saveCategory(payload: any) {
    return adminFetch('/categories', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async deleteCategory(categoryId: number) {
    return adminFetch(`/categories/${categoryId}`, {
      method: 'DELETE',
    });
  },

  // Orders
  async getOrders(status?: string, search?: string) {
    const params = new URLSearchParams();
    if (status && status !== 'all') params.set('status', status);
    if (search) params.set('search', search);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return adminFetch(`/orders${qs}`);
  },

  async getOrderDetail(orderId: number) {
    return adminFetch(`/orders/${orderId}`);
  },

  async getCustomerReviews(search = '', sort = 'newest', productId?: number) {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (sort) params.set('sort', sort);
    if (productId) params.set('product_id', String(productId));
    return adminFetch(`/customer-reviews?${params.toString()}`);
  },

  async updateOrderStatus(orderId: number, status: string, note?: string) {
    return adminFetch(`/orders/${orderId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, note }),
    });
  },

  async updateOrderTracking(orderId: number, trackingNumber: string, courierName?: string, trackingUrl?: string) {
    return adminFetch(`/orders/${orderId}/tracking`, {
      method: 'POST',
      body: JSON.stringify({
        tracking_number: trackingNumber,
        courier_name: courierName,
        tracking_url: trackingUrl,
      }),
    });
  },

  // Reels
  async getReels() {
    return adminFetch('/reels');
  },

  async saveReel(payload: any) {
    return adminFetch('/reels', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async deleteReel(reelId: number) {
    return adminFetch(`/reels/${reelId}`, {
      method: 'DELETE',
    });
  },

  // Banners
  async getBanners() {
    return adminFetch('/banners');
  },

  async saveBanner(payload: any) {
    return adminFetch('/banners', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async deleteBanner(bannerId: number) {
    return adminFetch(`/banners/${bannerId}`, {
      method: 'DELETE',
    });
  },

  // Banners Two
  async getBannersTwo() {
    return adminFetch('/banners-two');
  },

  async saveBannerTwo(payload: any) {
    return adminFetch('/banners-two', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async deleteBannerTwo(bannerId: number) {
    return adminFetch(`/banners-two/${bannerId}`, {
      method: 'DELETE',
    });
  },

  // Testimonials
  async getTestimonials() {
    return adminFetch('/testimonials');
  },

  async saveTestimonial(payload: any) {
    return adminFetch('/testimonials', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async deleteTestimonial(testimonialId: number) {
    return adminFetch(`/testimonials/${testimonialId}`, {
      method: 'DELETE',
    });
  },

  // Blog
  async getBlog() {
    return adminFetch('/blog');
  },

  async saveBlog(payload: any) {
    return adminFetch('/blog', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async deleteBlog(postId: number) {
    return adminFetch(`/blog/${postId}`, {
      method: 'DELETE',
    });
  },

  // Settings
  async getSettings() {
    return adminFetch('/settings');
  },

  async saveSettings(payload: Record<string, any>) {
    return adminFetch('/settings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Upload Media
  async uploadMedia(file: File, folder: string = 'products') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);
    return adminFetch('/upload', {
      method: 'POST',
      body: formData,
    });
  },
};
