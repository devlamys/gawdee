export interface Product {
  id: string;
  slug: string;
  name: string;
  full_name: string;
  category: string;
  category_key: string;
  tag?: string;
  price: number;
  original_price: number;
  weight?: string;
  image: string;
  description?: string;
  accent?: string;
  stock: number;
  stock_status?: string;
  sku?: string;
  benefits?: string;
  ingredients?: string;
  nutrition?: string;
  rating?: number;
  reviews_count?: number;
  review_count?: number;
  family_key?: string;
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  original_price?: number;
  weight?: string;
  image: string;
  quantity: number;
  type?: 'product' | 'combo';
  bundle_ids?: string[];
  variant_id?: number;
  item_id?: number;
  variant_name?: string;
  uom?: string;
  sku?: string;
}

// ── Canonical catalog DTOs (Phase 3 /api/catalog/*, camelCase) ─────────────
// Category → Item → Variants → VariantImages. All values come from the
// backend; the frontend never invents pricing, stock, or discounts.

export interface CatalogCategory {
  id: number;
  name: string;
  filter: string;
  imageUrl: string;
  icon: string;
  sortOrder: number;
  isActive: number;
  parentId: number | null;
  parent: { id: number; name: string } | null;
  childIds: number[];
}

export interface CatalogVariantImage {
  id: number;
  name: string;
  variantId: number;
  imageUrl: string;
  sortOrder: number;
  isActive: number;
}

export interface CatalogVariant {
  id: number;
  itemId: number;
  variantName: string;
  slug: string;
  sku: string;
  mrp: number;
  sellingPrice: number;
  discount: number;
  discountPercent: number;
  uom: string;
  stock: number;
  stockStatus: string;
  isInclusive: boolean;
  isLabTested: boolean;
  isNatural: boolean;
  image: string;
  isActive: number;
  images?: CatalogVariantImage[];
  imageCount?: number;
}

export interface CatalogItem {
  id: number;
  slug: string;
  name: string;
  flavor?: string;
  description?: string;
  image: string;
  imageUrl?: string;
  hoverImage?: string;
  hoverImageUrl?: string;
  category: string;
  categoryKey: string;
  categoryId: number | null;
  categoryObj: CatalogCategory | null;
  tag?: string;
  accent?: string;
  rating?: number;
  reviewCount?: number;
  isActive: number;
  variants: CatalogVariant[];
}

/** Admin-managed Animated-hero 3D slide row (GET /api/hero-slides). */
export interface HeroSlideRow {
  id: number;
  title: string;
  cat?: string;
  title_html?: string;
  word?: string;
  sub?: string;
  price_label?: string;
  mrp_label?: string;
  off_badge?: string;
  reviews_label?: string;
  product_image?: string;
  cart_id?: string;
  cart_name?: string;
  cart_price?: number;
  cart_image?: string;
  sort_order?: number;
  is_active?: number;
}

export interface Review {  id: number;
  product_id: string;
  rating: number;
  // Backend field names (GET /api/products/{slug} and POST /api/product-review)
  review?: string;
  name?: string;
  date?: string;
  created_at?: string;
  // Legacy aliases accepted when rendering
  author_name?: string;
  title?: string;
  body?: string;
  status?: string;
}

export interface Customer {
  id: number;
  name: string;
  email: string;
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  created_at?: string;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  image?: string;
}

export interface Order {
  id: number;
  order_number: string;
  customer_name: string;
  email: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  pincode: string;
  notes?: string;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  payment_method: string;
  payment_status: string;
  status: string;
  tracking_number?: string;
  tracking_url?: string;
  courier_name?: string;
  created_at: string;
  items?: OrderItem[];
  events?: Array<{ id: number; status: string; title: string; description?: string; created_at: string }>;
}

export interface BlogPost {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  // Backend field names
  featured_image?: string;
  author?: string;
  // Legacy aliases
  cover_image?: string;
  author_name?: string;
  category?: string;
  published_at?: string;
  status?: string;
}

export interface Testimonial {
  id: number;
  name: string;
  initials?: string;
  avatar?: string;
  // Backend field names
  product_name?: string;
  product_slug?: string;
  // Legacy aliases
  location?: string;
  product_title?: string;
  quote: string;
  rating: number;
  verified?: number;
  created_at?: string;
}

export interface VideoTestimonial {
  id: number;
  name: string;
  role_location?: string;
  quote?: string;
  rating: number;
  video_type: 'upload' | 'embed';
  video_path?: string;
  poster_path?: string;
  external_url?: string;
  sort_order?: number;
}

export interface HomepageMedia {
  id: number;
  section_key: string;
  media_type: 'image' | 'video';
  title?: string;
  subtitle?: string;
  file_path?: string;
  poster_path?: string;
  external_url?: string;
  link_url?: string;
  alt_text?: string;
  product_slug?: string;
}

export interface CMSSection {
  id: number;
  section_key: string;
  title: string;
  eyebrow?: string;
  subtitle?: string;
  button_label?: string;
  button_url?: string;
  image?: string;
  mobile_image?: string;
  is_active: number;
  sort_order: number;
}

export interface Banner {
  id: number;
  title: string;
  subtitle?: string;
  link_url?: string;
  desktop_image: string;
  mobile_image?: string;
  alt_text?: string;
  button_label?: string;
  is_active: number;
  sort_order: number;
}

export interface StorefrontSettings {
  store_name?: string;
  store_email?: string;
  store_phone?: string;
  brand_name?: string;
  brand_logo?: string;
  brand_color?: string;
  brand_accent?: string;
  brand_tagline?: string;
  currency?: string;
  free_shipping_threshold?: string;
  shipping_fee?: string;
  cod_enabled?: string;
  offer_code?: string;
  offer_percent?: string;
  offer_popup_enabled?: string;
  offer_popup_image?: string;
  offer_popup_delay_ms?: string;
  ai_chat_enabled?: string;
  site_show_whatsapp?: string;
  site_show_chat?: string;
  footer_description?: string;
  footer_signup_title?: string;
  footer_signup_text?: string;
  social_instagram?: string;
  social_facebook?: string;
  social_youtube?: string;
  app_apple?: string;
  app_google?: string;
  announcement_text?: string;
  announcement_url?: string;
  header_shop_label?: string;
  home_hero_slideshow?: string;
  whatsapp_number?: string;
  page_shipping?: string;
  page_returns?: string;
  page_contact?: string;
  site_density?: string;
  site_design_v1?: string;
  storefront_collections_v1?: string;
  use_new_homepage?: string;
  show_homepage_heading?: string;
  show_footer_heading?: string;
}

export interface StorefrontResponse {
  ok: boolean;
  settings: StorefrontSettings;
  sections: Record<string, CMSSection>;
  banners: Banner[];
  razorpay_key_id?: string;
  razorpay_enabled?: boolean;
  delhivery_enabled?: boolean;
}
