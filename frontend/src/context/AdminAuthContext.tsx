'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { adminApi, type AdminSetupPayload } from '@/lib/admin-api';

interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface AdminAuthContextType {
  admin: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  setup: (payload: AdminSetupPayload) => Promise<void>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const authVersion = useRef(0);

  useEffect(() => {
    let active = true;
    const version = ++authVersion.current;
    async function checkAuth() {
      try {
        const res = await adminApi.me();
        if (!active || version !== authVersion.current) return;
        if (res?.ok && res.admin) {
          setAdmin(res.admin);
        } else {
          setAdmin(null);
        }
      } catch {
        if (active && version === authVersion.current) setAdmin(null);
      } finally {
        if (active && version === authVersion.current) setLoading(false);
      }
    }
    checkAuth();
    return () => { active = false; };
  }, [pathname]);

  const authenticate = async (request: () => Promise<{ ok: boolean; admin: AdminUser }>) => {
    // Ignore session checks started before this login or first-admin setup.
    const version = ++authVersion.current;
    try {
      const res = await request();
      if (version !== authVersion.current) return;
      if (!res?.ok || !res.admin) throw new Error('Unable to sign in. Please try again.');
      setAdmin(res.admin);
      router.replace('/admin');
    } finally {
      if (version === authVersion.current) setLoading(false);
    }
  };

  const login = (email: string, password: string) => authenticate(() => adminApi.login(email, password));
  const setup = (payload: AdminSetupPayload) => authenticate(() => adminApi.setup(payload));

  const logout = async () => {
    ++authVersion.current;
    await adminApi.logout();
    setAdmin(null);
    router.push('/admin/login');
  };

  return (
    <AdminAuthContext.Provider value={{ admin, loading, login, setup, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = () => {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
};
