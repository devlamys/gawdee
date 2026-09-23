'use client';

import React, { useState } from 'react';
import { api } from '@/lib/api';

export const NewsletterForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || status === 'loading') return;
    setStatus('loading');
    setMessage('');
    try {
      const res = await api.subscribe(email.trim());
      if (res.ok) {
        setStatus('success');
        setMessage(res.message || 'Thank you for subscribing!');
        setEmail('');
      } else {
        setStatus('error');
        setMessage('Subscription failed. Please try again.');
      }
    } catch (err: unknown) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Subscription failed. Please try again.');
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit} data-newsletter-form>
        <label className="sr-only" htmlFor="newsletter-email">
          Enter your email
        </label>
        <input
          id="newsletter-email"
          type="email"
          placeholder="Enter your email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" disabled={status === 'loading'}>
          {status === 'loading' ? 'Subscribing…' : 'Subscribe'} <i className="ph ph-arrow-right"></i>
        </button>
      </form>
      {status === 'success' && (
        <p role="status" style={{ color: '#009a84', marginTop: '0.6rem', fontSize: '0.9rem' }}>{message}</p>
      )}
      {status === 'error' && (
        <p role="alert" style={{ color: '#c62828', marginTop: '0.6rem', fontSize: '0.9rem' }}>{message}</p>
      )}
    </div>
  );
};
