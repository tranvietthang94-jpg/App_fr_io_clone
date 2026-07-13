import React, { useState, useRef, useEffect } from 'react';
import { cn, formatTimecode, getFrameNumber, isCommentActive } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { MessageSquare, Send, MoreVertical, Edit2, Trash2 } from 'lucide-react';
import type { Comment } from '@fr-clone/shared';

interface CommentPanelProps {
  comments: Comment[];
  currentTime: number;
  fps?: number;
  onAddComment: (data: {
    content: string;
    timestamp: number;
    frameNumber: number;
  }) => void;
  onDeleteComment: (commentId: string) => void;
  onEditComment: (commentId: string, content: string) => void;
  onSeekToComment: (timestamp: number) => void;
  onTyping?: (isTyping: boolean) => void;
}

export const CommentPanel: React.FC<CommentPanelProps> = ({
  comments,
  currentTime,
  fps = 30,
  onAddComment,
  onDeleteComment,
  onEditComment,
  onSeekToComment,
  onTyping,
}) => {
  const [newComment, setNewComment] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [hoveredComment, setHoveredComment] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const commentsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onTyping?.(isTyping);
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
      onEditComment(commentId, editContent.trim());
    }
    cancelEditing();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    onAddComment({
      content: newComment,
      timestamp: currentTime,
      frameNumber: getFrameNumber(currentTime, fps),
    });

    setNewComment('');
    setIsTyping(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewComment(e.target.value);
    setIsTyping(e.target.value.length > 0);
  };

  return (
    <div className="flex flex-col h-full bg-bg-secondary">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-accent-blue" />
          <h3 className="font-semibold text-text-primary">Comments</h3>
          <span className="text-sm text-text-secondary">({comments.length})</span>
        </div>
      </div>

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare className="w-12 h-12 text-text-muted mb-3" />
            <p className="text-text-secondary text-sm">No comments yet</p>
            <p className="text-text-muted text-xs mt-1">
              Pause the video and add a comment
            </p>
          </div>
        ) : (
          comments.map((comment) => (
            <div
              key={comment.id}
              className={cn(
                'group relative bg-bg-primary rounded-lg p-3 transition-all',
                isCommentActive(comment.timestamp, currentTime) && 'ring-2 ring-accent-blue bg-accent-blue/5'
              )}
              onMouseEnter={() => setHoveredComment(comment.id)}
              onMouseLeave={() => setHoveredComment(null)}
            >
              {/* Comment Header */}
              <div className="flex items-start gap-2 mb-2">
                <Avatar
                  name={comment.user?.name || 'User'}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-text-primary">
                      {comment.user?.name || 'User'}
                    </span>
                    <button
                      onClick={() => onSeekToComment(comment.timestamp)}
                      className="text-xs text-accent-blue hover:text-blue-400 font-mono"
                    >
                      {formatTimecode(comment.timestamp, fps)}
                    </button>
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">
                    Frame {comment.frameNumber}
                  </p>
                </div>

                {/* Actions */}
                {hoveredComment === comment.id && editingCommentId !== comment.id && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-1 h-auto text-text-secondary hover:text-text-primary"
                      onClick={() => startEditing(comment)}
                    >
                      <Edit2 className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-1 h-auto text-text-secondary hover:text-accent-red"
                      onClick={() => onDeleteComment(comment.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Comment Content */}
              {editingCommentId === comment.id ? (
                <div className="space-y-2">
                  <Input
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    autoFocus
                  />
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
                <p className="text-sm text-text-primary leading-relaxed">
                  {comment.content}
                </p>
              )}

              {/* Replies */}
              {comment.replies && comment.replies.length > 0 && (
                <div className="mt-3 pl-4 border-l-2 border-border space-y-2">
                  {comment.replies.map((reply) => (
                    <div key={reply.id} className="flex items-start gap-2">
                      <Avatar name={reply.user?.name || 'User'} size="sm" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-text-primary">
                            {reply.user?.name || 'User'}
                          </span>
                          <span className="text-xs text-text-muted">
                            {formatTimecode(reply.timestamp, fps)}
                          </span>
                        </div>
                        <p className="text-sm text-text-primary mt-1">
                          {reply.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={commentsEndRef} />
      </div>

      {/* Add Comment Form */}
      <div className="border-t border-border p-4">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Input
            value={newComment}
            onChange={handleInputChange}
            placeholder="Add a comment..."
            className="flex-1"
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!newComment.trim()}
            className="px-3"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
        {isTyping && (
          <p className="text-xs text-text-muted mt-2">
            Comment will be added at {formatTimecode(currentTime, fps)}
          </p>
        )}
      </div>
    </div>
  );
};