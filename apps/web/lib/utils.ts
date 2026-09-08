import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * SMPTE-style timecode: h:mm:ss:ff (hours omitted under 1h). `fps` should be
 * the source video's actual frame rate, not assumed to be 30.
 */
export function formatTimecode(seconds: number, fps: number = 30): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * fps);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

export function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatDate(date: Date | string): string {
  return format(new Date(date), 'dd/MM/yyyy HH:mm');
}

export function formatRelativeTime(date: Date | string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/** Remaining-time label for the upload panel. `null` until enough progress to estimate. */
export function formatEta(startedAt: number | undefined, progress: number, now = Date.now()): string | null {
  if (!startedAt || progress < 3) return null;
  const remainingMs = ((now - startedAt) * (100 - progress)) / progress;
  if (!Number.isFinite(remainingMs) || remainingMs < 0) return null;
  const sec = Math.round(remainingMs / 1000);
  if (sec < 15) return 'sắp xong';
  if (sec < 60) return `còn ~${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `còn ~${min} phút`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `còn ~${h} giờ ${m} phút` : `còn ~${h} giờ`;
}

// Shared "is this comment near the playhead" window, used to highlight the
// active comment and to decide which comment's annotations to show.
const ACTIVE_COMMENT_WINDOW_SEC = 0.5;

export function isCommentActive(
  commentTimestamp: number,
  currentTime: number,
  endTimestamp?: number | null,
): boolean {
  if (endTimestamp != null && endTimestamp > commentTimestamp) {
    return currentTime >= commentTimestamp && currentTime <= endTimestamp;
  }
  return Math.abs(commentTimestamp - currentTime) < ACTIVE_COMMENT_WINDOW_SEC;
}

export function getFrameNumber(timestamp: number, fps: number = 30): number {
  return Math.floor(timestamp * fps);
}

export function getTimestampFromFrame(frameNumber: number, fps: number = 30): number {
  return frameNumber / fps;
}