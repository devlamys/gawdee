import {
  Product,
  Order,
  Customer,
  Review,
  BlogPost,
  Testimonial,
  VideoTestimonial,
  HomepageMedia,
  Offer,
  StorefrontResponse,
  CatalogCategory,
  CatalogItem,
  CatalogVariant,
  CatalogVariantImage,
  HeroSlideRow,
} from '@/types';
import { env } from '@/config/env';

const API_BASE = typeof window === 'undefined' ? env.internalApiUrl : '/api';

export interface ApiErrorData {
  message?: string;
  reset_checkout?: boolean;
  [key: string]: unknown;
}

async function fetcher<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (data as Record<string, unknown>).detail;
    const message =
      (data as Record<string, unknown>).message ??
      (typeof detail === 'string' ? detail : (detail as ApiErrorData | undefined)?.message) ??
      `Request failed with status ${res.status}`;
    const err = new Error(typeof message === 'string' ? message : `Request failed with status ${res.status}`) as Error & {
      status?: number;
      data?: unknown;
    };
    err.status = res.status;
    err.data = typeof detail === 'object' && detail !== null ? detail : data;
    throw err;
  }
  return data as T;
}

export interface WishlistMap {
  [itemKey: string]: string[];
}

export interface CreateOrderResponse {
  ok: boolean;
  order_number: string;
  payment_method: string;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  coupon_code?: string;
  already_paid?: boolean;
  account_url?: string;
  razorpay?: {
    key: string;
    order_id: string;
    amount: number;
    currency: string;
    name: string;
    description: string;
    prefill: { name: string; email: string; contact: string };
  };
}

export const api = {
  // Storefront & Site config
  getStorefront: () => fetcher<StorefrontResponse>('/storefront', { next: { revalidate: 60 } }),

  // Animated-hero 3D slides (Admin > Animated hero, public read)
  getHeroSlides: () =>
    fetcher<{ ok: boolean; slides: HeroSlideRow[] }>('/hero-slides', { next: { revalidate: 60 } }),

  // Products & Catalogue (backend is the source of truth — no local fallback data)
  getProducts: () => fetcher<{ ok: boolean; products: Product[] }>('/products', { next: { revalidate: 60 } }),
  getProduct: (idOrSlug: string) => fetcher<{ ok: boolean; product: Product; variants?: Product[]; item?: unknown; reviews: Review[] }>(`/products/${idOrSlug}`),

  // Canonical hierarchy: Category → Item → Variants → VariantImages (Phase 3)
  catalog: {
    getCategories: () =>
      fetcher<{ ok: boolean; categories: CatalogCategory[] }>('/catalog/categories', { next: { revalidate: 120 } }),
    getItems: (categoryId?: number) =>
      fetcher<{ ok: boolean; items: CatalogItem[] }>(
        categoryId ? `/catalog/items?category_id=${categoryId}` : '/catalog/items',
        { next: { revalidate: 60 } }
      ),
    getItem: (ref: string | number) =>
      fetcher<{ ok: boolean; item: CatalogItem }>(`/catalog/items/${ref}`),
    getVariant: (ref: string | number) =>
      fetcher<{ ok: boolean; variant: CatalogVariant }>(`/catalog/variants/${ref}`),
    getVariantImages: (ref: string | number) =>
      fetcher<{ ok: boolean; variant_id: number; images: CatalogVariantImage[] }>(`/catalog/variants/${ref}/images`),
  },

  // Reviews — backend shape: { id, product_id, rating, review, name, created_at }
  getReviewEligibility: (productId: number) =>
    fetcher<{ ok: boolean; eligible: boolean; purchased: boolean; reviewed: boolean; customer: { name: string; email: string } }>(`/products/${productId}/review-eligibility`),
  submitReview: (payload: { product_id: number; review: string; rating: number }) =>
    fetcher<{ ok: boolean; message: string; review: Review }>('/product-review', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Newsletter
  subscribe: (email: string) =>
    fetcher<{ ok: boolean; message: string }>('/subscribe', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  // Wishlist — backend shape: { ok, items: { itemKey: [productIds] }, count }
  getWishlist: () => fetcher<{ ok: boolean; items: WishlistMap; count: number }>('/wishlist'),
  toggleWishlist: (ids: string[], saved: boolean) =>
    fetcher<{ ok: boolean; items: WishlistMap; count: number }>('/wishlist', {
      method: 'POST',
      body: JSON.stringify({ ids, saved }),
    }),

  // Orders & Payment — backend expects { customer, items: [{ id, quantity }], payment_method, checkout_token, coupon_code }
  createOrder: (payload: {
    customer: {
      name: string;
      email: string;
      phone: string;
      address1: string;
      address2?: string;
      city: string;
      state: string;
      pincode: string;
      notes?: string;
    };
    coupon_code?: string;
    payment_method: 'razorpay' | 'cod';
    checkout_token: string;
    items: { id: string; quantity: number }[];
  }) => fetcher<CreateOrderResponse>('/create-order', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),

  verifyPayment: (payload: {
    order_number: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) =>
    fetcher<{ ok: boolean; success_url?: string }>('/verify-payment', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // AI Wellness Chat
  aiChat: (message: string) =>
    fetcher<{ ok: boolean; reply: string }>('/ai-chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  // Social & Content
  getTestimonials: () => fetcher<{ ok: boolean; testimonials: Testimonial[] }>('/testimonials', { next: { revalidate: 120 } }),
  getVideoTestimonials: () => fetcher<{ ok: boolean; video_testimonials: VideoTestimonial[] }>('/video-testimonials', { next: { revalidate: 120 } }),
  getOffers: () => fetcher<{ ok: boolean; offers: Offer[] }>('/offers', { cache: 'no-store' }),
  getHomepageMedia: (section = 'reels') => fetcher<{ ok: boolean; media: HomepageMedia[] }>(`/homepage-media?section=${section}`, { cache: 'no-store' }),
  getBlog: (limit = 10) => fetcher<{ ok: boolean; posts: BlogPost[] }>(`/blog?limit=${limit}`, { next: { revalidate: 120 } }),
  getBlogPost: (slug: string) => fetcher<{ ok: boolean; post: BlogPost }>(`/blog/${slug}`),

  // Auth — backend login uses { identity, password }; register needs password_confirmation
  auth: {
    me: () => fetcher<{ ok: boolean; customer: Customer | null }>('/auth/me'),
    login: (identity: string, password?: string) =>
      fetcher<{ ok: boolean; customer: Customer }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identity, password }),
      }),
    register: (payload: { name: string; email: string; phone: string; password: string; password_confirmation: string }) =>
      fetcher<{ ok: boolean; user_id?: number; name?: string; email?: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    logout: () =>
      fetcher<{ ok: boolean }>('/auth/logout', {
        method: 'POST',
      }),
    requestOtp: (phone: string) =>
      fetcher<{ ok: boolean; message: string; channel?: string; debug_otp?: string }>('/auth/otp/request', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      }),
    verifyOtp: (phone: string, otp: string) =>
      fetcher<{ ok: boolean; customer: Customer }>('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ phone, otp }),
      }),
  },

  // Account — backend returns { ok, message } for profile/password; order detail embeds items
  account: {
    updateProfile: (payload: { name: string; phone?: string; address1?: string; address2?: string; city?: string; state?: string; pincode?: string }) =>
      fetcher<{ ok: boolean; message: string }>('/account/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    changePassword: (payload: { current_password: string; new_password: string; new_password_confirmation: string }) =>
      fetcher<{ ok: boolean; message: string }>('/account/password', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    getOrders: () => fetcher<{ ok: boolean; orders: Order[] }>('/account/orders'),
    getOrder: (orderNumber: string) => fetcher<{ ok: boolean; order: Order }>(`/account/orders/${orderNumber}`),
  },
};
