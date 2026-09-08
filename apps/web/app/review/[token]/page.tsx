"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { publicReviewApi } from "@/lib/publicApi";
import { socketService } from "@/lib/socket";
import { formatTimecode, isCommentActive } from "@/lib/utils";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { Timeline } from "@/components/video/Timeline";
import { AnnotationCanvas } from "@/components/video/AnnotationCanvas";
import { CommentPanel } from "@/components/comments/CommentPanel";
import { ReviewStatusControl } from "@/components/video/ReviewStatusControl";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Lock, Film, Keyboard } from "lucide-react";
import { SharePermission, VideoReviewStatus, type Comment, type Annotation } from "@r-frame/shared";

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

interface GuestVideo {
  id: string;
  title: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  status: string;
  reviewStatus: VideoReviewStatus;
  versionNumber: number;
}

const COMMENTS_PAGE_SIZE = 30;
const EDIT_TOKENS_KEY_PREFIX = "fr_guest_edit_tokens_";
const IDENTITY_KEY = "fr_guest_identity";

function loadEditTokens(token: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(EDIT_TOKENS_KEY_PREFIX + token) || "{}");
  } catch {
    return {};
  }
}

function saveEditToken(token: string, commentId: string, editToken: string) {
  const map = loadEditTokens(token);
  map[commentId] = editToken;
  localStorage.setItem(EDIT_TOKENS_KEY_PREFIX + token, JSON.stringify(map));
}

function loadIdentity(): { name: string; email?: string } | null {
  try {
    return JSON.parse(localStorage.getItem(IDENTITY_KEY) || "null");
  } catch {
    return null;
  }
}

export default function GuestReviewPage() {
  const params = useParams();
  const token = params.token as string;

  const [video, setVideo] = useState<GuestVideo | null>(null);
  const [permission, setPermission] = useState<SharePermission | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [password, setPassword] = useState<string | undefined>(undefined);

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsOffset, setCommentsOffset] = useState(0);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [sortMode, setSortMode] = useState<"timecode" | "date">("timecode");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTarget, setSeekTarget] = useState<number | null>(null);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [pendingAnnotations, setPendingAnnotations] = useState<PendingAnnotation[]>([]);
  const [streamQuality, setStreamQuality] = useState("720p");

  const [identity, setIdentity] = useState<{ name: string; email?: string } | null>(null);
  const [identityPromptOpen, setIdentityPromptOpen] = useState(false);
  const [identityNameInput, setIdentityNameInput] = useState("");
  const [identityEmailInput, setIdentityEmailInput] = useState("");
  const pendingSubmitRef = useRef<null | (() => void)>(null);

  const [editTokens, setEditTokens] = useState<Record<string, string>>({});
  const [showShortcuts, setShowShortcuts] = useState(false);

  const canComment = permission === SharePermission.CAN_COMMENT;

  useEffect(() => {
    setIdentity(loadIdentity());
    setEditTokens(loadEditTokens(token));
  }, [token]);

  const loadVideo = async (withPassword?: string) => {
    try {
      const res = await publicReviewApi.get(token, withPassword);
      setVideo(res.data.video);
      setPermission(res.data.permission);
      setNeedsPassword(false);
    } catch (err: any) {
      if (err.response?.status === 401) {
        setNeedsPassword(true);
        if (withPassword) setPasswordError("Mật khẩu không đúng");
      } else {
        setNotFound(true);
      }
    }
  };

  const loadComments = async (opts?: { sort?: "timecode" | "date"; append?: boolean }) => {
    try {
      const sort = opts?.sort ?? sortMode;
      const offset = opts?.append ? commentsOffset : 0;
      const res = await publicReviewApi.getComments(token, { sort, offset, limit: COMMENTS_PAGE_SIZE }, password);
      const items = res.data.items;
      setComments((prev) => (opts?.append ? [...prev, ...items] : items));
      setCommentsOffset(offset + items.length);
      setHasMoreComments(res.data.nextOffset != null);
    } catch (err) {
      console.error("Failed to load comments:", err);
    }
  };

  const loadAnnotations = async () => {
    try {
      const res = await publicReviewApi.getAnnotations(token, password);
      setAnnotations(res.data);
    } catch (err) {
      console.error("Failed to load annotations:", err);
    }
  };

  useEffect(() => {
    if (!video) return;
    loadComments();
    loadAnnotations();

    socketService.connectAsGuest(token, identity?.name || "Khách");
    socketService.joinVideo(video.id);

    const handleNewComment = () => loadComments();
    socketService.on("comment:new", handleNewComment);

    return () => {
      socketService.off("comment:new", handleNewComment);
      socketService.leaveVideo();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.id]);

  useEffect(() => {
    loadVideo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const applySeek = (timestamp: number) => {
    setSeekTarget(timestamp);
    setTimeout(() => setSeekTarget(null), 100);
  };

  // Same '?' shortcuts cheat-sheet as the authenticated review page — the
  // VideoPlayer/Timeline keyboard shortcuts work here too (shared component).
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

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPassword(passwordInput);
    loadVideo(passwordInput);
  };

  const requireIdentity = (onReady: () => void) => {
    if (identity) {
      onReady();
      return;
    }
    pendingSubmitRef.current = onReady;
    setIdentityPromptOpen(true);
  };

  const handleIdentitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!identityNameInput.trim()) return;
    const next = { name: identityNameInput.trim(), email: identityEmailInput.trim() || undefined };
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(next));
    setIdentity(next);
    setIdentityPromptOpen(false);
    const cb = pendingSubmitRef.current;
    pendingSubmitRef.current = null;
    cb?.();
  };

  const handleAddComment = (data: { content: string; timestamp: number; frameNumber: number; endTimestamp?: number; parentId?: string }) => {
    requireIdentity(async () => {
      try {
        const currentIdentity = loadIdentity();
        if (!currentIdentity) return;
        const res = await publicReviewApi.addComment(
          token,
          {
            guestName: currentIdentity.name,
            guestEmail: currentIdentity.email,
            content: data.content,
            timestamp: data.timestamp,
            frameNumber: data.frameNumber,
            endTimestamp: data.endTimestamp,
            parentId: data.parentId,
          },
          password,
        );
        if (res.data.guestEditToken) {
          saveEditToken(token, res.data.id, res.data.guestEditToken);
          setEditTokens(loadEditTokens(token));
        }

        if (!data.parentId && pendingAnnotations.length > 0) {
          for (const pending of pendingAnnotations) {
            try {
              await publicReviewApi.addAnnotation(
                token,
                res.data.id,
                {
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
                },
                password,
              );
            } catch (err) {
              console.error("Failed to save annotation:", err);
            }
          }
          setPendingAnnotations([]);
          setIsAnnotating(false);
          await loadAnnotations();
        }

        await loadComments();
      } catch (err) {
        console.error("Failed to add comment:", err);
      }
    });
  };

  const handleEditComment = async (commentId: string, content: string) => {
    const editToken = editTokens[commentId];
    if (!editToken) return;
    try {
      await publicReviewApi.editComment(token, commentId, editToken, content, password);
      await loadComments();
    } catch (err) {
      console.error("Failed to edit comment:", err);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    const editToken = editTokens[commentId];
    if (!editToken) return;
    try {
      await publicReviewApi.deleteComment(token, commentId, editToken, password);
      await loadComments();
    } catch (err) {
      console.error("Failed to delete comment:", err);
    }
  };

  const handleReviewStatusChange = (status: VideoReviewStatus) => {
    requireIdentity(async () => {
      try {
        await publicReviewApi.setReviewStatus(token, status, password);
        setVideo((prev) => (prev ? { ...prev, reviewStatus: status } : prev));
      } catch (err) {
        console.error("Failed to update review status:", err);
      }
    });
  };

  const handleUserSeek = (timestamp: number) => {
    applySeek(timestamp);
  };

  const handleAnnotationComplete = (data: PendingAnnotation) => {
    setPendingAnnotations((prev) => [...prev, data]);
  };

  const activeCommentId = useMemo(
    () => comments.find((c) => isCommentActive(c.timestamp, currentTime, c.endTimestamp))?.id,
    [comments, currentTime]
  );
  const savedAnnotationsForCanvas = useMemo(
    () =>
      annotations
        .filter((a) => a.commentId === activeCommentId)
        .map((a) => {
          const data = a.data as unknown as Omit<PendingAnnotation, "type">;
          return { id: a.id, type: a.type, ...data };
        }),
    [annotations, activeCommentId]
  );

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary text-text-primary">
        <div className="text-center">
          <Film className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h1 className="text-xl font-semibold mb-2">Liên kết không tồn tại hoặc đã hết hạn</h1>
          <p className="text-text-secondary">Vui lòng liên hệ người đã chia sẻ để lấy liên kết mới.</p>
        </div>
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary text-text-primary">
        <form onSubmit={handlePasswordSubmit} className="w-full max-w-sm p-6 bg-bg-secondary border border-border rounded-lg space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-accent-blue" />
            <h1 className="font-semibold">Liên kết yêu cầu mật khẩu</h1>
          </div>
          <Input
            type="password"
            placeholder="Nhập mật khẩu"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            error={passwordError}
            autoFocus
          />
          <Button type="submit" className="w-full">
            Xem video
          </Button>
        </form>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary text-text-secondary">
        Đang tải...
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-bg-primary text-text-primary">
      <div className="flex flex-wrap items-center justify-between gap-y-2 px-3 sm:px-6 py-3 sm:py-4 border-b border-border">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-semibold truncate max-w-[60vw] sm:max-w-none" title={video.title}>{video.title}</h1>
            <ReviewStatusControl
              status={video.reviewStatus}
              readOnly={!canComment}
              onChange={canComment ? handleReviewStatusChange : undefined}
            />
          </div>
          <p className="text-sm text-text-secondary">
            {formatTimecode(video.duration, video.fps)} • {video.width}x{video.height}
          </p>
        </div>
        <Button
          variant="ghost"
          aria-label="Phím tắt"
          title="Phím tắt (?)"
          onClick={() => setShowShortcuts(true)}
        >
          <Keyboard className="w-5 h-5" />
        </Button>
      </div>

      {/* Below `lg`: panel stacks under the video instead of beside it — same
          breakpoint as the authenticated review page (VideoPlayer's control
          bar needs the room). Only one panel here (comments), so no Tabs
          needed like the authenticated page's comments/export split. */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        <div className="flex-1 flex flex-col min-h-[240px] lg:min-h-0 lg:min-w-0">
          <div className="flex-1 relative bg-black">
            {video.status === "ready" ? (
              <VideoPlayer
                src={publicReviewApi.streamUrl(token, streamQuality)}
                fps={video.fps}
                onTimeUpdate={setCurrentTime}
                seekTo={seekTarget ?? undefined}
                quality={streamQuality}
                onQualityChange={setStreamQuality}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-text-secondary">Video đang được xử lý...</p>
              </div>
            )}
            <AnnotationCanvas
              isActive={isAnnotating && canComment}
              savedAnnotations={savedAnnotationsForCanvas}
              onAnnotationComplete={handleAnnotationComplete}
            />
          </div>
          <Timeline duration={video.duration} currentTime={currentTime} comments={comments} fps={video.fps} onSeek={handleUserSeek} />
        </div>

        <div className="border-t lg:border-t-0 lg:border-l border-border flex flex-col h-64 lg:h-full w-full lg:w-96 shrink-0 overflow-hidden">
          <CommentPanel
            comments={comments}
            currentTime={currentTime}
            fps={video.fps}
            members={[]}
            sortMode={sortMode}
            onSortChange={(mode) => {
              setSortMode(mode);
              loadComments({ sort: mode });
            }}
            hasMore={hasMoreComments}
            onLoadMore={() => loadComments({ append: true })}
            onAddComment={canComment ? handleAddComment : undefined}
            onEditComment={canComment ? handleEditComment : undefined}
            onDeleteComment={canComment ? handleDeleteComment : undefined}
            onSeekToComment={handleUserSeek}
            canModifyComment={(comment) => !!editTokens[comment.id]}
            annotating={isAnnotating}
            onToggleAnnotate={canComment ? () => setIsAnnotating((v) => !v) : undefined}
          />
        </div>
      </div>

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

      <Dialog open={identityPromptOpen} onOpenChange={setIdentityPromptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Giới thiệu bản thân</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleIdentitySubmit} className="space-y-4">
            <Input
              label="Tên của bạn"
              value={identityNameInput}
              onChange={(e) => setIdentityNameInput(e.target.value)}
              autoFocus
              required
            />
            <Input
              label="Email (tùy chọn)"
              type="email"
              value={identityEmailInput}
              onChange={(e) => setIdentityEmailInput(e.target.value)}
            />
            <DialogFooter>
              <Button type="submit">Tiếp tục</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
