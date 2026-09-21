'use client';

import { useEffect, useRef, useState } from 'react';

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  rotation: number;
  spin: number;
  sway: number;
  swaySpeed: number;
  age: number;
  lifetime: number;
  color: string;
  shape: 'ribbon' | 'circle' | 'diamond';
};

const COLORS = ['#006F62', '#009A84', '#55C6AF', '#C39443', '#E2BC6B', '#F4DEAD', '#FFF8E8'];

export function OrderCelebration() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const frame = window.requestAnimationFrame(() => setFinished(true));
      return () => window.cancelAnimationFrame(frame);
    }

    let width = window.innerWidth;
    let height = window.innerHeight;
    let frame = 0;
    let lastTime = 0;
    let elapsed = 0;
    let secondWave = false;
    const pieces: Piece[] = [];

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
    };

    const burst = (side: -1 | 1, count: number) => {
      const x = side === 1 ? width * 0.07 : width * 0.93;
      const y = Math.min(height * 0.74, height - 70);
      for (let index = 0; index < count; index += 1) {
        const size = 4 + Math.random() * 6;
        pieces.push({
          x,
          y,
          vx: side * (Math.max(165, width * 0.17) + Math.random() * Math.max(150, width * 0.22)),
          vy: -(Math.max(390, height * 0.55) + Math.random() * Math.max(220, height * 0.3)),
          width: size,
          height: size * (1.3 + Math.random()),
          rotation: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 12,
          sway: Math.random() * Math.PI * 2,
          swaySpeed: 3 + Math.random() * 5,
          age: 0,
          lifetime: 2.8 + Math.random() * 1.3,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          shape: index % 9 === 0 ? 'diamond' : index % 7 === 0 ? 'circle' : 'ribbon',
        });
      }
    };

    const draw = (time: number) => {
      const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
      lastTime = time;
      elapsed += dt;
      context.clearRect(0, 0, width, height);

      if (!secondWave && elapsed >= 0.34) {
        const count = width < 600 ? 27 : 45;
        burst(1, count);
        burst(-1, count);
        secondWave = true;
      }

      for (let index = pieces.length - 1; index >= 0; index -= 1) {
        const piece = pieces[index];
        piece.age += dt;
        piece.x += (piece.vx + Math.sin(piece.sway) * 24) * dt;
        piece.y += piece.vy * dt;
        piece.vy += 860 * dt;
        piece.vx *= Math.pow(0.985, dt * 60);
        piece.rotation += piece.spin * dt;
        piece.sway += piece.swaySpeed * dt;

        if (piece.age >= piece.lifetime || piece.y > height + 50) {
          pieces.splice(index, 1);
          continue;
        }

        context.save();
        context.globalAlpha = Math.min(1, (piece.lifetime - piece.age) / 0.6);
        context.translate(piece.x, piece.y);
        context.rotate(piece.rotation);
        context.fillStyle = piece.color;
        if (piece.shape === 'circle') {
          context.beginPath();
          context.arc(0, 0, piece.width * 0.55, 0, Math.PI * 2);
          context.fill();
        } else if (piece.shape === 'diamond') {
          context.beginPath();
          context.moveTo(0, -piece.height / 2);
          context.lineTo(piece.width / 2, 0);
          context.lineTo(0, piece.height / 2);
          context.lineTo(-piece.width / 2, 0);
          context.closePath();
          context.fill();
        } else {
          context.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
        }
        context.restore();
      }

      if (pieces.length > 0 || !secondWave) {
        frame = window.requestAnimationFrame(draw);
      } else {
        setFinished(true);
      }
    };

    resize();
    const firstWave = width < 600 ? 48 : 78;
    burst(1, firstWave);
    burst(-1, firstWave);
    window.addEventListener('resize', resize);
    frame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  if (finished) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10005 }}
    />
  );
}
