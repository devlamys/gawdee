import { api } from '@/lib/api';
import React from 'react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { NewHomePage as NhpComponents } from '@/components/new-home/NewHomePage';
import { CatalogItem, Testimonial } from '@/types';

const MOCK_ITEMS: CatalogItem[] = [
  {
    id: 1,
    slug: 'a2-ghee',
    name: 'A2 Gir Cow Bilona Ghee',
    flavor: '1 Litre Glass Jar',
    image: '/assets/images/temp-products/B.jpeg',
    category: 'A2 Ghee',
    categoryKey: 'ghee',
    categoryId: 1,
    categoryObj: null,
    tag: '+ TOP RATED CHOICE',
    rating: 4.9,
    reviewCount: 1420,
    isActive: 1,
    description: 'Traditional Curd Churned • Rich Aroma',
    variants: [
      {
        id: 101,
        itemId: 1,
        variantName: '1 Litre Glass Jar',
        slug: 'a2-ghee-1l',
        sku: 'GHEE-1L',
        mrp: 1999,
        sellingPrice: 1825,
        discount: 174,
        discountPercent: 9,
        uom: '1 Litre',
        stock: 100,
        stockStatus: 'in_stock',
        isInclusive: true,
        isLabTested: true,
        isNatural: true,
        isActive: 1,
        image: '',
      }
    ]
  },
  {
    id: 2,
    slug: 'raw-honey',
    name: 'Raw Forest Honey',
    flavor: '650g',
    image: '/assets/images/temp-products/CDGFDF.jpeg',
    category: 'Raw Honey',
    categoryKey: 'honey',
    categoryId: 2,
    categoryObj: null,
    tag: '18% OFF',
    rating: 4.8,
    reviewCount: 670,
    isActive: 1,
    description: 'Single Origin Grass Fed • Churned in Clay Pots',
    variants: [
      {
        id: 102,
        itemId: 2,
        variantName: '650g',
        slug: 'raw-honey-650g',
        sku: 'HONEY-650',
        mrp: 699,
        sellingPrice: 573,
        discount: 126,
        discountPercent: 18,
        uom: '650g',
        stock: 100,
        stockStatus: 'in_stock',
        isInclusive: true,
        isLabTested: true,
        isNatural: true,
        isActive: 1,
        image: '',
      },
      {
        id: 103,
        itemId: 2,
        variantName: '350g',
        slug: 'raw-honey-350g',
        sku: 'HONEY-350',
        mrp: 399,
        sellingPrice: 350,
        discount: 49,
        discountPercent: 12,
        uom: '350g',
        stock: 100,
        stockStatus: 'in_stock',
        isInclusive: true,
        isLabTested: true,
        isNatural: true,
        isActive: 1,
        image: '',
      }
    ]
  },
  {
    id: 3,
    slug: 'moringa-powder',
    name: 'Moringa Powder',
    flavor: '300g',
    image: '/assets/images/temp-products/CNVGVBN.jpeg',
    category: 'Nutritions',
    categoryKey: 'nutrition',
    categoryId: 3,
    categoryObj: null,
    tag: 'Bulk Family Savings',
    rating: 4.9,
    reviewCount: 318,
    isActive: 1,
    description: 'Traditional Airtight Can • Keeps Fresh For 12+',
    variants: [
      {
        id: 104,
        itemId: 3,
        variantName: '300g',
        slug: 'moringa-powder-300g',
        sku: 'MORINGA-300',
        mrp: 349,
        sellingPrice: 293,
        discount: 56,
        discountPercent: 16,
        uom: '300g',
        stock: 100,
        stockStatus: 'in_stock',
        isInclusive: true,
        isLabTested: true,
        isNatural: true,
        isActive: 1,
        image: '',
      }
    ]
  },
  {
    id: 4,
    slug: 'mixme-powder',
    name: 'MixMe Elaichi Nutrition Powder',
    flavor: '400g',
    image: '/assets/images/temp-products/CVNB.jpeg',
    category: 'Nutritions',
    categoryKey: 'nutrition',
    categoryId: 4,
    categoryObj: null,
    tag: 'Bulk Family Savings',
    rating: 4.9,
    reviewCount: 189,
    isActive: 1,
    description: 'Boosts Memory & Vitality',
    variants: [
      {
        id: 105,
        itemId: 4,
        variantName: '400g',
        slug: 'mixme-powder-400g',
        sku: 'MIXME-400',
        mrp: 699,
        sellingPrice: 533,
        discount: 166,
        discountPercent: 24,
        uom: '400g',
        stock: 100,
        stockStatus: 'in_stock',
        isInclusive: true,
        isLabTested: true,
        isNatural: true,
        isActive: 1,
        image: '',
      }
    ]
  }
];



export default async function NewHomePage() {
  let storeSettings = { use_new_homepage: '1' };
  try {
    const res = await api.getStorefront();
    if (res?.ok && res.settings) {
      storeSettings = { ...storeSettings, ...res.settings };
    }
  } catch (e) {
    // ignore
  }

  return (
    <div className="new-homepage-wrapper">
      <Header />
      <NhpComponents 
        items={MOCK_ITEMS} 
        categories={[]} 
        testimonials={[]} 
        storeSettings={storeSettings} 
      />
      <Footer settings={storeSettings} />
    </div>
  );
}
