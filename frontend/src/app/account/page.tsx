'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { Order } from '@/types';
import { money } from '@/lib/utils';

export default function AccountPage() {
  const router = useRouter();
  const { customer, loading: authLoading, logout, refreshCustomer } = useAuth();

  const [activeTab, setActiveTab] = useState<'orders' | 'profile' | 'password'>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  // Profile form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    if (!authLoading && !customer) {
      router.push('/login?return=/account');
    }
  }, [authLoading, customer, router]);

  useEffect(() => {
    if (customer) {
      setName(customer.name || '');
      setPhone(customer.phone || '');
      setAddress1(customer.address1 || '');
      setAddress2(customer.address2 || '');
      setCity(customer.city || '');
      setState(customer.state || '');
      setPincode(customer.pincode || '');

      api.account.getOrders()
        .then((res) => {
          if (res.ok && Array.isArray(res.orders)) {
            setOrders(res.orders);
          }
        })
        .catch(() => {})
        .finally(() => setOrdersLoading(false));
    }
  }, [customer]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg('');
    try {
      const res = await api.account.updateProfile({
        name,
        phone,
        address1,
        address2,
        city,
        state,
        pincode,
      });
      if (res.ok) {
        setProfileMsg(res.message || 'Profile updated successfully!');
        await refreshCustomer();
      }
    } catch (err: any) {
      setProfileMsg(err.message || 'Failed to update profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSaving(true);
    setPasswordMsg('');
    setPasswordError('');
    if (newPassword !== confirmPassword) {
      setPasswordError('The new password confirmation does not match.');
      setPasswordSaving(false);
      return;
    }
    try {
      const res = await api.account.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirmation: confirmPassword,
      });
      if (res.ok) {
        setPasswordMsg(res.message || 'Password changed successfully.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to change password.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  if (authLoading || !customer) {
    return (
      <div style={{ textAlign: 'center', padding: '6rem 0', color: '#888' }}>
        <i className="ph ph-spinner ph-spin" style={{ fontSize: '2.5rem', color: '#009a84' }}></i>
        <p style={{ marginTop: '0.8rem' }}>Loading account dashboard…</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '3rem 0 6rem' }}>
      <div className="container">
        {/* Header banner */}
        <div
          style={{
            background: '#fff',
            border: '1px solid #eee',
            borderRadius: '16px',
            padding: '2rem',
            marginBottom: '2rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <span style={{ color: '#009a84', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
              My Account
            </span>
            <h1 style={{ fontSize: '2rem', margin: '0.2rem 0', color: '#111' }}>
              Namaste, {customer.name}
            </h1>
            <p style={{ color: '#777', margin: 0, fontSize: '0.9rem' }}>
              {customer.email} {customer.phone ? `• ${customer.phone}` : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="button button--secondary"
            style={{ color: '#d9534f', borderColor: '#d9534f', minHeight: '40px', height: '40px', padding: '0 1.2rem', fontSize: '0.85rem' }}
          >
            <i className="ph ph-sign-out"></i> Log Out
          </button>
        </div>

        <Link href="/account/loyalty" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', background: '#f4faf8', border: '1px solid #d9ede7', borderRadius: '16px', padding: '1.1rem 1.4rem', marginBottom: '2rem', color: '#007e6f' }}>
          <span><i className="ph ph-coins" style={{ fontSize: '1.4rem', verticalAlign: 'middle', marginRight: '0.5rem' }}></i><strong>My Loyalty Wallet</strong><small style={{ display: 'block', color: '#666', marginTop: '0.3rem' }}>See available coins, pending rewards, and transaction history.</small></span>
          <i className="ph ph-arrow-right"></i>
        </Link>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            style={{
              padding: '0.6rem 1.2rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'orders' ? '3px solid #009a84' : 'none',
              fontWeight: 700,
              color: activeTab === 'orders' ? '#009a84' : '#666',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            <i className="ph ph-package"></i> Orders ({orders.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            style={{
              padding: '0.6rem 1.2rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'profile' ? '3px solid #009a84' : 'none',
              fontWeight: 700,
              color: activeTab === 'profile' ? '#009a84' : '#666',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            <i className="ph ph-user"></i> Delivery Profile
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('password')}
            style={{
              padding: '0.6rem 1.2rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'password' ? '3px solid #009a84' : 'none',
              fontWeight: 700,
              color: activeTab === 'password' ? '#009a84' : '#666',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            <i className="ph ph-key"></i> Security
          </button>
        </div>

        {/* Tab 1: Orders */}
        {activeTab === 'orders' && (
          <div>
            {ordersLoading ? (
              <p style={{ textAlign: 'center', padding: '3rem 0', color: '#888' }}>Loading orders…</p>
            ) : orders.length === 0 ? (
              <div style={{ background: '#fff', padding: '4rem 2rem', borderRadius: '16px', textAlign: 'center', border: '1px solid #eee' }}>
                <i className="ph ph-shopping-bag" style={{ fontSize: '3rem', color: '#ccc' }}></i>
                <h3 style={{ marginTop: '1rem' }}>No orders placed yet</h3>
                <p style={{ color: '#777' }}>Your natural pantry essentials are waiting to be explored.</p>
                <Link className="button button--primary" href="/products" style={{ marginTop: '1.2rem', display: 'inline-block' }}>
                  Browse Products
                </Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                {orders.map((order) => (
                  <div
                    key={order.id}
                    style={{
                      background: '#fff',
                      border: '1px solid #eee',
                      borderRadius: '16px',
                      padding: '1.5rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '1rem',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
                        <strong style={{ fontSize: '1.1rem', color: '#111' }}>{order.order_number}</strong>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '0.2rem 0.6rem',
                            borderRadius: '20px',
                            background: order.status === 'delivered' ? '#e6f6f2' : '#f0f5ff',
                            color: order.status === 'delivered' ? '#009a84' : '#2b6cb0',
                            textTransform: 'capitalize',
                          }}
                        >
                          {order.status}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: '#777', margin: 0 }}>
                        Placed on {new Date(order.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })} •{' '}
                        {order.payment_method === 'cod' ? 'Cash on Delivery' : 'Online Paid'}
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                      <strong style={{ fontSize: '1.2rem', color: '#009a84' }}>{money(order.total)}</strong>
                      <Link
                        className="button button--secondary"
                        href={`/account/orders/${order.order_number}`}
                        style={{ fontSize: '0.85rem', padding: '0 1rem', minHeight: '38px', height: '38px', lineHeight: '1' }}
                      >
                        View Tracking <i className="ph ph-arrow-right"></i>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Delivery Profile */}
        {activeTab === 'profile' && (
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '16px', padding: '2rem', maxWidth: '640px' }}>
            <h2 style={{ fontSize: '1.4rem', marginBottom: '1.5rem' }}>Saved Delivery Address</h2>
            {profileMsg && (
              <div style={{ padding: '0.8rem', background: '#e6f6f2', color: '#009a84', borderRadius: '8px', marginBottom: '1.2rem', fontSize: '0.9rem' }}>
                {profileMsg}
              </div>
            )}
            <form onSubmit={handleProfileSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Full name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Phone</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Address Line 1</label>
                <input
                  value={address1}
                  onChange={(e) => setAddress1(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Address Line 2</label>
                <input
                  value={address2}
                  onChange={(e) => setAddress2(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>City</label>
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>State</label>
                  <input
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Pincode</label>
                  <input
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={profileSaving}
                className="button button--primary"
                style={{ marginTop: '0.8rem', padding: '0.8rem' }}
              >
                {profileSaving ? 'Saving Changes…' : 'Save Delivery Profile'}
              </button>
            </form>
          </div>
        )}

        {/* Tab 3: Security */}
        {activeTab === 'password' && (
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '16px', padding: '2rem', maxWidth: '480px' }}>
            <h2 style={{ fontSize: '1.4rem', marginBottom: '1.5rem' }}>Change Account Password</h2>
            {passwordMsg && (
              <div style={{ padding: '0.8rem', background: '#e6f6f2', color: '#009a84', borderRadius: '8px', marginBottom: '1.2rem', fontSize: '0.9rem' }}>
                {passwordMsg}
              </div>
            )}
            {passwordError && (
              <div style={{ padding: '0.8rem', background: '#ffebee', color: '#c62828', borderRadius: '8px', marginBottom: '1.2rem', fontSize: '0.9rem' }}>
                {passwordError}
              </div>
            )}
            <form onSubmit={handlePasswordSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Current password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>New password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters with a letter and a number"
                  style={{ width: '100%', padding: '0.65rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Confirm new password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat the new password"
                  style={{ width: '100%', padding: '0.65rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
                />
              </div>
              <button
                type="submit"
                disabled={passwordSaving}
                className="button button--primary"
                style={{ marginTop: '0.8rem', padding: '0.8rem' }}
              >
                {passwordSaving ? 'Updating Password…' : 'Update Password'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
