'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

export const AiChatDrawer: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'assistant' | 'user'; text: string }>>([
    { role: 'assistant', text: 'Namaste! How can I assist your wellness choices today?' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [offerCode, setOfferCode] = useState('');
  const [offerPercent, setOfferPercent] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getStorefront()
      .then((res) => {
        if (res?.ok && res.settings?.offer_code) {
          setOfferCode(res.settings.offer_code);
          setOfferPercent(res.settings.offer_percent || '');
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, isOpen]);

  const sendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;
    const userMsg = textToSend.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    try {
      const res = await api.aiChat(userMsg);
      if (res.ok && res.reply) {
        setMessages((prev) => [...prev, { role: 'assistant', text: res.reply }]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: 'Thank you for asking! Our wellness team is available to assist you with any specific queries.',
          },
        ]);
      }
    } catch (err: any) {
      const errMsg = err?.message || 'The assistant is unavailable right now.';
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: errMsg },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleCopyOffer = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const suggestions = [
    { label: 'Family pantry', query: 'Which Gawdee products are best for an everyday family pantry?', icon: 'ph-house-line' },
    { label: 'A2 Ghee', query: 'Tell me about Gawdee A2 Gir Cow Ghee.', icon: 'ph-bowl-steam' },
    { label: 'Delivery', query: 'How does delivery and shipping work?', icon: 'ph-truck' },
  ];

  return (
    <>
      {/* Floating launcher button */}
      <button
        className={`ai-float ${isOpen ? 'is-active' : ''}`}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Open Gawdee AI wellness assistant"
        aria-expanded={isOpen}
      >
        <span className="ai-float__orb">
          <img src="/assets/images/gawdee-ai-cow.jpg" alt="" aria-hidden="true" />
        </span>
      </button>

      {/* Slide-in Assistant panel */}
      <aside
        className={`ai-chat ${isOpen ? 'is-open' : ''}`}
        data-ai-chat
        aria-hidden={!isOpen}
        aria-labelledby="ai-chat-title"
      >
        <header>
          <span className="ai-chat__mark">
            <img src="/assets/images/gawdee-ai-cow.jpg" alt="" aria-hidden="true" />
          </span>
          <div>
            <strong id="ai-chat-title">Ask Gawdee AI</strong>
            <small>
              <span></span> Online · AI powered
            </small>
          </div>
          <button type="button" onClick={() => setIsOpen(false)} aria-label="Close assistant">
            <i className="ph ph-x"></i>
          </button>
        </header>



        {/* Message history */}
        <div className="ai-chat__messages" data-ai-messages>
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`ai-message ${msg.role === 'assistant' ? 'ai-message--assistant' : 'ai-message--user'}`}
            >
              {msg.text}
            </div>
          ))}
          {loading && (
            <div className="ai-message ai-message--assistant">
              <i className="ph ph-spinner ph-spin"></i> Thinking with care…
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick query suggestion chips */}
        <div className="ai-chat__suggestions">
          {suggestions.map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                sendMessage(s.query);
              }}
            >
              <i className={`ph ${s.icon}`}></i> {s.label}
            </button>
          ))}
        </div>

        {/* Prompt input form */}
        <form onSubmit={handleSubmit} data-ai-form>
          <label className="sr-only" htmlFor="ai-question">
            Ask Gawdee AI
          </label>
          <input
            id="ai-question"
            ref={inputRef}
            maxLength={700}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Gawdee anything…"
            autoComplete="off"
            required
          />
          <button type="submit" disabled={loading} aria-label="Send message">
            <i className="ph ph-arrow-up"></i>
          </button>
        </form>

        <p>
          <i className="ph ph-info"></i> AI guidance may vary. Always review product labels.
        </p>
      </aside>
    </>
  );
};
