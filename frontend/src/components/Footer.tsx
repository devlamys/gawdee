'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { StorefrontSettings } from '@/types';
import { resolveImageUrl } from '@/lib/utils';
import { api } from '@/lib/api';
import { env } from '@/config/env';

interface FooterProps {
  settings?: StorefrontSettings;
}

export const Footer: React.FC<FooterProps> = ({ settings }) => {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  const brandName = settings?.brand_name || env.defaults.brandName;
  const brandLogo = resolveImageUrl(settings?.brand_logo, env.defaults.brandLogo);
  const storeEmail = settings?.store_email || env.defaults.storeEmail;

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await api.subscribe(email.trim());
      if (res.ok) {
        setSubscribed(true);
        setEmail('');
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  return (
    <footer className="commerce-footer" id="site-footer">
      <div className="commerce-footer__watermark" aria-hidden="true"></div>
      <div className="container commerce-footer__grid">
        <div className="commerce-footer__brand">
          <Link href="/" aria-label={`${brandName} home`}>
            <img src={brandLogo} alt={`${brandName} — The Soul of Wellness`} />
          </Link>
          <p>
            Bringing natural goodness to your daily life. Pure. Authentic. Organic food Thoughtfully crafted in India.
          </p>
          <div className="commerce-socials">
            <a
              href="https://www.instagram.com/gawdee_organic/"
              target="_blank"
              rel="noopener"
              aria-label="Instagram"
            >
              <i className="ph ph-instagram-logo"></i>
            </a>
            <a
              href="https://www.facebook.com/GawdeeOrganic/"
              target="_blank"
              rel="noopener"
              aria-label="Facebook"
            >
              <i className="ph ph-facebook-logo"></i>
            </a>
            <a
              href="https://www.youtube.com/@GawdeeOrganic"
              target="_blank"
              rel="noopener"
              aria-label="YouTube"
            >
              <i className="ph ph-youtube-logo"></i>
            </a>
          </div>
        </div>

        <div className="commerce-footer__links">
          <h2>Quick Links</h2>
          <Link href="/products">Our Products</Link>
          <Link href="/#offers">Special Offers</Link>
          <Link href="/blog">Wellness Journal</Link>
          <a href={`mailto:${storeEmail}`}>Contact Us</a>
        </div>

        <div className="commerce-footer__links">
          <h2>Customer Service</h2>
          <a href="https://gawdee.com" target="_blank" rel="noopener">
            Shipping Policy
          </a>
          <a href="https://gawdee.com" target="_blank" rel="noopener">
            Return Policy
          </a>
          <a href="https://gawdee.com" target="_blank" rel="noopener">
            Terms &amp; Conditions
          </a>
          <a href="https://gawdee.com" target="_blank" rel="noopener">
            Privacy Policy
          </a>
          <a href="https://gawdee.com" target="_blank" rel="noopener">
            FAQs
          </a>
        </div>

        <div className="commerce-footer__links">
          <h2>Categories</h2>
          <Link href="/products?category=ghee">Ghee</Link>
          <Link href="/products?category=honey">Honey</Link>
          <Link href="/products?category=wellness">Drops</Link>
          <Link href="/products?category=nutrition">Mix Me</Link>
          <Link href="/products?category=sugar">Sugar</Link>
        </div>

        <div className="commerce-footer__signup">
          <h2>Stay Updated</h2>
          <p>Subscribe for wellness tips, seasonal harvests, and exclusive offers.</p>
          <form className="footer-mini-form" onSubmit={handleSubscribe}>
            <label className="sr-only" htmlFor="footer-email">
              Email address
            </label>
            <input
              id="footer-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
            <button type="submit" aria-label="Subscribe" disabled={loading}>
              <i className={`ph ${subscribed ? 'ph-check' : 'ph-paper-plane-tilt'}`}></i>
            </button>
          </form>
        </div>
      </div>

      <div className="container commerce-footer__bottom">
        <p>© {new Date().getFullYear()} Gawdee. All rights reserved. Thoughtfully crafted in India.</p>
        <div className="payment-pills">
          <span>VISA</span>
          <span>Mastercard</span>
          <span>UPI</span>
          <span>Paytm</span>
        </div>
        <p>
          <i className="ph ph-shield-check"></i> 100% Secure Payments
        </p>
      </div>
    </footer>
  );
};
