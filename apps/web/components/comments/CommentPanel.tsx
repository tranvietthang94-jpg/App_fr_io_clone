"use client";

import { useState } from "react";
import { useAuthStore } from "@/lib/stores/authStore";
import { formatTimestamp, formatRelativeTime } from "@/lib/utils";
import { Send, Trash2, MessageSquare, Clock } from "lucide-react";
import type { Comment } from "@fr-clone/shared";

interface CommentPanelProps {
  comments: Comment[];
  currentTime: number;
  onAddComment: (data: {
    content: string;
    timestamp: number;
    frameNumber: number;
    positionX?: number;
    positionY?: number;
  }) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onSeekToComment: (timestamp: number) => void;
}

export function CommentPanel({
  comments,
  currentTime,
  onAddComment,
  onDeleteComment,
  onSeekToComment,
}: CommentPanelProps) {
  const { user } = useAuthStore();
  const [newComment, setNewComment] = useState("");
  const [useCurrentTime, setUseCurrentTime] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    const fps = 30;
    await onAddComment({
      content: newComment,
      timestamp: useCurrentTime ? currentTime : 0,
      frameNumber: Math.floor((useCurrentTime ? currentTime : 0) * fps),
    });

    setNewComment("");
  };

  // Sort comments by timestamp
  const sortedComments = [...comments].sort((a, b) => a.timestamp - b.timestamp);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <h3 className="font-semibold flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          <span>Bình luận ({comments.length})</span>
        </h3>
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {sortedComments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Chưa có bình luận nào</p>
            <p className="text-sm">Tạm dừng video và nhấn vào video để thêm bình luận</p>
          </div>
        ) : (
          sortedComments.map((comment) => (
            <div
              key={comment.id}
              className="bg-secondary/50 rounded-lg p-3 hover:bg-secondary/70 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium">
                    {comment.user?.name?.charAt(0) || "U"}
                  </div>
                  <span className="text-sm font-medium">{comment.user?.name || "User"}</span>
                </div>
                <button
                  onClick={() => onDeleteComment(comment.id)}
                  className="p-1 hover:bg-destructive/10 rounded transition-colors"
                >
                  <Trash2 className="w-3 h-3 text-destructive" />
                </button>
              </div>

              <p className="text-sm mb-2">{comment.content}</p>

              <button
                onClick={() => onSeekToComment(comment.timestamp)}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Clock className="w-3 h-3" />
                <span>{formatTimestamp(comment.timestamp)}</span>
                {comment.frameNumber > 0 && (
                  <span className="text-muted-foreground">• Frame {comment.frameNumber}</span>
                )}
              </button>

              {comment.positionX !== undefined && comment.positionY !== undefined && (
                <p className="text-xs text-muted-foreground mt-1">
                  📍 Vị trí: {Math.round(comment.positionX)}%, {Math.round(comment.positionY)}%
                </p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add comment form */}
      <div className="p-4 border-t border-border">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={useCurrentTime}
                onChange={(e) => setUseCurrentTime(e.target.checked)}
                className="rounded"
              />
              <span className="text-muted-foreground">
                Tại thời điểm hiện tại ({formatTimestamp(currentTime)})
              </span>
            </label>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Nhập bình luận..."
              className="flex-1 px-3 py-2 bg-secondary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            />
            <button
              type="submit"
              disabled={!newComment.trim()}
              className="p-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}