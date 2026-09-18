'use client';

import { useState } from 'react';

const FAQS = [
  {
    q: 'What makes GAWDEE Ghee different from regular store ghee?',
    a: 'GAWDEE Ghee is made from the milk of native Gir cows and slow-churned with the Vedic Bilona method in small batches. Regular store ghee is typically mass-produced by industrial cream separation, which strips away the aroma, texture and nutrition that Bilona preserves.',
  },
  {
    q: 'Is GAWDEE Honey 100% raw and unfiltered?',
    a: 'Yes. Our Raw Forest Honey and Raw Ajwain Honey are single-origin, unheated and unfiltered, so natural enzymes, pollen and thickness stay intact. Every batch is checked against adulteration parameters before packing.',
  },
  {
    q: 'What is Bilona Method?',
    a: 'Bilona is the ancient Vedic process of curd-churning: milk is boiled, set into curd, then churned slowly to separate butter, which is heated gently into ghee. It takes longer than factory methods but keeps the grainy texture, nutty aroma and fat-soluble nutrition.',
  },
  {
    q: 'What is Sulphur Free Sugar and why is it healthier?',
    a: 'Conventional white sugar is clarified with sulphur compounds that can leave residues. Our sulphur-free Desi Khand and Burra Sugar skip that step, so you get cleaner sweetness with natural minerals retained from sugarcane.',
  },
  {
    q: 'What are the ingredients in Mixme Powder?',
    a: 'Mixme blends roasted nuts, seeds, whole grains and natural cocoa or elaichi — with no refined sugar, preservatives or artificial colours. The full ingredient list with origins is stamped clearly on every pack.',
  },
  {
    q: 'How should I use Taral Drop and Moringa Powder?',
    a: 'Add a few Taral Drops to warm water or as directed for your routine, and stir one spoon of Moringa Powder into water, juice or smoothies each morning. Start small and stay consistent for best results.',
  },
  {
    q: 'What is the shelf life and storage recommendation?',
    a: 'Ghee stays fresh for 9–12 months, honey for 12–18 months, and dry powders for 6–9 months — check the pack for the exact date. Store in a cool, dry place away from sunlight, always with clean, dry spoons.',
  },
];

/**
 * Phase 10 — FAQ accordion. Static Q&A, single-open accordion with
 * aria-expanded. Server-safe Client component (useState only).
 */
export function NhpFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="nhp-faq" id="faq" aria-label="Frequently asked questions">
      <div className="nhp-faq__inner">
        <p className="nhp-faq__eyebrow">Got Questions?</p>
        <h2 className="nhp-faq__title">Frequently Asked Questions</h2>

        <div className="nhp-faq__list">
          {FAQS.map((faq, index) => {
            const open = openIndex === index;
            return (
              <div key={faq.q} className={`nhp-faq__item${open ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="nhp-faq__question"
                  aria-expanded={open}
                  aria-controls={`nhp-faq-panel-${index}`}
                  id={`nhp-faq-button-${index}`}
                  onClick={() => setOpenIndex(open ? null : index)}
                >
                  {faq.q}
                  <i className={`ph ${open ? 'ph-minus' : 'ph-plus'}`} aria-hidden="true"></i>
                </button>
                <div
                  className="nhp-faq__answer"
                  role="region"
                  id={`nhp-faq-panel-${index}`}
                  aria-labelledby={`nhp-faq-button-${index}`}
                  hidden={!open}
                >
                  <p>{faq.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
