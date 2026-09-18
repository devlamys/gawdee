'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { CartItem, CatalogItem, CatalogVariant } from '@/types';

interface VariantsDrawerState {
  isOpen: boolean;
  item: CatalogItem | null;
  variants: CatalogVariant[];
}

interface CartContextType {
  items: CartItem[];
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  addItem: (item: Omit<CartItem, 'quantity'>, qty?: number, autoOpen?: boolean) => void;
  updateQuantity: (id: string, delta: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  count: number;
  subtotal: number;
  variantsDrawer: VariantsDrawerState;
  openVariantsDrawer: (item: CatalogItem, variants?: CatalogVariant[]) => void;
  closeVariantsDrawer: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const STORAGE_KEY = 'gawdee_cart_v2';

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [variantsDrawer, setVariantsDrawer] = useState<VariantsDrawerState>({
    isOpen: false,
    item: null,
    variants: [],
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setItems(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
  }, [items, mounted]);

  const openCart = () => setIsOpen(true);
  const closeCart = () => setIsOpen(false);
  const toggleCart = () => setIsOpen((prev) => !prev);

  const openVariantsDrawer = (item: CatalogItem, variants: CatalogVariant[] = []) => {
    const vList = variants && variants.length > 0 ? variants : (item.variants ?? []);
    setVariantsDrawer({
      isOpen: true,
      item,
      variants: vList,
    });
  };

  const closeVariantsDrawer = () => {
    setVariantsDrawer((prev) => ({ ...prev, isOpen: false }));
  };

  const triggerConfetti = () => {
    if (typeof window !== 'undefined' && (window as any).confetti) {
      try {
        (window as any).confetti({
          particleCount: 5,
          angle: 90,
          spread: 12,
          startVelocity: 20,
          origin: { x: Math.random(), y: -0.1 },
          colors: [
            '#ffffffff',
            '#854700ff',
            '#c8a45d',
            '#E6D0BA',
            '#FFD700',
            '#466954',
            '#192d10',
          ],
          zIndex: 10005,
          ticks: 400,
          gravity: 1.5,
          scalar: 1,
          shapes: ['square', 'circle', 'star'],
          disableForReducedMotion: true,
        });
      } catch {}
    }
  };

  const addItem = (item: Omit<CartItem, 'quantity'>, qty = 1, autoOpen = false) => {
    setItems((prev) => {
      const existingIndex = prev.findIndex((i) => i.id === item.id);
      if (existingIndex > -1) {
        const next = [...prev];
        next[existingIndex].quantity += qty;
        return next;
      }
      return [...prev, { ...item, quantity: qty }];
    });
    triggerConfetti();
    if (autoOpen) {
      setIsOpen(true);
    }
  };

  const updateQuantity = (id: string, delta: number) => {
    setItems((prev) => {
      return prev
        .map((item) => {
          if (item.id === id) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const clearCart = () => {
    setItems([]);
  };

  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        isOpen,
        openCart,
        closeCart,
        toggleCart,
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
        count,
        subtotal,
        variantsDrawer,
        openVariantsDrawer,
        closeVariantsDrawer,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
