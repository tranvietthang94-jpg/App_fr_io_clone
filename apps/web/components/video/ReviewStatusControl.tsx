import React from 'react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/DropdownMenu';
import { CheckCircle, AlertCircle, XCircle, Circle, ChevronDown } from 'lucide-react';
import { VideoReviewStatus } from '@r-frame/shared';

const STATUS_META: Record<VideoReviewStatus, { label: string; icon: React.ReactNode; className: string }> = {
  [VideoReviewStatus.IN_REVIEW]: {
    label: 'Đang xem xét',
    icon: <Circle className="w-3.5 h-3.5" />,
    className: 'bg-bg-tertiary text-text-secondary',
  },
  [VideoReviewStatus.APPROVED]: {
    label: 'Đã duyệt',
    icon: <CheckCircle className="w-3.5 h-3.5" />,
    className: 'bg-accent-green/10 text-accent-green',
  },
  [VideoReviewStatus.NEEDS_REVIEW]: {
    label: 'Cần xem lại',
    icon: <AlertCircle className="w-3.5 h-3.5" />,
    className: 'bg-accent-yellow/10 text-accent-yellow',
  },
  [VideoReviewStatus.REJECTED]: {
    label: 'Từ chối',
    icon: <XCircle className="w-3.5 h-3.5" />,
    className: 'bg-accent-red/10 text-accent-red',
  },
};

interface ReviewStatusControlProps {
  status: VideoReviewStatus;
  readOnly?: boolean;
  onChange?: (status: VideoReviewStatus) => void;
}

export const ReviewStatusControl: React.FC<ReviewStatusControlProps> = ({ status, readOnly, onChange }) => {
  const meta = STATUS_META[status] ?? STATUS_META[VideoReviewStatus.IN_REVIEW];

  if (readOnly || !onChange) {
    return (
      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${meta.className}`}>
        {meta.icon}
        <span>{meta.label}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-accent-green ${meta.className}`}
        >
          {meta.icon}
          <span>{meta.label}</span>
          <ChevronDown className="w-3 h-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(Object.keys(STATUS_META) as VideoReviewStatus[]).map((key) => (
          <DropdownMenuItem key={key} onSelect={() => onChange(key)}>
            {STATUS_META[key].icon} {STATUS_META[key].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
