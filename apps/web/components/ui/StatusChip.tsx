import React from 'react';
import { cn } from '@/lib/utils';

export type StatusChipStatus = 'approved' | 'needs_review' | 'in_review' | 'rejected' | 'neutral';

const STATUS_STYLES: Record<StatusChipStatus, string> = {
  approved: 'bg-success/10 text-success',
  needs_review: 'bg-warning/10 text-warning',
  in_review: 'bg-bg-tertiary text-text-secondary',
  rejected: 'bg-destructive-hoverbg text-destructive-text',
  neutral: 'bg-bg-tertiary text-text-secondary',
};

interface StatusChipProps {
  status: StatusChipStatus;
  children: React.ReactNode;
  className?: string;
}

export const StatusChip: React.FC<StatusChipProps> = ({ status, children, className }) => (
  <div className={cn('flex items-center gap-1 px-2 py-1 rounded-full text-xs', STATUS_STYLES[status], className)}>
    {children}
  </div>
);
