'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('return') || '/account';

  const { refreshCustomer } = useAuth();

  // Mode: 'password' | 'otp'
  const [mode, setMode] = useState<'password' | 'otp'>('password');

  // Password fields
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [password, setPassword] = useState('');

  // OTP fields
  const [otpPhone, setOtpPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpMessage, setOtpMessage] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.auth.login(loginIdentifier.trim(), password);
      if (res.ok) {
        await refreshCustomer();
        router.push(returnUrl);
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpPhone.trim()) return;
    setError('');
    setLoading(true);
    try {
      const res = await api.auth.requestOtp(otpPhone.trim());
      if (res.ok) {
        setOtpSent(true);
        setOtpMessage(res.message || 'OTP sent successfully!');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) return;
    setError('');
    setLoading(true);
    try {
      const res = await api.auth.verifyOtp(otpPhone.trim(), otpCode.trim());
      if (res.ok) {
        await refreshCustomer();
        router.push(returnUrl);
      }
    } catch (err: any) {
      setError(err.message || 'Invalid or expired OTP.');
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
          Customer Sign In
        </span>
        <h1 style={{ fontSize: '2rem', margin: '0.4rem 0 1.5rem', color: '#111' }}>
          Welcome back
        </h1>

        {/* Tab switch */}
        <div style={{ display: 'flex', borderBottom: '2px solid #eee', marginBottom: '1.5rem' }}>
          <button
            type="button"
            onClick={() => {
              setMode('password');
              setError('');
            }}
            style={{
              flex: 1,
              padding: '0.8rem',
              background: 'none',
              border: 'none',
              borderBottom: mode === 'password' ? '2px solid #009a84' : 'none',
              marginBottom: '-2px',
              fontWeight: 700,
              color: mode === 'password' ? '#009a84' : '#888',
              cursor: 'pointer',
            }}
          >
            Password
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('otp');
              setError('');
            }}
            style={{
              flex: 1,
              padding: '0.8rem',
              background: 'none',
              border: 'none',
              borderBottom: mode === 'otp' ? '2px solid #009a84' : 'none',
              marginBottom: '-2px',
              fontWeight: 700,
              color: mode === 'otp' ? '#009a84' : '#888',
              cursor: 'pointer',
            }}
          >
            WhatsApp / SMS OTP
          </button>
        </div>

        {error && (
          <div style={{ padding: '0.8rem 1rem', background: '#ffebee', color: '#c62828', borderRadius: '8px', marginBottom: '1.2rem', fontSize: '0.9rem' }}>
            <i className="ph ph-warning-circle"></i> {error}
          </div>
        )}

        {/* Mode 1: Password Login */}
        {mode === 'password' && (
          <form onSubmit={handlePasswordLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Email or phone number
              </label>
              <input
                type="text"
                required
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                placeholder="Enter email or 10-digit phone"
                style={{ width: '100%', padding: '0.7rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ width: '100%', padding: '0.7rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="button button--primary"
              style={{ padding: '0.85rem', fontSize: '1rem', marginTop: '0.5rem' }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}

        {/* Mode 2: OTP Login */}
        {mode === 'otp' && (
          <div>
            {!otpSent ? (
              <form onSubmit={handleRequestOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                    10-Digit Mobile Number
                  </label>
                  <input
                    type="tel"
                    required
                    pattern="[0-9]{10}"
                    value={otpPhone}
                    onChange={(e) => setOtpPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    style={{ width: '100%', padding: '0.7rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="button button--primary"
                  style={{ padding: '0.85rem', fontSize: '1rem' }}
                >
                  {loading ? 'Sending OTP…' : 'Send Verification OTP'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                {otpMessage && (
                  <div style={{ padding: '0.8rem', background: '#e6f6f2', color: '#009a84', borderRadius: '8px', fontSize: '0.85rem' }}>
                    {otpMessage}
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                    Enter 6-Digit OTP sent to {otpPhone}
                  </label>
                  <input
                    type="text"
                    required
                    pattern="[0-9]{4,6}"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="123456"
                    autoFocus
                    style={{ width: '100%', padding: '0.7rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px', letterSpacing: '4px', textAlign: 'center', fontSize: '1.3rem', fontWeight: 700 }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="button button--primary"
                  style={{ padding: '0.85rem', fontSize: '1rem' }}
                >
                  {loading ? 'Verifying…' : 'Verify & Sign In'}
                </button>

                <button
                  type="button"
                  onClick={() => setOtpSent(false)}
                  style={{ background: 'none', border: 'none', color: '#009a84', fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Change phone number
                </button>
              </form>
            )}
          </div>
        )}

        <div style={{ marginTop: '2rem', textAlign: 'center', borderTop: '1px solid #eee', paddingTop: '1.2rem', fontSize: '0.9rem', color: '#666' }}>
          Don’t have an account yet?{' '}
          <Link href={`/register?return=${encodeURIComponent(returnUrl)}`} style={{ color: '#009a84', fontWeight: 600 }}>
            Create one here
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ padding: '6rem 0', textAlign: 'center' }}>Loading…</div>}>
      <LoginContent />
    </Suspense>
  );
}
