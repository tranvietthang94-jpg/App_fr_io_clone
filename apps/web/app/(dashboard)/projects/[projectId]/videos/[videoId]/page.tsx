"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { videosApi, commentsApi, exportApi } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/authStore";
import { formatTimestamp, formatDuration } from "@/lib/utils";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { CommentPanel } from "@/components/comments/CommentPanel";
import { ExportPanel } from "@/components/export/ExportPanel";
import {
  ArrowLeft,
  MessageSquare,
  Download,
  Film,
} from "lucide-react";
import type { Video, Comment } from "@fr-clone/shared";

export default function VideoReviewPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const videoId = params.videoId as string;
  const projectId = params.projectId as string;

  const [video, setVideo] = useState<Video | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showComments, setShowComments] = useState(true);
  const [showExport, setShowExport] = useState(false);

  useEffect(() => {
    loadVideo();
    loadComments();
  }, [videoId]);

  const loadVideo = async () => {
    try {
      const res = await videosApi.getById(videoId);
      setVideo(res.data);
    } catch (err) {
      console.error("Failed to load video:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadComments = async () => {
    try {
      const res = await commentsApi.getByVideo(videoId);
      setComments(res.data);
    } catch (err) {
      console.error("Failed to load comments:", err);
    }
  };

  const handleAddComment = async (data: {
    content: string;
    timestamp: number;
    frameNumber: number;
    positionX?: number;
    positionY?: number;
  }) => {
    try {
      const res = await commentsApi.create(videoId, data);
      setComments([...comments, res.data]);
    } catch (err) {
      console.error("Failed to add comment:", err);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await commentsApi.delete(commentId);
      setComments(comments.filter((c) => c.id !== commentId));
    } catch (err) {
      console.error("Failed to delete comment:", err);
    }
  };

  const handleExportXml = async () => {
    try {
      const res = await exportApi.getXml(videoId);
      const blob = new Blob([res.data], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${video?.title || "video"}_review.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export XML:", err);
    }
  };

  const handleExportPdf = async () => {
    try {
      const res = await exportApi.getPdf(videoId);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${video?.title || "video"}_review.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export PDF:", err);
    }
  };

  const handleSeekToComment = (timestamp: number) => {
    setCurrentTime(timestamp);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Đang tải...</div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Video không tồn tại</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/projects/${projectId}`)}
            className="p-2 hover:bg-secondary rounded-md transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-semibold">{video.title}</h1>
            <p className="text-sm text-muted-foreground">
              {formatDuration(video.duration)} • {video.width}x{video.height}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowComments(!showComments)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
              showComments ? "bg-primary/10 text-primary" : "hover:bg-secondary"
            }`}
          >
            <MessageSquare className="w-5 h-5" />
            <span>{comments.length}</span>
          </button>
          <button
            onClick={() => setShowExport(!showExport)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
              showExport ? "bg-primary/10 text-primary" : "hover:bg-secondary"
            }`}
          >
            <Download className="w-5 h-5" />
            <span>Xuất</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video player area */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 relative bg-black">
            {video.status === "ready" ? (
              <VideoPlayer
                videoUrl={videosApi.getStreamUrl(videoId, "original")}
                currentTime={currentTime}
                onTimeUpdate={setCurrentTime}
                onPlayStateChange={setIsPlaying}
                comments={comments}
                onSeekToComment={handleSeekToComment}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-muted-foreground">Video đang được xử lý...</p>
                </div>
              </div>
            )}
          </div>

          {/* Timeline with comment markers */}
          <div className="h-16 bg-card border-t border-border px-4">
            <div className="relative h-full flex items-center">
              {/* Timeline bar */}
              <div className="absolute inset-x-0 h-2 bg-secondary rounded-full">
                <div
                  className="absolute h-full bg-primary rounded-full"
                  style={{
                    width: `${(currentTime / video.duration) * 100}%`,
                  }}
                />
              </div>

              {/* Comment markers */}
              {comments.map((comment) => (
                <button
                  key={comment.id}
                  onClick={() => handleSeekToComment(comment.timestamp)}
                  className="absolute w-4 h-4 bg-primary hover:bg-primary/80 rounded-full transform -translate-x-1/2 -translate-y-1/2 top-1/2 z-10 transition-transform hover:scale-125"
                  style={{
                    left: `${(comment.timestamp / video.duration) * 100}%`,
                  }}
                  title={comment.content}
                />
              ))}

              {/* Current time indicator */}
              <div
                className="absolute w-3 h-3 bg-white rounded-full transform -translate-x-1/2 -translate-y-1/2 top-1/2 z-20 shadow-lg"
                style={{
                  left: `${(currentTime / video.duration) * 100}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>{formatTimestamp(currentTime)}</span>
              <span>{formatTimestamp(video.duration)}</span>
            </div>
          </div>
        </div>

        {/* Right panel */}
        {showComments && (
          <div className="w-96 border-l border-border flex flex-col">
            <CommentPanel
              comments={comments}
              currentTime={currentTime}
              onAddComment={handleAddComment}
              onDeleteComment={handleDeleteComment}
              onSeekToComment={handleSeekToComment}
            />
          </div>
        )}

        {showExport && (
          <div className="w-96 border-l border-border">
            <ExportPanel
              video={video}
              comments={comments}
              onExportXml={handleExportXml}
              onExportPdf={handleExportPdf}
            />
          </div>
        )}
      </div>
    </div>
  );
}