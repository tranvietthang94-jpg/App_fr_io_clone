"use client";

import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
} from "lucide-react";
import type { Comment } from "@fr-clone/shared";

interface VideoPlayerProps {
  videoUrl: string;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  onPlayStateChange: (isPlaying: boolean) => void;
  comments: Comment[];
  onSeekToComment: (timestamp: number) => void;
}

export function VideoPlayer({
  videoUrl,
  currentTime,
  onTimeUpdate,
  onPlayStateChange,
  comments,
  onSeekToComment,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showAnnotation, setShowAnnotation] = useState(false);
  const [annotationMode, setAnnotationMode] = useState<"draw" | "highlight" | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      onTimeUpdate(video.currentTime);
    };

    const handlePlay = () => {
      setIsPlaying(true);
      onPlayStateChange(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
      onPlayStateChange(false);
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
    };
  }, [onTimeUpdate, onPlayStateChange]);

  // Sync currentTime with video
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const diff = Math.abs(video.currentTime - currentTime);
    if (diff > 0.5) {
      video.currentTime = currentTime;
    }
  }, [currentTime]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const newVolume = parseFloat(e.target.value);
    video.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
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

  const skipBackward = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, video.currentTime - 5);
  };

  const skipForward = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(video.duration, video.currentTime + 5);
  };

  const handleFrameStep = (direction: "prev" | "next") => {
    const video = videoRef.current;
    if (!video) return;

    const fps = 30;
    const frameDuration = 1 / fps;

    if (direction === "prev") {
      video.currentTime = Math.max(0, video.currentTime - frameDuration);
    } else {
      video.currentTime = Math.min(video.duration, video.currentTime + frameDuration);
    }
  };

  const handleVideoClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!showAnnotation) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    // Will be used for annotation
    console.log("Click position:", { x, y, timestamp: currentTime });
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black group"
      onClick={handleVideoClick}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full h-full object-contain"
        onClick={togglePlay}
      />

      {/* Comment markers on video */}
      {comments
        .filter((c) => Math.abs(c.timestamp - currentTime) < 0.1)
        .map((comment) => (
          <div
            key={comment.id}
            className="absolute w-6 h-6 bg-primary/80 rounded-full transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-pointer hover:scale-110 transition-transform"
            style={{
              left: `${comment.positionX || 50}%`,
              top: `${comment.positionY || 50}%`,
            }}
            title={comment.content}
          >
            <span className="text-xs text-white font-bold">💬</span>
          </div>
        ))}

      {/* Controls overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Progress bar */}
        <div className="mb-4">
          <input
            type="range"
            min={0}
            max={videoRef.current?.duration || 100}
            value={currentTime}
            onChange={(e) => {
              const video = videoRef.current;
              if (video) {
                video.currentTime = parseFloat(e.target.value);
                onTimeUpdate(video.currentTime);
              }
            }}
            className="w-full h-1 bg-white/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
          />
        </div>

        {/* Control buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              {isPlaying ? (
                <Pause className="w-6 h-6 text-white" />
              ) : (
                <Play className="w-6 h-6 text-white" />
              )}
            </button>

            {/* Skip backward */}
            <button
              onClick={skipBackward}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <SkipBack className="w-5 h-5 text-white" />
            </button>

            {/* Frame step */}
            <button
              onClick={() => handleFrameStep("prev")}
              className="p-2 hover:bg-white/10 rounded-full transition-colors text-xs text-white"
            >
              ←F
            </button>
            <button
              onClick={() => handleFrameStep("next")}
              className="p-2 hover:bg-white/10 rounded-full transition-colors text-xs text-white"
            >
              F→
            </button>

            {/* Skip forward */}
            <button
              onClick={skipForward}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <SkipForward className="w-5 h-5 text-white" />
            </button>

            {/* Volume */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                {isMuted ? (
                  <VolumeX className="w-5 h-5 text-white" />
                ) : (
                  <Volume2 className="w-5 h-5 text-white" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-20 h-1 bg-white/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Annotation toggle */}
            <button
              onClick={() => setShowAnnotation(!showAnnotation)}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                showAnnotation
                  ? "bg-primary text-white"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              ✏️ Vẽ
            </button>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              {isFullscreen ? (
                <Minimize className="w-5 h-5 text-white" />
              ) : (
                <Maximize className="w-5 h-5 text-white" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}