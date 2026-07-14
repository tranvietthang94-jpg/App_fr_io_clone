import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium', {
  variants: {
    variant: {
      blue: 'bg-accent-blue/10 text-accent-blue',
      green: 'bg-accent-green/10 text-accent-green',
      red: 'bg-accent-red/10 text-accent-red',
      yellow: 'bg-accent-yellow/10 text-accent-yellow',
      neutral: 'bg-bg-tertiary text-text-secondary',
    },
  },
  defaultVariants: {
    variant: 'neutral',
  },
});

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge: React.FC<BadgeProps> = ({ variant, className, children, ...props }) => {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {children}
    </span>
  );
};
