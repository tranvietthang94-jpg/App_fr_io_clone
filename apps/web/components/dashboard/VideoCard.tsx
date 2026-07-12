import React from 'react';
import { Card } from '@/components/ui/Card';
import { Film, Clock, CheckCircle, AlertCircle } from 'lucide-react';

interface Video {
  id: string;
  title: string;
  duration: number;
  status: 'processing' | 'ready' | 'error';
  createdAt: string;
  thumbnailUrl?: string;
}

interface VideoCardProps {
  video: Video;
  onClick?: () => void;
}

export const VideoCard: React.FC<VideoCardProps> = ({ video, onClick }) => {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = () => {
    switch (video.status) {
      case 'processing':
        return (
          <div className="flex items-center gap-1 px-2 py-1 bg-accent-yellow/10 text-accent-yellow rounded-full text-xs">
            <AlertCircle className="w-3 h-3" />
            <span>Processing</span>
          </div>
        );
      case 'ready':
        return (
          <div className="flex items-center gap-1 px-2 py-1 bg-accent-green/10 text-accent-green rounded-full text-xs">
            <CheckCircle className="w-3 h-3" />
            <span>Ready</span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center gap-1 px-2 py-1 bg-accent-red/10 text-accent-red rounded-full text-xs">
            <AlertCircle className="w-3 h-3" />
            <span>Error</span>
          </div>
        );
    }
  };

  return (
    <Card hover onClick={onClick} className="group overflow-hidden">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-bg-tertiary overflow-hidden">
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="w-12 h-12 text-text-muted" />
          </div>
        )}

        {/* Duration Badge */}
        <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/80 text-white text-xs rounded">
          {formatDuration(video.duration)}
        </div>

        {/* Status Badge */}
        <div className="absolute top-2 left-2">
          {getStatusBadge()}
        </div>
      </div>

      {/* Video Info */}
      <div className="p-3">
        <h3 className="font-medium text-text-primary truncate group-hover:text-accent-blue transition-colors">
          {video.title}
        </h3>
        <div className="flex items-center gap-1 mt-1 text-xs text-text-muted">
          <Clock className="w-3 h-3" />
          <span>{formatDate(video.createdAt)}</span>
        </div>
      </div>
    </Card>
  );
};