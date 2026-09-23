'use client';

import React, { useState, useEffect } from 'react';

interface OfferPopupProps {
  code?: string;
  title?: string;
  text?: string;
  image?: string;
  link?: string;
  btnText?: string;
  delayMs?: number;
}

export const OfferPopup: React.FC<OfferPopupProps> = ({
  code = '',
  title = 'Special Offer',
  text = 'Use code %code% at checkout',
  image = '/assets/images/independence-offer-popup-v1.webp',
  link = '#shop',
  btnText = 'Shop offer',
  delayMs = 1200,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!code) return;
    const dismissed = sessionStorage.getItem('gx_offer_dismissed');
    if (dismissed) return;

    const timer = setTimeout(() => {
      setIsOpen(true);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [delayMs, code]);

  const handleClose = () => {
    setIsOpen(false);
    sessionStorage.setItem('gx_offer_dismissed', '1');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!code || !isOpen) return null;

  const descriptionParts = text.split('%code%');

  return (
    <div className="offer-popup is-visible" role="dialog" aria-modal="true" aria-labelledby="independence-offer-title">
      <section className="offer-popup__dialog">
        <div className="offer-popup__flag" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <button
          className="offer-popup__close"
          type="button"
          onClick={handleClose}
          aria-label="Close offer popup"
        >
          <i className="ph ph-x"></i>
        </button>
        <a className="offer-popup__art" href={link} onClick={handleClose}>
          <img
            src={image}
            alt={`${title}. Flat 10 percent off with code ${code}.`}
          />
        </a>
        <div className="offer-popup__actions">
          <div className="offer-popup__copy">
            <span id="independence-offer-title">{title}</span>
            <p id="independence-offer-description">
              {descriptionParts[0]}
              <strong>{code}</strong>
              {descriptionParts[1]}
            </p>
          </div>
          {code && (
            <button
              type="button"
              className="offer-popup__code"
              onClick={handleCopy}
              aria-label={`Copy offer code ${code}`}
            >
              <strong>{code}</strong>
              <span>
                <i className={`ph ${copied ? 'ph-check' : 'ph-copy'}`}></i>{' '}
                {copied ? 'Copied!' : 'Copy code'}
              </span>
            </button>
          )}
          <a className="offer-popup__shop" href={link} onClick={handleClose}>
            {btnText} <i className="ph ph-arrow-right"></i>
          </a>
        </div>
      </section>
    </div>
  );
};
