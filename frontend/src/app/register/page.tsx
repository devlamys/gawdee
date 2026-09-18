'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('return') || '/account';

  const { refreshCustomer } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('The password confirmation does not match.');
      return;
    }
    setLoading(true);

    try {
      const res = await api.auth.register({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        password_confirmation: confirmPassword,
      });

      if (res.ok) {
        await refreshCustomer();
        router.push(returnUrl);
      }
    } catch (err: any) {
      setError(err.message || 'Registration failed. An account may already exist with this email/phone.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '4rem 1rem 7rem' }}>
      <div
        style={{
          maxWidth: '460px',
          margin: '0 auto',
          background: '#fff',
          borderRadius: '20px',
          padding: '2.5rem',
          boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
          border: '1px solid #eee',
        }}
      >
        <span style={{ color: '#009a84', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.8rem' }}>
          Create Account
        </span>
        <h1 style={{ fontSize: '2rem', margin: '0.4rem 0 0.5rem', color: '#111' }}>
          Join the Gawdee Family
        </h1>
        <p style={{ color: '#777', fontSize: '0.9rem', marginBottom: '1.8rem' }}>
          Track deliveries, save rituals, and access exclusive family offers.
        </p>

        {error && (
          <div style={{ padding: '0.8rem 1rem', background: '#ffebee', color: '#c62828', borderRadius: '8px', marginBottom: '1.2rem', fontSize: '0.9rem' }}>
            <i className="ph ph-warning-circle"></i> {error}
          </div>
        )}

        <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
              Full name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Priya Sharma"
              style={{ width: '100%', padding: '0.7rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
              Email address *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              style={{ width: '100%', padding: '0.7rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
              Phone number *
            </label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile number"
              style={{ width: '100%', padding: '0.7rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
              Password *
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters with a letter and a number"
              style={{ width: '100%', padding: '0.7rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
              Confirm password *
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat your password"
              style={{ width: '100%', padding: '0.7rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="button button--primary"
            style={{ padding: '0.85rem', fontSize: '1rem', marginTop: '0.5rem' }}
          >
            {loading ? 'Creating Account…' : 'Register Account'}
          </button>
        </form>

        <div style={{ marginTop: '2rem', textAlign: 'center', borderTop: '1px solid #eee', paddingTop: '1.2rem', fontSize: '0.9rem', color: '#666' }}>
          Already have an account?{' '}
          <Link href={`/login?return=${encodeURIComponent(returnUrl)}`} style={{ color: '#009a84', fontWeight: 600 }}>
            Sign in here
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div style={{ padding: '6rem 0', textAlign: 'center' }}>Loading…</div>}>
      <RegisterContent />
    </Suspense>
  );
}
