'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

interface ProgressRingProps {
  /** 0 to 1 */
  progress: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  children?: React.ReactNode;
}

/**
 * The circular "4 / 6 Daily Goals Completed" ring used on the client
 * Today screen. Plain, quiet, one accent color — no gamified badges.
 */
export function ProgressRing({
  progress,
  size = 96,
  strokeWidth = 8,
  className,
  children,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(Math.max(progress, 0), 1));

  const gradientId = useId();

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.65" />
            <stop offset="100%" stopColor="hsl(var(--accent))" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className="fill-none stroke-secondary"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke={`url(#${gradientId})`}
          className="fill-none transition-all duration-700 ease-out drop-shadow-[0_0_6px_hsl(var(--accent)/0.35)]"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}
