"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { videosApi, commentsApi, exportApi, annotationsApi } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/authStore";
import { formatTimecode, isCommentActive } from "@/lib/utils";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { Timeline } from "@/components/video/Timeline";
import { AnnotationCanvas } from "@/components/video/AnnotationCanvas";
import { CommentPanel } from "@/components/comments/CommentPanel";
import { ExportPanel } from "@/components/export/ExportPanel";
import { UserPresence } from "@/components/presence/UserPresence";
import { socketService } from "@/lib/socket";
import {
  ArrowLeft,
  MessageSquare,
  Download,
  Pencil,
} from "lucide-react";
import type { Video, Comment, Annotation } from "@fr-clone/shared";

interface PendingAnnotation {
  type: string;
  color: string;
  points: Array<{ x: number; y: number }>;
}

export default function VideoReviewPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const videoId = params.videoId as string;
  const projectId = params.projectId as string;

  const [video, setVideo] = useState<Video | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTarget, setSeekTarget] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showComments, setShowComments] = useState(true);
  const [showExport, setShowExport] = useState(false);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [pendingAnnotation, setPendingAnnotation] = useState<PendingAnnotation | null>(null);
  const [remotePlayback, setRemotePlayback] = useState<{ action: 'play' | 'pause'; nonce: number } | null>(null);
  const playbackNonceRef = useRef(0);

  // Apply a seek locally without broadcasting it (used for both local UI seeks
  // and seeks that arrive from other co-watchers).
  const applySeek = (timestamp: number) => {
    setSeekTarget(timestamp);
    // Reset seekTarget after a short delay to allow seeking to the same position again
    setTimeout(() => setSeekTarget(null), 100);
  };

  useEffect(() => {
    loadVideo();
    loadComments();
    loadAnnotations();

    // Connect socket and join video room
    socketService.connect();
    socketService.joinVideo(videoId);

    // Listen for real-time comments
    const handleNewComment = (data: any) => {
      setComments((prev) => [
        ...prev,
        {
          id: `temp-${Date.now()}`,
          videoId,
          userId: data.userId,
          content: data.content,
          timestamp: data.timestamp,
          frameNumber: data.frameNumber,
          createdAt: data.createdAt,
          user: { name: data.username },
        } as Comment,
      ]);
    };

    // Co-watching: apply playback actions from other users in the room.
    // These only apply locally (via applySeek/remotePlayback) — they never
    // re-emit, which is what keeps this from ping-ponging between clients.
    const handleRemoteSeek = (data: { timestamp: number }) => {
      applySeek(data.timestamp);
    };
    const handleRemotePlay = (data: { timestamp: number }) => {
      applySeek(data.timestamp);
      playbackNonceRef.current += 1;
      setRemotePlayback({ action: 'play', nonce: playbackNonceRef.current });
    };
    const handleRemotePause = (data: { timestamp: number }) => {
      applySeek(data.timestamp);
      playbackNonceRef.current += 1;
      setRemotePlayback({ action: 'pause', nonce: playbackNonceRef.current });
    };

    socketService.on('comment:new', handleNewComment);
    socketService.on('video:seek', handleRemoteSeek);
    socketService.on('video:play', handleRemotePlay);
    socketService.on('video:pause', handleRemotePause);

    return () => {
      socketService.off('comment:new', handleNewComment);
      socketService.off('video:seek', handleRemoteSeek);
      socketService.off('video:play', handleRemotePlay);
      socketService.off('video:pause', handleRemotePause);
      socketService.leaveVideo();
    };
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

  const loadAnnotations = async () => {
    try {
      const res = await annotationsApi.getByVideo(videoId);
      setAnnotations(res.data);
    } catch (err) {
      console.error("Failed to load annotations:", err);
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

      // Broadcast to other users via socket
      socketService.sendComment(videoId, data.content, data.timestamp, data.frameNumber);

      // Attach any in-progress annotation drawing to the new comment
      if (pendingAnnotation) {
        try {
          const annotationRes = await annotationsApi.create(res.data.id, {
            type: pendingAnnotation.type,
            data: { color: pendingAnnotation.color, points: pendingAnnotation.points },
          });
          setAnnotations((prev) => [...prev, annotationRes.data]);
        } catch (err) {
          console.error("Failed to save annotation:", err);
        }
        setPendingAnnotation(null);
        setIsAnnotating(false);
      }
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

  const handleEditComment = async (commentId: string, content: string) => {
    try {
      const res = await commentsApi.update(commentId, { content });
      setComments(comments.map((c) => (c.id === commentId ? res.data : c)));
    } catch (err) {
      console.error("Failed to edit comment:", err);
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

  // User-initiated seek (Timeline drag, comment click) — applies locally AND
  // broadcasts to co-watchers.
  const handleUserSeek = (timestamp: number) => {
    applySeek(timestamp);
    socketService.sendVideoSeek(videoId, timestamp);
  };

  const handleUserPlay = () => {
    socketService.sendVideoPlay(videoId, currentTime);
  };

  const handleUserPause = () => {
    socketService.sendVideoPause(videoId, currentTime);
  };

  const handleTypingChange = (isTyping: boolean) => {
    socketService.sendTyping(videoId, isTyping);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-secondary">Đang tải...</div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-secondary">Video không tồn tại</div>
      </div>
    );
  }

  // Annotations are pinned to whichever comment is currently "active" (same
  // window CommentPanel uses to highlight a comment). Memoized on the active
  // comment's id (not on currentTime directly) so AnnotationCanvas only
  // redraws when the active comment actually changes, not on every
  // timeupdate tick during playback.
  const activeCommentId = useMemo(
    () => comments.find((c) => isCommentActive(c.timestamp, currentTime))?.id,
    [comments, currentTime]
  );
  const savedAnnotationsForCanvas = useMemo(
    () =>
      annotations
        .filter((a) => a.commentId === activeCommentId)
        .map((a) => {
          const data = a.data as { color: string; points: Array<{ x: number; y: number }> };
          return { type: a.type, color: data.color, points: data.points };
        }),
    [annotations, activeCommentId]
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/projects/${projectId}`)}
            className="p-2 hover:bg-bg-tertiary rounded-md transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-semibold">{video.title}</h1>
            <p className="text-sm text-text-secondary">
              {formatTimecode(video.duration, video.fps)} • {video.width}x{video.height}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <UserPresence videoId={videoId} />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowComments(!showComments)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                showComments ? "bg-primary/10 text-primary" : "hover:bg-bg-tertiary"
              }`}
            >
              <MessageSquare className="w-5 h-5" />
              <span>{comments.length}</span>
            </button>
            <button
              onClick={() => setShowExport(!showExport)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                showExport ? "bg-primary/10 text-primary" : "hover:bg-bg-tertiary"
              }`}
            >
              <Download className="w-5 h-5" />
              <span>Xuất</span>
            </button>
            <button
              onClick={() => setIsAnnotating(!isAnnotating)}
              title="Vẽ chú thích trên video"
              className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                isAnnotating ? "bg-primary/10 text-primary" : "hover:bg-bg-tertiary"
              }`}
            >
              <Pencil className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video player area */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 relative bg-black">
            {video.status === "ready" ? (
              <VideoPlayer
                src={videosApi.getStreamUrl(videoId, "original")}
                fps={video.fps}
                onTimeUpdate={setCurrentTime}
                onPlayStateChange={setIsPlaying}
                seekTo={seekTarget ?? undefined}
                remotePlayback={remotePlayback ?? undefined}
                onUserPlay={handleUserPlay}
                onUserPause={handleUserPause}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-text-secondary">Video đang được xử lý...</p>
                </div>
              </div>
            )}
            <AnnotationCanvas
              isActive={isAnnotating}
              savedAnnotations={savedAnnotationsForCanvas}
              onAnnotationComplete={setPendingAnnotation}
            />
          </div>

          {/* Timeline with comment markers */}
          <Timeline
            duration={video.duration}
            currentTime={currentTime}
            comments={comments}
            fps={video.fps}
            onSeek={handleUserSeek}
          />
        </div>

        {/* Right panel */}
        {showComments && (
          <div className="w-96 border-l border-border flex flex-col h-full overflow-hidden">
            <CommentPanel
              comments={comments}
              currentTime={currentTime}
              fps={video.fps}
              onAddComment={handleAddComment}
              onDeleteComment={handleDeleteComment}
              onEditComment={handleEditComment}
              onSeekToComment={handleUserSeek}
              onTyping={handleTypingChange}
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