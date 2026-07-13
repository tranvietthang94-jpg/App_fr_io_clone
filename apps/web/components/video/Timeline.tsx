import React, { useRef, useState } from 'react';
import { cn, formatTimecode } from '@/lib/utils';
import type { Comment } from '@fr-clone/shared';

interface TimelineProps {
  duration: number;
  currentTime: number;
  comments: Comment[];
  fps?: number;
  onSeek: (time: number) => void;
  className?: string;
}

export const Timeline: React.FC<TimelineProps> = ({
  duration,
  currentTime,
  comments,
  fps = 30,
  onSeek,
  className,
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || duration === 0) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const time = percentage * duration;
    onSeek(Math.max(0, Math.min(time, duration)));
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    handleTimelineClick(e);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      handleTimelineClick(e);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={cn('bg-bg-secondary border-t border-border px-4 py-3', className)}>
      {/* Timeline Bar */}
      <div
        ref={timelineRef}
        className="relative h-8 cursor-pointer group"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Background Track */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 bg-bg-tertiary rounded-full overflow-hidden">
          {/* Progress Fill */}
          <div
            className="h-full bg-accent-blue transition-all duration-75"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>

        {/* Comment Markers */}
        {comments.map((comment) => {
          const position = duration > 0 ? (comment.timestamp / duration) * 100 : 0;
          return (
            <div
              key={comment.id}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
              style={{ left: `${position}%` }}
            >
              <div
                className="w-3 h-3 bg-accent-yellow rounded-full border-2 border-bg-secondary hover:scale-125 transition-transform cursor-pointer"
                title={`${comment.user?.name || 'User'}: ${comment.content}`}
              />
            </div>
          );
        })}

        {/* Current Time Indicator */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 pointer-events-none"
          style={{ left: `${progressPercentage}%` }}
        >
          <div className="w-4 h-4 bg-white rounded-full border-2 border-accent-blue shadow-lg" />
        </div>

        {/* Hover Effect */}
        <div className="absolute inset-0 bg-accent-blue/0 group-hover:bg-accent-blue/5 rounded-full transition-colors" />
      </div>

      {/* Time Display */}
      <div className="flex justify-between items-center mt-2 text-xs font-mono text-text-secondary">
        <span>{formatTimecode(currentTime, fps)}</span>
        <span>{formatTimecode(duration, fps)}</span>
      </div>
    </div>
  );
};