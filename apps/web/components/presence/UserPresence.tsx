"use client";

import { useEffect, useState } from 'react';
import { socketService } from '@/lib/socket';

interface UserPresenceProps {
  videoId: string;
}

interface User {
  userId: string;
  username: string;
}

export function UserPresence({ videoId }: UserPresenceProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Room join/leave is owned by the parent VideoReviewPage (it owns the
    // socket connection lifecycle); this component only listens for presence.
    // Listen for room users
    const handleRoomUsers = (usersList: User[]) => {
      setUsers(usersList);
    };

    // Listen for user joined
    const handleUserJoined = (user: User) => {
      setUsers((prev) => {
        if (prev.find((u) => u.userId === user.userId)) {
          return prev;
        }
        return [...prev, user];
      });
    };

    // Listen for user left
    const handleUserLeft = (user: User) => {
      setUsers((prev) => prev.filter((u) => u.userId !== user.userId));
      setTypingUsers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(user.username);
        return newSet;
      });
    };

    // Listen for typing
    const handleTyping = (data: { username: string; isTyping: boolean }) => {
      setTypingUsers((prev) => {
        const newSet = new Set(prev);
        if (data.isTyping) {
          newSet.add(data.username);
        } else {
          newSet.delete(data.username);
        }
        return newSet;
      });
    };

    socketService.on('room:users', handleRoomUsers);
    socketService.on('user:joined', handleUserJoined);
    socketService.on('user:left', handleUserLeft);
    socketService.on('comment:typing', handleTyping);

    // Cleanup
    return () => {
      socketService.off('room:users', handleRoomUsers);
      socketService.off('user:joined', handleUserJoined);
      socketService.off('user:left', handleUserLeft);
      socketService.off('comment:typing', handleTyping);
    };
  }, [videoId]);

  if (users.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {/* Avatar stack */}
      <div className="flex -space-x-2">
        {users.slice(0, 5).map((user) => (
          <div
            key={user.userId}
            className="w-8 h-8 rounded-full bg-primary/20 border-2 border-bg-primary flex items-center justify-center text-xs font-semibold text-primary"
            title={user.username}
          >
            {user.username.charAt(0).toUpperCase()}
          </div>
        ))}
        {users.length > 5 && (
          <div className="w-8 h-8 rounded-full bg-bg-tertiary border-2 border-bg-primary flex items-center justify-center text-xs font-semibold text-text-secondary">
            +{users.length - 5}
          </div>
        )}
      </div>

      {/* Online count — polite live region so join/leave changes reach screen readers */}
      <span className="text-sm text-text-secondary" role="status" aria-live="polite">
        {users.length} online
      </span>

      {/* Typing indicator — was purely visual (socket-driven, no text alternative) */}
      {typingUsers.size > 0 && (
        <div className="flex items-center gap-1 text-xs text-text-secondary ml-2" role="status" aria-live="polite">
          <div className="flex gap-0.5" aria-hidden="true">
            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span>
            {Array.from(typingUsers).join(', ')} đang nhập...
          </span>
        </div>
      )}
    </div>
  );
}