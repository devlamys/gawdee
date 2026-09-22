'use client';

import React from 'react';

interface WhatsAppFloatProps {
  phone?: string;
}

export const WhatsAppFloat: React.FC<WhatsAppFloatProps> = ({ phone = '918891066980' }) => {
  const cleanNumber = phone.replace(/\D+/g, '') || '918891066980';

  return (
    <a
      className="whatsapp-float"
      href={`https://wa.me/${cleanNumber}?text=${encodeURIComponent("Hi Gawdee Team! 👋 I’m interested in Gawdee products and would like to know more. Please assist me.")}`}
      target="_blank"
      rel="noopener"
      aria-label="Chat with Gawdee on WhatsApp"
    >
      <img src="/assets/images/gawdee-ai-cow.jpg" alt="WhatsApp Support" />
    </a>
  );
};
