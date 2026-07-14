import { io, Socket } from 'socket.io-client';
import { useAuthStore } from './stores/authStore';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<(...args: any[]) => void>> = new Map();

  connect() {
    const token = useAuthStore.getState().accessToken;
    if (!token) {
      console.warn('Cannot connect socket: no token');
      return;
    }

    if (this.socket?.connected) {
      return;
    }

    if (this.socket) {
      // Existing socket never connected (or reconnection attempts were
      // exhausted after a drop) — drop it and open a fresh connection with
      // the current token instead of blocking forever.
      this.socket.disconnect();
      this.socket = null;
    }

    this.socket = io(`${SOCKET_URL}/collaboration`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket?.id);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    // Re-attach all listeners
    this.listeners.forEach((callbacks, event) => {
      callbacks.forEach((callback) => {
        this.socket?.on(event, callback);
      });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  on(event: string, callback: (...args: any[]) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event: string, callback: (...args: any[]) => void) {
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.delete(callback);
    }
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  emit(event: string, data: any) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    }
  }

  // Collaboration methods
  joinVideo(videoId: string) {
    this.emit('join:video', { videoId });
  }

  leaveVideo() {
    this.emit('leave:video', {});
  }

  sendComment(videoId: string, content: string, timestamp: number, frameNumber: number) {
    this.emit('comment:new', { videoId, content, timestamp, frameNumber });
  }

  sendTyping(videoId: string, isTyping: boolean) {
    this.emit('comment:typing', { videoId, isTyping });
  }

  sendVideoSeek(videoId: string, timestamp: number) {
    this.emit('video:seek', { videoId, timestamp });
  }

  sendVideoPlay(videoId: string, timestamp: number) {
    this.emit('video:play', { videoId, timestamp });
  }

  sendVideoPause(videoId: string, timestamp: number) {
    this.emit('video:pause', { videoId, timestamp });
  }

  sendCommentResolved(videoId: string, commentId: string, resolved: boolean) {
    this.emit('comment:resolved', { videoId, commentId, resolved });
  }

  sendCommentReaction(videoId: string, commentId: string) {
    this.emit('comment:reaction', { videoId, commentId });
  }
}

export const socketService = new SocketService();