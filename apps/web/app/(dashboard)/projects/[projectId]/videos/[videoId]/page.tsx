"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { videosApi, commentsApi, exportApi, annotationsApi, reactionsApi, projectMembersApi } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/authStore";
import { formatTimecode, isCommentActive } from "@/lib/utils";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { Timeline } from "@/components/video/Timeline";
import { AnnotationCanvas } from "@/components/video/AnnotationCanvas";
import { CommentPanel } from "@/components/comments/CommentPanel";
import { ExportPanel } from "@/components/export/ExportPanel";
import { UserPresence } from "@/components/presence/UserPresence";
import { ReviewStatusControl } from "@/components/video/ReviewStatusControl";
import { ShareLinkPanel } from "@/components/video/ShareLinkPanel";
import { Button } from "@/components/ui/Button";
import { socketService } from "@/lib/socket";
import {
  ArrowLeft,
  MessageSquare,
  Download,
  Pencil,
  Share2,
  ChevronDown,
} from "lucide-react";
import type { Video, Comment, Annotation, VideoReviewStatus } from "@fr-clone/shared";
import type { MentionMember } from "@/components/comments/MentionInput";

interface PendingAnnotation {
  type: string;
  color: string;
  points?: Array<{ x: number; y: number }>;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
}

const COMMENTS_PAGE_SIZE = 30;

export default function VideoReviewPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const videoId = params.videoId as string;
  const projectId = params.projectId as string;

  const [video, setVideo] = useState<Video | null>(null);
  const [versions, setVersions] = useState<Video[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsOffset, setCommentsOffset] = useState(0);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [sortMode, setSortMode] = useState<'timecode' | 'date'>('timecode');
  const [members, setMembers] = useState<MentionMember[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTarget, setSeekTarget] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showComments, setShowComments] = useState(true);
  const [showExport, setShowExport] = useState(false);
  const [showShareLinks, setShowShareLinks] = useState(false);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [pendingAnnotations, setPendingAnnotations] = useState<PendingAnnotation[]>([]);
  const [remotePlayback, setRemotePlayback] = useState<{ action: 'play' | 'pause'; nonce: number } | null>(null);
  const playbackNonceRef = useRef(0);

  // Apply a seek locally without broadcasting it (used for both local UI seeks
  // and seeks that arrive from other co-watchers).
  const applySeek = (timestamp: number) => {
    setSeekTarget(timestamp);
    // Reset seekTarget after a short delay to allow seeking to the same position again
    setTimeout(() => setSeekTarget(null), 100);
  };

  const loadComments = async (opts?: { sort?: 'timecode' | 'date'; append?: boolean }) => {
    try {
      const sort = opts?.sort ?? sortMode;
      const offset = opts?.append ? commentsOffset : 0;
      const res = await commentsApi.getByVideo(videoId, { sort, offset, limit: COMMENTS_PAGE_SIZE });
      setComments((prev) => (opts?.append ? [...prev, ...res.data.items] : res.data.items));
      setCommentsOffset(offset + res.data.items.length);
      setHasMoreComments(res.data.nextOffset != null);
    } catch (err) {
      console.error("Failed to load comments:", err);
    }
  };

  useEffect(() => {
    loadVideo();
    loadVersions();
    loadComments();
    loadAnnotations();

    // Connect socket and join video room
    socketService.connect();
    socketService.joinVideo(videoId);

    // Listen for real-time comments/replies — refetch to get correctly
    // threaded/numbered/reaction-embedded data rather than hand-building it.
    const handleNewComment = () => {
      loadComments();
    };

    const handleRemoteResolved = (data: { commentId: string; resolved: boolean }) => {
      setComments((prev) =>
        prev.map((c) => (c.id === data.commentId ? { ...c, resolved: data.resolved } : c))
      );
    };

    const handleRemoteReaction = async (data: { commentId: string }) => {
      try {
        const res = await reactionsApi.getByComment(data.commentId);
        setComments((prev) =>
          prev.map((c) => (c.id === data.commentId ? { ...c, reactions: res.data } : c))
        );
      } catch (err) {
        console.error("Failed to refresh reactions:", err);
      }
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
    socketService.on('comment:resolved', handleRemoteResolved);
    socketService.on('comment:reaction', handleRemoteReaction);
    socketService.on('video:seek', handleRemoteSeek);
    socketService.on('video:play', handleRemotePlay);
    socketService.on('video:pause', handleRemotePause);

    return () => {
      socketService.off('comment:new', handleNewComment);
      socketService.off('comment:resolved', handleRemoteResolved);
      socketService.off('comment:reaction', handleRemoteReaction);
      socketService.off('video:seek', handleRemoteSeek);
      socketService.off('video:play', handleRemotePlay);
      socketService.off('video:pause', handleRemotePause);
      socketService.leaveVideo();
    };
  }, [videoId]);

  useEffect(() => {
    if (!projectId) return;
    projectMembersApi
      .getMembers(projectId)
      .then((res) => {
        setMembers(
          res.data
            .filter((m: any) => m.status === 'accepted' && m.user)
            .map((m: any) => ({ userId: m.user.id, name: m.user.name }))
        );
      })
      .catch((err: any) => console.error("Failed to load members:", err));
  }, [projectId]);

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

  const loadVersions = async () => {
    try {
      const res = await videosApi.getVersions(videoId);
      setVersions(res.data);
    } catch (err) {
      console.error("Failed to load versions:", err);
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

  const handleSortChange = (mode: 'timecode' | 'date') => {
    setSortMode(mode);
    loadComments({ sort: mode, append: false });
  };

  const handleLoadMoreComments = () => {
    loadComments({ append: true });
  };

  const handleAddComment = async (data: {
    content: string;
    timestamp: number;
    frameNumber: number;
    parentId?: string;
  }) => {
    try {
      const res = await commentsApi.create(videoId, data);

      // Broadcast to other users via socket
      socketService.sendComment(videoId, data.content, data.timestamp, data.frameNumber);

      // Attach any in-progress annotation strokes to the new (top-level) comment
      if (!data.parentId && pendingAnnotations.length > 0) {
        const created: Annotation[] = [];
        for (const pending of pendingAnnotations) {
          try {
            const annotationRes = await annotationsApi.create(res.data.id, {
              type: pending.type,
              data: {
                color: pending.color,
                points: pending.points,
                x: pending.x,
                y: pending.y,
                width: pending.width,
                height: pending.height,
                text: pending.text,
              },
            });
            created.push(annotationRes.data);
          } catch (err) {
            console.error("Failed to save annotation:", err);
          }
        }
        setAnnotations((prev) => [...prev, ...created]);
        setPendingAnnotations([]);
        setIsAnnotating(false);
      }

      await loadComments();
    } catch (err) {
      console.error("Failed to add comment:", err);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await commentsApi.delete(commentId);
      await loadComments();
    } catch (err) {
      console.error("Failed to delete comment:", err);
    }
  };

  const handleEditComment = async (commentId: string, content: string) => {
    try {
      const res = await commentsApi.update(commentId, { content });
      setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, content: res.data.content } : c)));
    } catch (err) {
      console.error("Failed to edit comment:", err);
    }
  };

  const handleResolveComment = async (commentId: string, resolved: boolean) => {
    try {
      const res = await commentsApi.setResolved(commentId, resolved);
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, resolved: res.data.resolved, resolvedBy: res.data.resolvedBy, resolvedAt: res.data.resolvedAt }
            : c
        )
      );
      socketService.sendCommentResolved(videoId, commentId, resolved);
    } catch (err) {
      console.error("Failed to resolve comment:", err);
    }
  };

  const handleReactToComment = async (commentId: string, emoji: string) => {
    try {
      await reactionsApi.toggle(commentId, emoji);
      const res = await reactionsApi.getByComment(commentId);
      setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, reactions: res.data } : c)));
      socketService.sendCommentReaction(videoId, commentId);
    } catch (err) {
      console.error("Failed to toggle reaction:", err);
    }
  };

  const handleAnnotationComplete = (data: PendingAnnotation) => {
    setPendingAnnotations((prev) => [...prev, data]);
  };

  const handleDeleteAnnotation = async (id: string) => {
    const annotation = annotations.find((a) => a.id === id);
    if (!annotation) return;
    try {
      await annotationsApi.delete(annotation.commentId, id);
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error("Failed to delete annotation:", err);
    }
  };

  const handleReviewStatusChange = async (status: VideoReviewStatus) => {
    try {
      const res = await videosApi.setReviewStatus(videoId, status);
      setVideo((prev) => (prev ? { ...prev, reviewStatus: res.data.reviewStatus } : prev));
    } catch (err) {
      console.error("Failed to update review status:", err);
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
          const data = a.data as {
            color: string;
            points?: Array<{ x: number; y: number }>;
            x?: number;
            y?: number;
            width?: number;
            height?: number;
            text?: string;
          };
          return { id: a.id, type: a.type, ...data };
        }),
    [annotations, activeCommentId]
  );

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

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Quay lại"
            onClick={() => router.push(`/projects/${projectId}`)}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-semibold">{video.title}</h1>
              {versions.length > 1 && (
                <div className="relative">
                  <button
                    onClick={() => setShowVersions((v) => !v)}
                    className="flex items-center gap-1 px-2 py-0.5 text-xs bg-bg-tertiary hover:bg-bg-hover rounded-full"
                  >
                    v{video.versionNumber} <ChevronDown className="w-3 h-3" />
                  </button>
                  {showVersions && (
                    <div className="absolute left-0 mt-1 w-48 bg-bg-secondary border border-border rounded-md shadow-lg z-30 py-1">
                      {versions
                        .slice()
                        .sort((a, b) => b.versionNumber - a.versionNumber)
                        .map((v) => (
                          <button
                            key={v.id}
                            onClick={() => {
                              setShowVersions(false);
                              if (v.id !== videoId) {
                                router.push(`/projects/${projectId}/videos/${v.id}`);
                              }
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-bg-tertiary text-left ${
                              v.id === videoId ? "text-primary font-medium" : ""
                            }`}
                          >
                            <span>Phiên bản {v.versionNumber}</span>
                            {v.id === videoId && <span className="text-xs">(hiện tại)</span>}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <p className="text-sm text-text-secondary">
              {formatTimecode(video.duration, video.fps)} • {video.width}x{video.height}
            </p>
          </div>
          <ReviewStatusControl status={video.reviewStatus} onChange={handleReviewStatusChange} />
        </div>
        <div className="flex items-center gap-4">
          <UserPresence videoId={videoId} />
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              active={showComments}
              icon={<MessageSquare className="w-5 h-5" />}
              onClick={() => setShowComments(!showComments)}
            >
              {comments.length}
            </Button>
            <Button
              variant="ghost"
              active={showExport}
              icon={<Download className="w-5 h-5" />}
              onClick={() => setShowExport(!showExport)}
            >
              Xuất
            </Button>
            <Button
              variant="ghost"
              icon={<Share2 className="w-5 h-5" />}
              onClick={() => setShowShareLinks(true)}
            >
              Chia sẻ
            </Button>
            <Button
              variant="ghost"
              active={isAnnotating}
              aria-label="Vẽ chú thích trên video"
              title="Vẽ chú thích trên video"
              onClick={() => setIsAnnotating(!isAnnotating)}
            >
              <Pencil className="w-5 h-5" />
            </Button>
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
              onAnnotationComplete={handleAnnotationComplete}
              onDeleteAnnotation={handleDeleteAnnotation}
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
              currentUserId={user?.id}
              members={members}
              sortMode={sortMode}
              onSortChange={handleSortChange}
              hasMore={hasMoreComments}
              onLoadMore={handleLoadMoreComments}
              onAddComment={handleAddComment}
              onDeleteComment={handleDeleteComment}
              onEditComment={handleEditComment}
              onResolveComment={handleResolveComment}
              onReactToComment={handleReactToComment}
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

      {showShareLinks && (
        <ShareLinkPanel videoId={videoId} onClose={() => setShowShareLinks(false)} />
      )}
    </div>
  );
}
