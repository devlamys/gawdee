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

        <nav className="commerce-footer__nav" aria-label="Shop categories">
          <h2>Shop Categories</h2>
          <ul>
            <li><Link href="/products?category=ghee">Vedic A2 Gir Cow Ghee</Link></li>
            <li><Link href="/products?category=oils">Wood Pressed Oils</Link></li>
            <li><Link href="/products?category=honey">Raw Forest Honey</Link></li>
            <li><Link href="/products?category=jaggery">Organic Desi Khand & Jaggery</Link></li>
            <li><Link href="/products?category=combos">Healthy Pantry Combos</Link></li>
            <li><Link href="/products?category=flours">Stone Ground Flours</Link></li>
          </ul>
        </nav>

        <nav className="commerce-footer__nav" aria-label="Policies and purity">
          <h2>Policies & Purity</h2>
          <ul>
            <li><Link href="/lab-reports">Lab Reports & Transparency</Link></li>
            <li><Link href="/shipping-policy">Shipping & Transit Policy</Link></li>
            <li><Link href="/return-policy">Return & Refund Guarantee</Link></li>
            <li><Link href="/terms">Terms of Service</Link></li>
            <li><Link href="/privacy">Privacy Policy</Link></li>
            <li><Link href="/fssai-compliance">FSSAI Compliance</Link></li>
          </ul>
        </nav>

        <div className="commerce-footer__help" aria-label="Need help">
          <h2>Need Help?</h2>
          <p className="footer-help__hours">
            Our wellness caretakers are available Monday &ndash; Saturday, 9 AM &ndash; 7 PM IST.
          </p>
          <address>
            <a href="tel:+9118004197890" className="footer-help__phone">1800-419-7890</a>
            <a href={`mailto:${storeEmail}`} className="footer-help__email">{storeEmail}</a>
            <div className="footer-help__addresses">
              <p>
                <strong>Corporate Office:</strong> Sector 32, Gurugram, Haryana &ndash; 122001
              </p>
              <p>
                <strong>Processing Center:</strong> Junagadh Agro Hub, Gujarat &ndash; 362001
              </p>
              <p>
                <strong>CIN:</strong> U15400HR2023PTC109823
              </p>
            </div>
          </address>
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
        <p>&copy; {new Date().getFullYear()} GAWDEE Farm & Natural Technologies Pvt. Ltd. All rights reserved.</p>
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