'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminApi, AdminApiError } from '@/lib/admin-api';
import { useAdminAuth } from '@/context/AdminAuthContext';
import '@/styles/admin.css';

/**
 * One-time first-administrator registration.
 * The backend refuses once any admin exists; this page redirects
 * to /admin/login in that case (checked on mount and after submit).
 */
export default function AdminRegisterPage() {
  const router = useRouter();
  const { setup } = useAdminAuth();

  const [checking, setChecking] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    adminApi
      .setupStatus()
      .then((res) => {
        if (res?.ok && !res.setup_required) {
          router.replace('/admin/login');
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('The password confirmation does not match.');
      return;
    }
    setLoading(true);
    try {
      await setup({
        name: name.trim(),
        email: email.trim(),
        password,
        password_confirmation: confirmPassword,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not create the administrator account.';
      // Only a closed setup (an admin exists) should send the user to login.
      // A customer email conflict is a validation error to display on this form.
      if (err instanceof AdminApiError && err.status === 403) {
        router.replace('/admin/login');
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="admin-auth" style={{ minHeight: '100vh' }}>
        <main className="auth-shell">
          <section className="auth-panel">
            <div className="auth-card">
              <p>Checking administrator setup…</p>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-auth" style={{ minHeight: '100vh' }}>
      <main className="auth-shell">
        <section className="auth-visual">
          <Link href="/" className="auth-brand">
            <img src="/assets/images/logo.png" alt="Gawdee" />
          </Link>
          <div className="auth-visual__copy">
            <span>
              <i className="ph ph-sparkle"></i> First-time setup
            </span>
            <h1>
              Create the
              <br />
              <em>first administrator.</em>
            </h1>
            <p>
              No administrator exists yet. Register the store owner account to unlock the
              commerce control centre. This page stops working once an admin exists.
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
            <span className="auth-kicker">Store setup</span>
            <h2>Register admin</h2>
            <p>Create the owner account to continue.</p>

            {error && (
              <div role="alert" className="admin-alert admin-alert--error" style={{ marginBottom: '1.2rem' }}>
                <i className="ph ph-warning-circle"></i> {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="admin-form auth-form">
              <label>
                <span>Full name</span>
                <div className="field-icon">
                  <i className="ph ph-user"></i>
                  <input
                    type="text"
                    name="name"
                    autoComplete="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Store Owner"
                  />
                </div>
              </label>

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
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters with a letter and a number"
                  />
                </div>
              </label>

              <label>
                <span>Confirm password</span>
                <div className="field-icon">
                  <i className="ph ph-lock-key"></i>
                  <input
                    type="password"
                    name="password_confirmation"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat the password"
                  />
                </div>
              </label>

              <button
                className="admin-button admin-button--primary admin-button--full"
                type="submit"
                disabled={loading}
              >
                {loading ? 'Creating account...' : 'Create administrator'}{' '}
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
