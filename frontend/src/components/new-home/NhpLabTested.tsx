'use client';

import { useState } from 'react';

interface Metric {
  value: string;
  title: string;
  text: string;
  foot: string;
}

const METRICS: Metric[] = [
  {
    value: '99.91%',
    title: 'Milk Fat',
    text: 'Measured milk fat is 99.91%, exceeding the FSSAI minimum of 99.5%.',
    foot: 'Above FSSAI Minimum',
  },
  {
    value: 'neg',
    title: 'Baudouin Test',
    text: 'Negative result in the Baudouin test, a key adulteration screening parameter.',
    foot: 'Adulteration Test Passed',
  },
  {
    value: 'B.L.Q.',
    title: 'Heavy Metals & Residues',
    text: "Tested pesticide parameters were below the laboratory's limit of quantification.",
    foot: 'Safety Parameters Tested',
  },
  {
    value: '0.59%',
    title: 'Free Fatty Acids',
    text: 'FFA measured at 0.59%, well within the stated FSSAI limit of 2.0%.',
    foot: 'Within FSSAI Limit',
  },
];

/**
 * Phase 7 — Lab tested metrics + batch verify bar.
 * Static metrics; the verify form validates inline only (no new backend
 * in this phase — no /lab-reports route exists yet).
 */
export function NhpLabTested() {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'error' | 'ok'>('idle');

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    // Batch codes look like "GW-892114" — require at least 6 alphanumerics.
    const compact = trimmed.replace(/[^a-z0-9]/gi, '');
    setStatus(compact.length >= 6 ? 'ok' : 'error');
  };

  return (
    <section className="nhp-lab" aria-label="Lab tested quality and purity">
      <div className="nhp-lab__inner">
        <p className="nhp-lab__pill">Lab Tested for Quality &amp; Purity</p>
        <h2 className="nhp-lab__title">Only What Meets Our Standard Makes The Cut.</h2>
        <p className="nhp-lab__sub">Our Ghee is tested against key quality, adulteration and safety parameters.</p>

        <div className="nhp-lab__grid">
          {METRICS.map((metric) => (
            <article key={metric.title} className="nhp-lab__card">
              <p className="nhp-lab__value">{metric.value}</p>
              <h3 className="nhp-lab__card-title">{metric.title}</h3>
              <p className="nhp-lab__card-text">{metric.text}</p>
              <p className="nhp-lab__foot">
                <i className="ph-bold ph-check-circle" aria-hidden="true"></i>
                {metric.foot}
              </p>
            </article>
          ))}
        </div>

        <form className="nhp-lab__verify" onSubmit={handleVerify}>
          <div className="nhp-lab__verify-copy">
            <strong>Have a GAWDEE bottle? Verify its lab report</strong>
            <small>Enter your 6-digit batch code found stamped on the label.</small>
          </div>
          <div className="nhp-lab__verify-row">
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setStatus('idle');
              }}
              placeholder="E.G. GW-892"
              aria-label="Batch code"
              maxLength={20}
            />
            <button type="submit">Verify</button>
          </div>
          {status === 'error' && (
            <p className="nhp-lab__msg nhp-lab__msg--error" role="alert">
              Please enter a valid batch code (at least 6 letters or digits).
            </p>
          )}
          {status === 'ok' && (
            <p className="nhp-lab__msg nhp-lab__msg--ok" role="status">
              Batch code accepted — online report lookup launches soon. Keep your code handy.
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
