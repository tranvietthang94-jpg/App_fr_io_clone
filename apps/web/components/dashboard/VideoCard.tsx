import React from 'react';
import { Card } from '@/components/ui/Card';
import { Film, Trash2, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { formatFileSize, formatRelativeTime } from '@/lib/utils';
import type { Video } from '@fr-clone/shared';

interface VideoCardProps {
  video: Video;
  onClick?: () => void;
  onDelete?: () => void;
}

export const VideoCard: React.FC<VideoCardProps> = ({ video, onClick, onDelete }) => {
  const getStatusBadge = () => {
    switch (video.status) {
      case 'processing':
      case 'uploading':
        return (
          <div className="flex items-center gap-1 px-2 py-1 bg-accent-yellow/10 text-accent-yellow rounded-full text-xs">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Đang xử lý</span>
          </div>
        );
      case 'ready':
        return (
          <div className="flex items-center gap-1 px-2 py-1 bg-accent-green/10 text-accent-green rounded-full text-xs">
            <CheckCircle className="w-3 h-3" />
            <span>Sẵn sàng</span>
          </div>
        );
      case 'failed':
        return (
          <div className="flex items-center gap-1 px-2 py-1 bg-accent-red/10 text-accent-red rounded-full text-xs">
            <AlertCircle className="w-3 h-3" />
            <span>Lỗi</span>
          </div>
        );
    }
  };

  return (
    <Card hover onClick={onClick} className="group overflow-hidden">
      <div className="relative aspect-video bg-bg-tertiary overflow-hidden flex items-center justify-center">
        {video.status === 'processing' || video.status === 'uploading' ? (
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-text-muted">Đang xử lý...</p>
          </div>
        ) : (
          <Film className="w-12 h-12 text-text-muted" />
        )}
        <div className="absolute top-2 left-2">{getStatusBadge()}</div>
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 bg-black/60 hover:bg-black/80 rounded transition-all"
          >
            <Trash2 className="w-4 h-4 text-white" />
          </button>
        )}
      </div>

      <div className="p-4">
        <h3 className="font-semibold text-text-primary truncate group-hover:text-accent-blue transition-colors">
          {video.title}
        </h3>
        <div className="flex items-center gap-3 mt-1 text-sm text-text-muted">
          <span>{formatFileSize(video.fileSize)}</span>
          <span>•</span>
          <span>{formatRelativeTime(video.createdAt)}</span>
        </div>
      </div>
    </Card>
  );
};
