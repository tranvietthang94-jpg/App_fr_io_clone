import React, { useState, useEffect } from 'react';
import { cn, formatTimecode, getFrameNumber, isCommentActive } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { MentionInput, MentionMember, serializeMentions } from './MentionInput';
import { MessageSquare, Send, Edit2, Trash2, CheckCircle2, Circle, Smile, Reply, ArrowUpDown, Pencil } from 'lucide-react';
import type { Comment } from '@r-frame/shared';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '👀'];
const MENTION_TOKEN_RE = /@\[([0-9a-fA-F-]{36})\]/g;

interface CommentPanelProps {
  comments: Comment[];
  currentTime: number;
  fps?: number;
  currentUserId?: string;
  members: MentionMember[];
  sortMode: 'timecode' | 'date';
  onSortChange: (mode: 'timecode' | 'date') => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onAddComment?: (data: {
    content: string;
    timestamp: number;
    frameNumber: number;
    endTimestamp?: number;
    parentId?: string;
  }) => void;
  onDeleteComment?: (commentId: string) => void;
  onEditComment?: (commentId: string, content: string) => void;
  onResolveComment?: (commentId: string, resolved: boolean) => void;
  onReactToComment?: (commentId: string, emoji: string) => void;
  onSeekToComment: (timestamp: number) => void;
  onTyping?: (isTyping: boolean) => void;
  canModifyComment?: (comment: Comment) => boolean;
  annotating?: boolean;
  onToggleAnnotate?: () => void;
  annotateDisabled?: boolean;
}

function renderContent(content: string, members: MentionMember[]) {
  const nameById = new Map(members.map((m) => [m.userId, m.name]));
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  MENTION_TOKEN_RE.lastIndex = 0;
  let key = 0;
  while ((match = MENTION_TOKEN_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    const name = nameById.get(match[1]) || 'user';
    parts.push(
      <span key={`mention-${key++}`} className="text-accent-green font-medium">
        @{name}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }
  return parts;
}

function groupReactions(reactions: Comment['reactions'], currentUserId?: string) {
  const groups = new Map<string, { count: number; reactedByMe: boolean }>();
  (reactions || []).forEach((r) => {
    const g = groups.get(r.emoji) || { count: 0, reactedByMe: false };
    g.count += 1;
    if (r.userId === currentUserId) g.reactedByMe = true;
    groups.set(r.emoji, g);
  });
  return Array.from(groups.entries()).map(([emoji, g]) => ({ emoji, ...g }));
}

export const CommentPanel: React.FC<CommentPanelProps> = ({
  comments,
  currentTime,
  fps = 30,
  currentUserId,
  members,
  sortMode,
  onSortChange,
  hasMore,
  onLoadMore,
  onAddComment,
  onDeleteComment,
  onEditComment,
  onResolveComment,
  onReactToComment,
  onSeekToComment,
  onTyping,
  canModifyComment,
  annotating,
  onToggleAnnotate,
  annotateDisabled,
}) => {
  const [newComment, setNewComment] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [rangeIn, setRangeIn] = useState<number | null>(null);
  const [rangeOut, setRangeOut] = useState<number | null>(null);
  const mentionMapRef = React.useRef<Map<string, string>>(new Map());
  const replyMentionMapRef = React.useRef<Map<string, string>>(new Map());

  useEffect(() => {
    onTyping?.(isTyping);
    // If the panel unmounts (tab switch, closing the panel) while isTyping
    // is still true, this effect never re-runs to send the false — tell
    // collaborators typing stopped so the indicator doesn't stick.
    return () => onTyping?.(false);
  }, [isTyping]);

  const startEditing = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditContent(comment.content);
  };

  const cancelEditing = () => {
    setEditingCommentId(null);
    setEditContent('');
  };

  const saveEditing = (commentId: string) => {
    if (editContent.trim()) {
      onEditComment?.(commentId, editContent.trim());
    }
    cancelEditing();
  };

  const submitNewComment = () => {
    if (!newComment.trim()) return;

    const timestamp = rangeIn ?? currentTime;
    const endTimestamp =
      rangeOut != null && rangeOut > timestamp ? rangeOut : undefined;

    onAddComment?.({
      content: serializeMentions(newComment, mentionMapRef.current),
      timestamp,
      frameNumber: getFrameNumber(timestamp, fps),
      endTimestamp,
    });

    setNewComment('');
    setRangeIn(null);
    setRangeOut(null);
    mentionMapRef.current = new Map();
    setIsTyping(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitNewComment();
  };

  const submitReply = (parentId: string) => {
    if (!replyContent.trim()) return;
    onAddComment?.({
      content: serializeMentions(replyContent, replyMentionMapRef.current),
      timestamp: currentTime,
      frameNumber: getFrameNumber(currentTime, fps),
      parentId,
    });
    setReplyContent('');
    replyMentionMapRef.current = new Map();
    setReplyingTo(null);
  };

  const handleInputChange = (value: string) => {
    setNewComment(value);
    setIsTyping(value.length > 0);
  };

  return (
    <div className="flex flex-col h-full bg-bg-secondary">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-accent-green" />
          <h3 className="font-semibold text-text-primary">Bình luận</h3>
          <span className="text-sm text-text-secondary">({comments.length})</span>
        </div>
        <button
          onClick={() => onSortChange(sortMode === 'timecode' ? 'date' : 'timecode')}
          className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
          title="Đổi thứ tự sắp xếp"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          {sortMode === 'timecode' ? 'Theo thời gian video' : 'Theo ngày đăng'}
        </button>
      </div>

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare className="w-12 h-12 text-text-muted mb-3" />
            <p className="text-text-secondary text-sm">Chưa có bình luận nào</p>
            <p className="text-text-muted text-xs mt-1">
              Tạm dừng video để thêm bình luận
            </p>
          </div>
        ) : (
          comments.map((comment) => {
            const reactionGroups = groupReactions(comment.reactions, currentUserId);
            const isAuthor = comment.userId === currentUserId;
            const canEdit = isAuthor || (canModifyComment?.(comment) ?? false);
            const canDelete = canModifyComment ? canModifyComment(comment) : true;
            return (
              <div
                key={comment.id}
                className={cn(
                  'group relative bg-bg-primary rounded-lg p-3 transition-all cursor-pointer',
                  comment.resolved && 'opacity-60',
                  !comment.resolved && isCommentActive(comment.timestamp, currentTime, comment.endTimestamp) && 'ring-1 ring-accent-green/60 bg-accent-green/5'
                )}
                onClick={(e) => {
                  // Click anywhere on the card jumps the video to this
                  // comment — except on interactive children (reply/edit/
                  // delete/reaction buttons, mentions, the timecode button,
                  // which handle their own clicks) or when the user is
                  // selecting text to copy.
                  if (window.getSelection()?.toString()) return;
                  const target = e.target as HTMLElement;
                  if (target.closest('button, a, input, textarea, select, form, [role="menu"]')) return;
                  onSeekToComment(comment.timestamp);
                }}
                title="Bấm để nhảy đến vị trí này trong video"
              >
                {/* Comment Header */}
                <div className="flex items-start gap-2 mb-2">
                  <Avatar name={comment.user?.name || comment.guestName || 'User'} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-text-primary">
                        {comment.user?.name || comment.guestName || 'User'}
                      </span>
                      <button
                        onClick={() => onSeekToComment(comment.timestamp)}
                        className="text-xs text-accent-green hover:text-emerald-300 font-mono"
                      >
                        {formatTimecode(comment.timestamp, fps)}
                        {comment.endTimestamp != null && comment.endTimestamp > comment.timestamp
                          ? ` – ${formatTimecode(comment.endTimestamp, fps)}`
                          : ''}
                      </button>
                      {comment.sequenceNumber != null && (
                        <span className="text-xs text-text-muted">#{comment.sequenceNumber}</span>
                      )}
                      <span
                        className={cn(
                          'ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                          comment.resolved
                            ? 'bg-accent-green/10 text-accent-green'
                            : 'bg-accent-red/10 text-accent-red'
                        )}
                      >
                        {comment.resolved ? 'Đã duyệt' : 'Cần sửa'}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">
                      Frame {comment.frameNumber}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {onResolveComment && (
                      <button
                        onClick={() => onResolveComment(comment.id, !comment.resolved)}
                        aria-label={comment.resolved ? 'Mở lại bình luận' : 'Đánh dấu đã xử lý'}
                        title={comment.resolved ? 'Mở lại' : 'Đánh dấu đã xử lý'}
                        className={cn(
                          'p-1 h-auto',
                          comment.resolved ? 'text-accent-green' : 'text-text-secondary hover:text-accent-green'
                        )}
                      >
                        {comment.resolved ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                      </button>
                    )}
                    {editingCommentId !== comment.id && (
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        {onReactToComment && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                aria-label="Bày tỏ cảm xúc"
                                className="p-1 h-auto text-text-secondary hover:text-text-primary"
                                title="Bày tỏ cảm xúc"
                              >
                                <Smile className="w-3.5 h-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="flex w-fit min-w-0 items-center gap-1">
                              {REACTION_EMOJIS.map((emoji) => (
                                <DropdownMenuItem
                                  key={emoji}
                                  onSelect={() => onReactToComment(comment.id, emoji)}
                                  className="justify-center px-1.5 text-base"
                                >
                                  {emoji}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                        {onAddComment && (
                          <button
                            onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                            aria-label="Trả lời"
                            className="p-1 h-auto text-text-secondary hover:text-text-primary"
                            title="Trả lời"
                          >
                            <Reply className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {onEditComment && canEdit && (
                          <button
                            onClick={() => startEditing(comment)}
                            aria-label="Sửa bình luận"
                            className="p-1 h-auto text-text-secondary hover:text-text-primary"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}
                        {onDeleteComment && canDelete && (
                          <button
                            onClick={() => onDeleteComment(comment.id)}
                            aria-label="Xóa bình luận"
                            className="p-1 h-auto text-text-secondary hover:text-accent-red"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Comment Content */}
                {editingCommentId === comment.id ? (
                  <div className="space-y-2">
                    <MentionInput value={editContent} onChange={setEditContent} members={members} autoFocus />
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="primary" onClick={() => saveEditing(comment.id)}>
                        Lưu
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEditing}>
                        Hủy
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
                    {renderContent(comment.content, members)}
                  </p>
                )}

                {reactionGroups.length > 0 && (
                  <div className="flex items-center gap-1 mt-2">
                    {reactionGroups.map((g) => (
                      <button
                        key={g.emoji}
                        onClick={() => onReactToComment?.(comment.id, g.emoji)}
                        disabled={!onReactToComment}
                        className={cn(
                          'text-xs px-1.5 py-0.5 rounded-full border flex items-center gap-1',
                          g.reactedByMe ? 'border-accent-green bg-accent-green/10' : 'border-border bg-bg-tertiary'
                        )}
                      >
                        <span>{g.emoji}</span>
                        <span>{g.count}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Replies */}
                {comment.replies && comment.replies.length > 0 && (
                  <div className="mt-3 pl-4 border-l-2 border-border space-y-2">
                    {comment.replies.map((reply) => (
                      <div key={reply.id} className="flex items-start gap-2">
                        <Avatar name={reply.user?.name || reply.guestName || 'User'} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-text-primary">
                              {reply.user?.name || reply.guestName || 'User'}
                            </span>
                          </div>
                          <p className="text-sm text-text-primary mt-1 whitespace-pre-wrap">
                            {renderContent(reply.content, members)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply composer */}
                {onAddComment && replyingTo === comment.id && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      submitReply(comment.id);
                    }}
                    className="mt-3 pl-4 flex items-center gap-2"
                  >
                    <MentionInput
                      value={replyContent}
                      onChange={setReplyContent}
                      onMentionAdded={(name, userId) => replyMentionMapRef.current.set(name, userId)}
                      members={members}
                      placeholder="Trả lời..."
                      onEnter={() => submitReply(comment.id)}
                      autoFocus
                    />
                    <Button type="submit" size="sm" variant="primary" disabled={!replyContent.trim()}>
                      <Send className="w-4 h-4" />
                    </Button>
                  </form>
                )}
              </div>
            );
          })
        )}
        {hasMore && (
          <button
            onClick={onLoadMore}
            className="w-full py-2 text-sm text-accent-green hover:underline"
          >
            Tải thêm bình luận
          </button>
        )}
      </div>

      {/* Add Comment Form */}
      {onAddComment && (
        <div className="border-t border-border p-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            {(() => {
              const inTime = rangeIn ?? currentTime;
              const hasOut = rangeOut != null && rangeOut > inTime;
              return (
                <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                  <span className="inline-block h-3.5 w-3.5 rounded border border-accent-green bg-accent-green/30" aria-hidden />
                  <span className="font-mono">
                    Ghim {formatTimecode(inTime, fps)}
                    {hasOut ? ` – ${formatTimecode(rangeOut, fps)}` : ''}
                  </span>
                  <button
                    type="button"
                    className="rounded border border-border px-1.5 py-0.5 hover:text-text-primary"
                    onClick={() => {
                      setRangeIn(currentTime);
                      if (rangeOut != null && rangeOut <= currentTime) setRangeOut(null);
                    }}
                  >
                    Đặt In
                  </button>
                  <button
                    type="button"
                    className="rounded border border-border px-1.5 py-0.5 hover:text-text-primary disabled:opacity-40"
                    disabled={rangeIn != null && currentTime <= rangeIn}
                    onClick={() => {
                      const start = rangeIn ?? currentTime;
                      if (currentTime > start) {
                        if (rangeIn == null) setRangeIn(start);
                        setRangeOut(currentTime);
                      }
                    }}
                  >
                    Đặt Out
                  </button>
                  {hasOut && (
                    <button
                      type="button"
                      className="text-text-muted hover:text-text-primary"
                      onClick={() => setRangeOut(null)}
                    >
                      Xóa Out
                    </button>
                  )}
                </div>
              );
            })()}
            {onToggleAnnotate && (
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  active={!!annotating}
                  disabled={annotateDisabled}
                  aria-label="Vẽ chú thích trên video"
                  title={annotateDisabled ? "Không khả dụng khi đang so sánh phiên bản" : "Vẽ chú thích trên video"}
                  className="w-fit"
                  onClick={onToggleAnnotate}
                >
                  <Pencil className="w-4 h-4 mr-1.5" />
                  Vẽ chú thích
                </Button>
                <div id="comment-annotate-toolbar" />
              </div>
            )}
            <div className="flex items-center gap-2">
              <MentionInput
                value={newComment}
                onChange={handleInputChange}
                onMentionAdded={(name, userId) => mentionMapRef.current.set(name, userId)}
                members={members}
                placeholder="Viết nhận xét..."
                onEnter={submitNewComment}
              />
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={!newComment.trim()}
                className="px-3"
              >
                Gửi
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
