'use client';

import React from 'react';

interface RailButtonProps {
  targetId: string;
  direction: 1 | -1;
  ariaLabel: string;
  icon: string;
}

export const RailButton: React.FC<RailButtonProps> = ({ targetId, direction, ariaLabel, icon }) => {
  const handleClick = () => {
    const rail = document.getElementById(targetId.replace(/^#/, ''));
    if (!rail) return;
    rail.scrollBy({
      left: direction * Math.min(rail.clientWidth * 0.86, 460),
      behavior: 'smooth',
    });
  };

  return (
    <button type="button" onClick={handleClick} aria-label={ariaLabel}>
      <i className={`ph ${icon}`}></i>
    </button>
  );
};
