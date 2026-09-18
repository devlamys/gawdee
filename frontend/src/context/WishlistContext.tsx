'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, WishlistMap } from '@/lib/api';

interface WishlistContextType {
  wishlistIds: string[];
  isWishlisted: (id: string) => boolean;
  toggleWishlist: (itemKey: string, productIds?: string[]) => Promise<void>;
  count: number;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

const STORAGE_KEY = 'gawdee_wishlist_ids';

function flattenWishlist(items: WishlistMap | string[] | undefined): string[] {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  const ids = new Set<string>();
  for (const group of Object.values(items)) {
    for (const id of group || []) ids.add(id);
  }
  return [...ids];
}

export const WishlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setWishlistIds(JSON.parse(stored));
      }
    } catch {
      // ignore
    }

    // Attempt to fetch from backend
    api.getWishlist()
      .then((res) => {
        if (res.ok && res.items) {
          const ids = flattenWishlist(res.items);
          setWishlistIds(ids);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
        }
      })
      .catch(() => {});
  }, []);

  const isWishlisted = (id: string) => wishlistIds.includes(id);

  const toggleWishlist = async (itemKey: string, productIds?: string[]) => {
    const ids = productIds && productIds.length > 0 ? productIds : [itemKey];
    const saved = !wishlistIds.includes(itemKey);
    const next = saved
      ? [...new Set([...wishlistIds, ...ids])]
      : wishlistIds.filter((id) => !ids.includes(id));
    setWishlistIds(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));

    try {
      const res = await api.toggleWishlist(ids, saved);
      if (res.ok && res.items) {
        const serverIds = flattenWishlist(res.items);
        setWishlistIds(serverIds);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serverIds));
      }
    } catch {
      // local optimistic update already saved
    }
  };

  return (
    <WishlistContext.Provider
      value={{
        wishlistIds,
        isWishlisted,
        toggleWishlist,
        count: wishlistIds.length,
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error('useWishlist must be used within a WishlistProvider');
  }
  return context;
};
