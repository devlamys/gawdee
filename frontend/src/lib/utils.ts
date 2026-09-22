import { env } from '@/config/env';

export function money(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: env.currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function resolveImageUrl(path?: string, fallback = '/assets/images/logo.png'): string {
  if (!path) return fallback;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }
  if (path.startsWith('/')) {
    return path;
  }
  return `/${path}`;
}

export function parseEmbedVideo(url?: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.replace(/^\/+/, '');

    if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com') {
      const id = parsed.searchParams.get('v') || (/^(?:shorts|embed)\/([^/]+)/.exec(path)?.[1] ?? '');
      return id ? `https://www.youtube.com/embed/${id}` : '';
    }
    if (host === 'youtu.be') {
      return `https://www.youtube.com/embed/${path}`;
    }
    if (host === 'vimeo.com' || host === 'www.vimeo.com' || host === 'player.vimeo.com') {
      return `https://player.vimeo.com/video/${path.replace(/\D/g, '')}`;
    }
  } catch {
    // fallback
  }
  return '';
}
