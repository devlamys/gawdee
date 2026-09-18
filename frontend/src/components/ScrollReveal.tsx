'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export const ScrollReveal: React.FC = () => {
  const pathname = usePathname();

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const elements = document.querySelectorAll('.reveal:not(.is-visible)');

    if (elements.length === 0) return;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      elements.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            if (target.dataset.delay && target.dataset.delay !== '0') {
              target.style.setProperty('--delay', `${target.dataset.delay}ms`);
            }
            target.classList.add('is-visible');
            observer.unobserve(target);
          }
        });
      },
      { rootMargin: '0px 0px -3% 0px', threshold: 0.04 }
    );

    elements.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
    };
  }, [pathname]);

  return null;
};
