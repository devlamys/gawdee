'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Customer } from '@/types';
import { api } from '@/lib/api';

interface AuthContextType {
  customer: Customer | null;
  loading: boolean;
  refreshCustomer: () => Promise<void>;
  logout: () => Promise<void>;
  setCustomer: (customer: Customer | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshCustomer = async () => {
    try {
      const res = await api.auth.me();
      if (res.ok && res.customer) {
        setCustomer(res.customer);
      } else {
        setCustomer(null);
      }
    } catch {
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshCustomer();
  }, []);

  const logout = async () => {
    try {
      await api.auth.logout();
    } finally {
      setCustomer(null);
    }
  };

  return (
    <AuthContext.Provider value={{ customer, loading, refreshCustomer, logout, setCustomer }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
