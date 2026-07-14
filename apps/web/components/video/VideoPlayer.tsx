import React, { useRef, useState, useEffect } from 'react';
import { cn, formatTimecode } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/Tooltip';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  Rewind,
  FastForward,
} from 'lucide-react';

interface ControlButtonProps extends React.ComponentPropsWithoutRef<typeof Button> {
  label: string;
}

// Icon-only transport control: adds the aria-label + hover tooltip every
// button in this bar needs, without repeating the Tooltip wiring six times.
// Forwards its ref (via forwardRef) so Radix's TooltipTrigger asChild can
// reach the real <button> DOM node instead of warning about a missing ref.
const ControlButton = React.forwardRef<HTMLButtonElement, ControlButtonProps>(
  ({ label, className, children, ...props }, ref) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={ref}
          variant="ghost"
          size="sm"
          aria-label={label}
          className={cn('text-white hover:bg-white/20', className)}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
);
ControlButton.displayName = 'ControlButton';

interface VideoPlayerProps {
  src: string;
  fps?: number;
  className?: string;
  onTimeUpdate?: (time: number) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
  seekTo?: number;
  // Applied programmatically (co-watching sync) — does NOT trigger onUserPlay/onUserPause.
  remotePlayback?: { action: 'play' | 'pause'; nonce: number };
  onUserPlay?: () => void;
  onUserPause?: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  fps = 30,
  className,
  onTimeUpdate,
  onPlayStateChange,
  seekTo,
  remotePlayback,
  onUserPlay,
  onUserPause,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastSeekTimeRef = useRef<number | null>(null);
  const lastPlaybackNonceRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showControls, setShowControls] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      onTimeUpdate?.(video.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    const handlePlay = () => {
      setIsPlaying(true);
      onPlayStateChange?.(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
      onPlayStateChange?.(false);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [onTimeUpdate, onPlayStateChange]);

  // Handle seek from external source (e.g., Timeline)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (seekTo === undefined) {
      // Parent cleared the signal — allow the same timestamp to be seeked to again later.
      lastSeekTimeRef.current = null;
      return;
    }

    // Skip if this seekTo value was already processed (avoid loops from timeupdate)
    if (lastSeekTimeRef.current === seekTo) return;

    // Only seek if the time is significantly different from current time
    if (Math.abs(video.currentTime - seekTo) > 0.1) {
      lastSeekTimeRef.current = seekTo;
      video.currentTime = seekTo;
      setCurrentTime(seekTo);
    }
  }, [seekTo]);

  // Apply play/pause commands from other co-watchers without re-broadcasting them.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !remotePlayback) return;
    if (lastPlaybackNonceRef.current === remotePlayback.nonce) return;
    lastPlaybackNonceRef.current = remotePlayback.nonce;

    if (remotePlayback.action === 'play') {
      video.play();
    } else {
      video.pause();
    }
  }, [remotePlayback]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      onUserPause?.();
    } else {
      video.play();
      onUserPlay?.();
    }
  };

  const handleSeek = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
    setCurrentTime(time);
  };

  const handleVolumeChange = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = value;
    setVolume(value);
    setIsMuted(value === 0);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const changeSpeed = (speed: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
    setPlaybackSpeed(speed);
  };

  const frameStep = (direction: 'forward' | 'backward') => {
    const video = videoRef.current;
    if (!video) return;
    const frameTime = 1 / fps;
    const newTime = direction === 'forward'
      ? video.currentTime + frameTime
      : video.currentTime - frameTime;
    handleSeek(Math.max(0, Math.min(newTime, duration)));
  };

  const skipSeconds = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    handleSeek(Math.max(0, Math.min(video.currentTime + seconds, duration)));
  };

  // Only active while the player itself has focus, so Space/Arrow keys don't
  // hijack typing in the comment box or other controls elsewhere on the page.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      if (e.shiftKey) skipSeconds(-5);
      else frameStep('backward');
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      if (e.shiftKey) skipSeconds(5);
      else frameStep('forward');
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={cn(
        'relative w-full h-full bg-black rounded-lg overflow-hidden group focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue',
        className
      )}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      onFocus={() => setShowControls(true)}
      onBlur={() => setShowControls(false)}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-contain"
        onClick={togglePlay}
      />

      {/* Play/Pause Overlay */}
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <button
            onClick={togglePlay}
            aria-label="Phát video"
            className="w-20 h-20 rounded-full bg-accent-blue/90 flex items-center justify-center hover:bg-accent-blue transition-colors"
          >
            <Play className="w-10 h-10 text-white ml-1" />
          </button>
        </div>
      )}

      {/* Controls Overlay */}
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent transition-opacity',
          showControls ? 'opacity-100' : 'opacity-0'
        )}
      >
        {/* Controls Row — wraps instead of clipping if it doesn't fit (mobile) */}
        <div className="flex flex-wrap items-center justify-between gap-y-1 text-white px-2 sm:px-4 py-2">
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Play/Pause */}
            <ControlButton label={isPlaying ? 'Tạm dừng' : 'Phát'} onClick={togglePlay}>
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </ControlButton>

            {/* Skip 5s */}
            <ControlButton label="Lùi 5 giây" onClick={() => skipSeconds(-5)}>
              <Rewind className="w-4 h-4" />
            </ControlButton>

            {/* Frame Step — precision control, hidden on the smallest screens to leave
                room for the essentials (play/skip/mute) instead of wrapping/clipping */}
            <ControlButton
              label="Lùi 1 khung hình"
              className="hidden sm:inline-flex"
              onClick={() => frameStep('backward')}
            >
              <SkipBack className="w-4 h-4" />
            </ControlButton>
            <ControlButton
              label="Tiến 1 khung hình"
              className="hidden sm:inline-flex"
              onClick={() => frameStep('forward')}
            >
              <SkipForward className="w-4 h-4" />
            </ControlButton>

            {/* Skip 5s */}
            <ControlButton label="Tiến 5 giây" onClick={() => skipSeconds(5)}>
              <FastForward className="w-4 h-4" />
            </ControlButton>

            {/* Volume */}
            <div className="flex items-center gap-2">
              <ControlButton label={isMuted ? 'Bật tiếng' : 'Tắt tiếng'} onClick={toggleMute}>
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </ControlButton>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                aria-label="Âm lượng"
                className="hidden sm:block w-20 h-1 bg-white/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-2 [&::-moz-range-thumb]:h-2 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white"
              />
            </div>

            {/* Time Display */}
            <span className="text-xs sm:text-sm font-mono ml-1 sm:ml-2 whitespace-nowrap">
              {formatTimecode(currentTime, fps)} / {formatTimecode(duration, fps)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Speed Control */}
            <select
              value={playbackSpeed}
              onChange={(e) => changeSpeed(parseFloat(e.target.value))}
              aria-label="Tốc độ phát"
              className="bg-bg-tertiary text-white text-sm px-2 py-1 rounded border-none cursor-pointer"
            >
              <option value="0.5">0.5x</option>
              <option value="1">1x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select>

            {/* Fullscreen */}
            <ControlButton
              label={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </ControlButton>
          </div>
        </div>
      </div>
    </div>
  );
};