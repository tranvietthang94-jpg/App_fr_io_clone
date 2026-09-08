import React, { useMemo, useRef, useState } from 'react';
import { cn, formatTimecode } from '@/lib/utils';
import type { Comment } from '@r-frame/shared';

// Comments whose timeline position lands within this fraction of the total
// duration get grouped into one marker instead of overlapping dots.
const CLUSTER_THRESHOLD_PCT = 1.2;

interface MarkerCluster {
  position: number;
  comments: Comment[];
}

function clusterComments(comments: Comment[], duration: number): MarkerCluster[] {
  if (duration <= 0) return [];
  const sorted = [...comments].sort((a, b) => a.timestamp - b.timestamp);
  const clusters: MarkerCluster[] = [];

  for (const comment of sorted) {
    const position = (comment.timestamp / duration) * 100;
    const last = clusters[clusters.length - 1];
    if (last && position - last.position <= CLUSTER_THRESHOLD_PCT) {
      last.comments.push(comment);
      last.position = last.comments.reduce((sum, c) => sum + (c.timestamp / duration) * 100, 0) / last.comments.length;
    } else {
      clusters.push({ position, comments: [comment] });
    }
  }
  return clusters;
}

interface TimelineProps {
  duration: number;
  currentTime: number;
  comments: Comment[];
  fps?: number;
  onSeek: (time: number) => void;
  /** Fired once when a drag/click finishes — parent broadcasts to co-watchers here, not on every pixel. */
  onSeekCommit?: (time: number) => void;
  className?: string;
}

export const Timeline: React.FC<TimelineProps> = ({
  duration,
  currentTime,
  comments,
  fps = 30,
  onSeek,
  onSeekCommit,
  className,
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const pendingTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastEmittedRef = useRef<number | null>(null);

  const timeFromClientX = (clientX: number) => {
    if (!timelineRef.current || duration === 0) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = x / rect.width;
    return Math.max(0, Math.min(percentage * duration, duration));
  };

  const flushPending = () => {
    rafRef.current = null;
    const t = pendingTimeRef.current;
    if (t == null) return;
    if (lastEmittedRef.current === t) return;
    lastEmittedRef.current = t;
    onSeek(t);
  };

  const queueSeek = (clientX: number) => {
    pendingTimeRef.current = timeFromClientX(clientX);
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(flushPending);
    }
  };

  const commit = (time: number) => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingTimeRef.current = time;
    lastEmittedRef.current = time;
    (onSeekCommit ?? onSeek)(time);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    const t = timeFromClientX(e.clientX);
    pendingTimeRef.current = t;
    onSeek(t);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    queueSeek(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    commit(timeFromClientX(e.clientX));
  };

  const handleTrackKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    const step = 1 / fps;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      commit(Math.min(currentTime + step, duration));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      commit(Math.max(currentTime - step, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      commit(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      commit(duration);
    }
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
  const clusters = useMemo(() => clusterComments(comments, duration), [comments, duration]);

  return (
    <div className={cn('bg-bg-secondary border-t border-border px-4 py-3', className)}>
      {/* Timeline Bar */}
      <div
        ref={timelineRef}
        role="slider"
        tabIndex={0}
        aria-label="Vị trí video"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        aria-valuetext={formatTimecode(currentTime, fps)}
        className="relative h-8 cursor-pointer touch-none group focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue rounded"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleTrackKeyDown}
      >
        {/* Background Track */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 bg-bg-tertiary rounded-full overflow-hidden">
          {/* Progress Fill */}
          <div
            className={cn('h-full bg-accent-blue', !isDragging && 'transition-all duration-75')}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>

        {duration > 0 &&
          comments
            .filter((c) => c.endTimestamp != null && c.endTimestamp > c.timestamp)
            .map((c) => {
              const left = (c.timestamp / duration) * 100;
              const width = ((c.endTimestamp! - c.timestamp) / duration) * 100;
              return (
                <div
                  key={`range-${c.id}`}
                  className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full bg-accent-yellow/40 pointer-events-none"
                  style={{ left: `${left}%`, width: `${Math.max(width, 0.4)}%` }}
                />
              );
            })}

        {/* Comment Markers (comments within ~1% of each other are grouped) */}
        {clusters.map((cluster) => {
          const isCluster = cluster.comments.length > 1;
          const earliest = cluster.comments[0];
          const label = isCluster
            ? `${cluster.comments.length} bình luận gần ${formatTimecode(earliest.timestamp, fps)}`
            : `Bình luận của ${earliest.user?.name || 'User'} lúc ${formatTimecode(earliest.timestamp, fps)}`;
          return (
            <button
              key={earliest.id}
              type="button"
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 appearance-none bg-transparent border-0 p-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-bg-secondary"
              style={{ left: `${cluster.position}%` }}
              onClick={(e) => {
                e.stopPropagation();
                onSeek(earliest.timestamp);
              }}
              aria-label={label}
              title={cluster.comments.map((c) => `${c.user?.name || 'User'}: ${c.content}`).join('\n')}
            >
              {isCluster ? (
                <div className="min-w-[18px] h-[18px] px-1 bg-accent-yellow rounded-full border-2 border-bg-secondary hover:scale-125 transition-transform flex items-center justify-center text-[10px] font-semibold text-bg-primary">
                  {cluster.comments.length}
                </div>
              ) : (
                <div className="w-3 h-3 bg-accent-yellow rounded-full border-2 border-bg-secondary hover:scale-125 transition-transform" />
              )}
            </button>
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