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
import { WorkspaceRail } from "@/components/workspace/WorkspaceRail";
import { ShareLinkPanel } from "@/components/video/ShareLinkPanel";
import { Button } from "@/components/ui/Button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { socketService } from "@/lib/socket";
import {
  ArrowLeft,
  MessageSquare,
  Download,
  Pencil,
  Share2,
  ChevronDown,
  Keyboard,
  X,
} from "lucide-react";
import type { Video, Comment, Annotation, VideoReviewStatus } from "@r-frame/shared";
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
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | undefined>(undefined);
  const [transcodeProgress, setTranscodeProgress] = useState<number | null>(null);
  const [versions, setVersions] = useState<Video[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [compareVersionId, setCompareVersionId] = useState<string | null>(null);
  const [compareStreamUrl, setCompareStreamUrl] = useState<string | null>(null);
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
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState<'comments' | 'export'>('comments');
  const [showShareLinks, setShowShareLinks] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
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

    // Live transcode progress pushed by the BullMQ worker. Refetch the video
    // once it reports ready/failed so the player (or failure state) replaces
    // the progress bar.
    const handleTranscodeProgress = (data: { videoId: string; percent?: number; status?: string }) => {
      if (data.videoId !== videoId) return;
      if (typeof data.percent === 'number') setTranscodeProgress(data.percent);
      if (data.status === 'ready' || data.status === 'failed') {
        loadVideo();
      }
    };

    socketService.on('comment:new', handleNewComment);
    socketService.on('comment:resolved', handleRemoteResolved);
    socketService.on('comment:reaction', handleRemoteReaction);
    socketService.on('video:seek', handleRemoteSeek);
    socketService.on('video:play', handleRemotePlay);
    socketService.on('video:pause', handleRemotePause);
    socketService.on('video:transcode-progress', handleTranscodeProgress);

    return () => {
      socketService.off('comment:new', handleNewComment);
      socketService.off('comment:resolved', handleRemoteResolved);
      socketService.off('comment:reaction', handleRemoteReaction);
      socketService.off('video:seek', handleRemoteSeek);
      socketService.off('video:play', handleRemotePlay);
      socketService.off('video:pause', handleRemotePause);
      socketService.off('video:transcode-progress', handleTranscodeProgress);
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

  // Fetch a fresh, video-scoped stream token once the video is ready. Kept out
  // of the render path so the API access token never lands in the <video> URL.
  useEffect(() => {
    if (video?.status !== "ready") {
      setStreamUrl(null);
      setPosterUrl(undefined);
      return;
    }
    let cancelled = false;
    videosApi
      .getStreamToken(videoId)
      .then((res) => {
        if (!cancelled) {
          setStreamUrl(videosApi.getStreamUrl(videoId, "original", res.data.token));
          setPosterUrl(videosApi.getThumbnailUrl(videoId, res.data.token));
        }
      })
      .catch((err) => console.error("Failed to get stream token:", err));
    return () => {
      cancelled = true;
    };
  }, [video?.status, videoId]);

  // Stream token for the version being compared against — each version is its
  // own video row, so it needs its own video-scoped token.
  useEffect(() => {
    if (!compareVersionId) {
      setCompareStreamUrl(null);
      return;
    }
    let cancelled = false;
    videosApi
      .getStreamToken(compareVersionId)
      .then((res) => {
        if (!cancelled) {
          setCompareStreamUrl(videosApi.getStreamUrl(compareVersionId, "original", res.data.token));
        }
      })
      .catch((err) => console.error("Failed to get compare stream token:", err));
    return () => {
      cancelled = true;
    };
  }, [compareVersionId]);

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
    endTimestamp?: number;
    parentId?: string;
  }) => {
    try {
      const res = await commentsApi.create(videoId, data);

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

  // Header buttons for Comments/Export now drive one shared panel: clicking
  // the tab that's already open+active closes the panel, otherwise it opens
  // (or switches) to that tab. Replaces two independently-toggled `w-96`
  // panels that could previously both be open at once, eating 768px of width
  // — the actual cause of this page having no viable layout below `lg`.
  const openRightPanelTab = (tab: 'comments' | 'export') => {
    if (showRightPanel && rightPanelTab === tab) {
      setShowRightPanel(false);
    } else {
      setRightPanelTab(tab);
      setShowRightPanel(true);
    }
  };

  // '?' opens a cheat-sheet for the player/timeline shortcuts (Space, Arrow,
  // Shift+Arrow, Home, End) that already work but were only discoverable by
  // reading the source. Ignored while typing in an input/textarea/contentEditable.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '?') return;
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (isTyping) return;
      e.preventDefault();
      setShowShortcuts(true);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Annotations are pinned to whichever comment is currently "active" (same
  // window CommentPanel uses to highlight a comment). Memoized on the active
  // comment's id (not on currentTime directly) so AnnotationCanvas only
  // redraws when the active comment actually changes, not on every
  // timeupdate tick during playback.
  const activeCommentId = useMemo(
    () => comments.find((c) => isCommentActive(c.timestamp, currentTime, c.endTimestamp))?.id,
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

  const compareVersion = compareVersionId
    ? versions.find((v) => v.id === compareVersionId) ?? null
    : null;

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
    <div className="h-full flex min-h-0">
      <WorkspaceRail projectId={projectId} />
      <div className="flex-1 min-w-0 flex flex-col">
      {/* Header — wraps onto a second line rather than pushing buttons off
          the right edge; the left title block was pinned to its content
          width, plus 5 icon buttons + presence, which never fit under ~600px. */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 px-3 sm:px-6 py-3 sm:py-4 border-b border-border">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Quay lại"
            onClick={() => router.push(`/projects/${projectId}`)}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-semibold truncate max-w-[40vw] sm:max-w-none" title={video.title}>{video.title}</h1>
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
                          <div
                            key={v.id}
                            className={`flex items-center justify-between gap-1 px-3 py-2 text-sm hover:bg-bg-tertiary ${
                              v.id === videoId ? "text-primary font-medium" : ""
                            }`}
                          >
                            <button
                              onClick={() => {
                                setShowVersions(false);
                                if (v.id !== videoId) {
                                  router.push(`/projects/${projectId}/videos/${v.id}`);
                                }
                              }}
                              className="flex-1 text-left"
                            >
                              Phiên bản {v.versionNumber}
                              {v.id === videoId && <span className="ml-1 text-xs">(hiện tại)</span>}
                            </button>
                            {v.id !== videoId && v.status === "ready" && (
                              <button
                                onClick={() => {
                                  setShowVersions(false);
                                  setIsAnnotating(false);
                                  setCompareVersionId(v.id);
                                }}
                                className="px-2 py-0.5 text-xs rounded bg-bg-tertiary hover:bg-bg-hover text-text-secondary"
                                aria-label={`So sánh với phiên bản ${v.versionNumber}`}
                              >
                                So sánh
                              </button>
                            )}
                          </div>
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
        <div className="flex items-center gap-2 sm:gap-4">
          <UserPresence videoId={videoId} />
          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              active={showRightPanel && rightPanelTab === 'comments'}
              icon={<MessageSquare className="w-5 h-5" />}
              onClick={() => openRightPanelTab('comments')}
            >
              {comments.length}
            </Button>
            <Button
              variant="ghost"
              active={showRightPanel && rightPanelTab === 'export'}
              icon={<Download className="w-5 h-5" />}
              aria-label="Xuất XML"
              onClick={() => openRightPanelTab('export')}
            >
              <span className="hidden sm:inline">Xuất XML</span>
            </Button>
            <Button
              variant="ghost"
              icon={<Share2 className="w-5 h-5" />}
              aria-label="Chia sẻ"
              onClick={() => setShowShareLinks(true)}
            >
              <span className="hidden sm:inline">Chia sẻ</span>
            </Button>
            <Button
              variant="ghost"
              active={isAnnotating}
              disabled={!!compareVersion}
              aria-label="Vẽ chú thích trên video"
              title={compareVersion ? "Không khả dụng khi đang so sánh phiên bản" : "Vẽ chú thích trên video"}
              onClick={() => setIsAnnotating(!isAnnotating)}
            >
              <Pencil className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              aria-label="Phím tắt"
              title="Phím tắt (?)"
              onClick={() => setShowShortcuts(true)}
            >
              <Keyboard className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main content — stacked (video above, panel below) under `lg`; the
          panel needs real horizontal room for its controls, so side-by-side
          only kicks in once there's room for it rather than at a small `md`
          breakpoint. */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Video player area */}
        <div className="flex-1 flex flex-col min-h-[240px] lg:min-h-0 lg:min-w-0">
          <div className="flex-1 relative bg-black">
            {compareVersion ? (
              // Side-by-side version compare. Stacks on narrow screens — two
              // players next to each other need real horizontal room.
              <div className="absolute inset-0 flex flex-col sm:flex-row">
                <div className="flex-1 relative min-w-0 min-h-0 border-b sm:border-b-0 sm:border-r border-border">
                  <span className="absolute top-2 left-2 z-10 px-2 py-0.5 bg-black/70 text-white rounded text-xs">
                    v{video.versionNumber} (hiện tại)
                  </span>
                  {streamUrl && <VideoPlayer src={streamUrl} fps={video.fps} poster={posterUrl} />}
                </div>
                <div className="flex-1 relative min-w-0 min-h-0">
                  <span className="absolute top-2 left-2 z-10 px-2 py-0.5 bg-black/70 text-white rounded text-xs">
                    v{compareVersion.versionNumber}
                  </span>
                  <Button
                    variant="ghost"
                    aria-label="Thoát so sánh phiên bản"
                    title="Thoát so sánh"
                    className="absolute top-1 right-1 z-10 text-white hover:bg-white/20"
                    onClick={() => setCompareVersionId(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                  {compareStreamUrl ? (
                    <VideoPlayer src={compareStreamUrl} fps={compareVersion.fps} />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
              </div>
            ) : video.status === "ready" && streamUrl ? (
              <VideoPlayer
                src={streamUrl}
                fps={video.fps}
                onTimeUpdate={setCurrentTime}
                onPlayStateChange={setIsPlaying}
                seekTo={seekTarget ?? undefined}
                remotePlayback={remotePlayback ?? undefined}
                onUserPlay={handleUserPlay}
                onUserPause={handleUserPause}
              />
            ) : video.status === "failed" ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center px-6">
                  <p className="text-accent-red font-medium mb-1">Xử lý video thất bại</p>
                  <p className="text-text-secondary text-sm">Vui lòng thử tải lên lại.</p>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center w-64 max-w-[80%]">
                  <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-text-secondary mb-3">Đang xử lý video...</p>
                  {transcodeProgress !== null && (
                    <>
                      <div
                        className="h-1.5 w-full bg-bg-tertiary rounded-full overflow-hidden"
                        role="progressbar"
                        aria-valuenow={transcodeProgress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Tiến độ xử lý video"
                      >
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${transcodeProgress}%` }}
                        />
                      </div>
                      <p className="text-text-secondary text-xs mt-2">{transcodeProgress}%</p>
                    </>
                  )}
                </div>
              </div>
            )}
            {/* Annotations belong to a single video, so the canvas would sit
                ambiguously across both panes in compare mode. */}
            {!compareVersion && (
              <AnnotationCanvas
                isActive={isAnnotating}
                savedAnnotations={savedAnnotationsForCanvas}
                onAnnotationComplete={handleAnnotationComplete}
                onDeleteAnnotation={handleDeleteAnnotation}
              />
            )}
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

        {/* Right panel — one Tabs-driven panel instead of two independently
            toggled w-96 panels (which could both be open at once). Stacks
            full-width below the video under `lg`, sits beside it above that. */}
        {showRightPanel && (
          <div className="border-t lg:border-t-0 lg:border-l border-border flex flex-col h-64 lg:h-full w-full lg:w-96 shrink-0 overflow-hidden">
            <Tabs
              value={rightPanelTab}
              onValueChange={(v) => setRightPanelTab(v as 'comments' | 'export')}
              className="flex flex-col h-full min-h-0"
            >
              <TabsList>
                <TabsTrigger value="comments">Bình luận ({comments.length})</TabsTrigger>
                <TabsTrigger value="export">Xuất</TabsTrigger>
              </TabsList>
              {/* forceMount on both panels: switching tabs must not unmount
                  CommentPanel — it drops the in-progress typing-indicator
                  broadcast (no unmount cleanup) and any unsent draft text. */}
              <TabsContent value="comments" className="flex flex-col min-h-0" forceMount>
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
              </TabsContent>
              <TabsContent value="export" className="overflow-y-auto min-h-0" forceMount>
                <ExportPanel
                  video={video}
                  comments={comments}
                  onExportXml={handleExportXml}
                  onExportPdf={handleExportPdf}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      {showShareLinks && (
        <ShareLinkPanel videoId={videoId} onClose={() => setShowShareLinks(false)} />
      )}

      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Phím tắt</DialogTitle>
          </DialogHeader>
          <dl className="space-y-2 text-sm">
            {[
              ['Space', 'Phát / Tạm dừng'],
              ['←  →', 'Lùi / Tiến 1 khung hình'],
              ['Shift + ←  →', 'Lùi / Tiến 5 giây'],
              ['Home', 'Về đầu timeline'],
              ['End', 'Đến cuối timeline'],
              ['?', 'Mở bảng phím tắt này'],
            ].map(([key, desc]) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <dt className="text-text-secondary">{desc}</dt>
                <dd className="font-mono bg-bg-tertiary px-2 py-0.5 rounded text-xs">{key}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
