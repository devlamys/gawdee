'use client';

import Link from 'next/link';
import React, { useMemo, useRef, useState } from 'react';
import { resolveImageUrl } from '@/lib/utils';

export interface ReelPreviewCardProps {
  reel: {
    id: number;
    title?: string;
    subtitle?: string;
    file_path?: string;
    poster_path?: string;
    external_url?: string;
    link_url?: string;
    alt_text?: string;
    product_slug?: string;
  };
}

export default function ReelsPreviewCard({ reel }: ReelPreviewCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const href = reel.external_url || reel.link_url || (reel.product_slug ? `/products/${reel.product_slug}` : '#');
  const isExternalLink = Boolean(reel.external_url || reel.link_url);

  const previewVideoUrl = useMemo(() => {
    const filePath = reel.file_path || '';
    return filePath ? resolveImageUrl(filePath) : '';
  }, [reel.file_path]);

  const posterUrl = useMemo(() => {
    return resolveImageUrl(reel.poster_path || reel.file_path || '');
  }, [reel.poster_path, reel.file_path]);

  const startPreview = async () => {
    const video = videoRef.current;
    if (!video || !previewVideoUrl) return;
    if (typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches) return;
    video.muted = true;
    video.currentTime = 0;
    try {
      await video.play();
    } catch {
      // Ignore browser autoplay restrictions.
    }
  };

  const stopPreview = () => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
  };

  const card = (
    <>
      <div
        style={{ position: 'relative', background: '#000', overflow: 'hidden' }}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => {
          setIsHovering(false);
          stopPreview();
        }}
        onFocus={() => setIsHovering(true)}
        onBlur={() => {
          setIsHovering(false);
          stopPreview();
        }}
      >
        {previewVideoUrl ? (
          <video
            ref={videoRef}
            src={previewVideoUrl}
            poster={posterUrl}
            muted
            playsInline
            loop
            preload="metadata"
            style={{
              display: 'block',
              width: '100%',
              height: '320px',
              objectFit: 'cover',
              background: '#000',
              opacity: isHovering ? 1 : 0,
              transition: 'opacity 0.2s ease',
            }}
            onLoadedData={() => {
              if (typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches) {
                stopPreview();
                return;
              }
              if (isHovering) {
                startPreview();
              }
            }}
            onTimeUpdate={() => {
              const video = videoRef.current;
              if (!video) return;
              if (video.currentTime >= 5) {
                video.currentTime = 0;
                video.play().catch(() => undefined);
              }
            }}
          />
        ) : null}

        <img
          src={posterUrl || '/assets/images/logo.png'}
          alt={reel.alt_text || reel.title || 'Gawdee reel'}
          loading="lazy"
          style={{
            width: '100%',
            height: '320px',
            objectFit: 'cover',
            display: 'block',
            opacity: isHovering && previewVideoUrl ? 0 : 1,
            transition: 'opacity 0.2s ease',
            position: previewVideoUrl ? 'absolute' : 'static',
            inset: previewVideoUrl ? 0 : 'auto',
          }}
        />

        <div
          style={{
            position: 'absolute',
            inset: 'auto 12px 12px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(0,0,0,0.58)',
              color: '#fff',
              borderRadius: '999px',
              padding: '6px 10px',
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            <i className="ph ph-play-circle" /> Reel
          </span>
          {isExternalLink && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(0,0,0,0.52)',
                color: '#fff',
                borderRadius: '999px',
                padding: '6px 10px',
                fontSize: '0.7rem',
                fontWeight: 700,
              }}
            >
              Watch full video <i className="ph ph-arrow-up-right" />
            </span>
          )}
        </div>
      </div>

      <div style={{ padding: '1.2rem' }}>
        {reel.title && <h2 style={{ fontSize: '1.1rem', margin: '0 0 0.3rem', color: '#111' }}>{reel.title}</h2>}
        {reel.subtitle && <p style={{ fontSize: '0.9rem', color: '#666', margin: 0 }}>{reel.subtitle}</p>}
      </div>
    </>
  );

  const inner = isExternalLink ? (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
      {card}
    </a>
  ) : (
    <Link href={href} style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
      {card}
    </Link>
  );

  return (
    <article
      style={{
        background: '#fff',
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1px solid #eee',
        boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
      }}
      onMouseEnter={() => {
        if (typeof window !== 'undefined' && !window.matchMedia('(hover: none)').matches) {
          setIsHovering(true);
          startPreview();
        }
      }}
      onMouseLeave={() => {
        setIsHovering(false);
        stopPreview();
      }}
    >
      {inner}
    </article>
  );
}
