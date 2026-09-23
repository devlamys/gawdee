'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { adminApi } from '@/lib/admin-api';
import '@/styles/admin.css';

export default function AdminLoginPage() {
  const router = useRouter();
  const { login } = useAdminAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // No admin exists yet → first-run setup instead of login.
  useEffect(() => {
    adminApi
      .setupStatus()
      .then((res) => {
        if (res?.ok && res.setup_required) {
          router.replace('/admin/register');
        }
      })
      .catch(() => {});
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Invalid admin email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-auth" style={{ minHeight: '100vh' }}>
      <main className="auth-shell">
        <section className="auth-visual">
          <Link href="/" className="auth-brand">
            <img src="/assets/images/logo.png" alt="Gawdee" />
          </Link>
          <div className="auth-visual__copy">
            <span>
              <i className="ph ph-sparkle"></i> Commerce control centre
            </span>
            <h1>
              Good food.
              <br />
              <em>Beautifully managed.</em>
            </h1>
            <p>
              Manage the storefront, orders, payments, courier workflow and AI publishing from one
              calm workspace.
            </p>
          </div>
          <div className="auth-orbit auth-orbit--one"></div>
          <div className="auth-orbit auth-orbit--two"></div>
          <div className="auth-visual__stats">
            <strong>One dashboard</strong>
            <span>CMS · Commerce · AI</span>
          </div>
        </section>

        <section className="auth-panel">
          <div className="auth-card">
            <span className="auth-kicker">Welcome back</span>
            <h2>Sign in to Gawdee</h2>
            <p>Use your administrator account to continue.</p>

            {error && (
              <div className="admin-alert admin-alert--error" style={{ marginBottom: '1.2rem' }}>
                <i className="ph ph-warning-circle"></i> {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="admin-form auth-form">
              <label>
                <span>Email address</span>
                <div className="field-icon">
                  <i className="ph ph-envelope-simple"></i>
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@gawdee.com"
                  />
                </div>
              </label>

              <label>
                <span>Password</span>
                <div className="field-icon">
                  <i className="ph ph-lock-key"></i>
                  <input
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                  />
                </div>
              </label>

              <button
                className="admin-button admin-button--primary admin-button--full"
                type="submit"
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Sign in'}{' '}
                <i className="ph ph-arrow-right"></i>
              </button>
            </form>

            <Link className="auth-back" href="/">
              <i className="ph ph-arrow-left"></i> Back to storefront
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
