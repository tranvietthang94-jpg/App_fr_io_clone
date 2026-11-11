import { io, Socket } from 'socket.io-client';
import { useAuthStore } from './stores/authStore';
import { api } from './api';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<(...args: any[]) => void>> = new Map();
  // The video room to (re)join whenever the socket connects. joinVideo() is
  // often called right after connect(), before the socket is actually up — the
  // emit() guard would drop that join. Re-emitting on 'connect' makes room
  // membership survive the cold-start race and any later reconnection.
  private currentVideoId: string | null = null;
  private reauthenticating = false;
  private lastReauthAt = 0;

  constructor() {
    // Logout (manual, or forced after a failed refresh) must not leave an
    // authenticated socket receiving project events.
    useAuthStore.subscribe((state, prev) => {
      if (prev.accessToken && !state.accessToken) this.disconnect();
    });
  }

  connect() {
    const token = useAuthStore.getState().accessToken;
    if (!token) {
      console.warn('Cannot connect socket: no token');
      return;
    }
    // Read lazily so every (re)connect handshake carries the CURRENT token.
    this.openSocket(() => ({ token: useAuthStore.getState().accessToken ?? '' }), true);
  }

  /** Guest path for the public share-link review page — no account, no accessToken. */
  connectAsGuest(shareToken: string, guestName: string, sharePassword?: string) {
    this.openSocket(() => (sharePassword ? { shareToken, guestName, sharePassword } : { shareToken, guestName }), false);
  }

  /**
   * The server drops a JWT socket when its token expires or the user's
   * sessions are revoked, and socket.io doesn't retry a server-initiated
   * disconnect. Any authenticated request goes through the api.ts 401
   * interceptor, which refreshes an expired token once (shared in-flight, so
   * no double refresh-token rotation) or logs out; then reconnect with the
   * fresh token.
   */
  private reauthenticate() {
    // 2s guard: never hammer the API if the server keeps rejecting this socket.
    if (this.reauthenticating || Date.now() - this.lastReauthAt < 2000) return;
    this.reauthenticating = true;
    this.lastReauthAt = Date.now();
    api
      .get('/api/auth/me')
      .then(() => this.connect())
      .catch(() => {})
      .finally(() => {
        this.reauthenticating = false;
      });
  }

  private openSocket(getAuth: () => Record<string, string | undefined>, isAuthenticated: boolean) {
    if (this.socket?.connected) {
      return;
    }

    if (this.socket) {
      // Existing socket never connected (or reconnection attempts were
      // exhausted after a drop) — drop it and open a fresh connection with
      // the current auth instead of blocking forever.
      this.socket.disconnect();
      this.socket = null;
    }

    this.socket = io(`${SOCKET_URL}/collaboration`, {
      auth: (cb) => cb(getAuth()),
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      // Rejoin the active video room — covers both the initial connect (when
      // joinVideo was called pre-connection) and reconnects after a drop.
      if (this.currentVideoId) {
        this.socket?.emit('join:video', { videoId: this.currentVideoId });
      }
    });

    this.socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect' && isAuthenticated) this.reauthenticate();
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
    this.currentVideoId = videoId;
    this.emit('join:video', { videoId });
  }

  leaveVideo() {
    this.currentVideoId = null;
    this.emit('leave:video', {});
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

  sendCommentReaction(videoId: string, commentId: string) {
    this.emit('comment:reaction', { videoId, commentId });
  }
}

export const socketService = new SocketService();