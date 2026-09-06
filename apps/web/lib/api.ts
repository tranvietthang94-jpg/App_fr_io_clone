import axios from 'axios';
import { useAuthStore } from './stores/authStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Needed so the httpOnly refresh-token cookie is sent/received cross-port (3000 <-> 4000).
  withCredentials: true,
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: on a 401 from an authenticated request, try one
// silent refresh (via the httpOnly cookie) before forcing a logout. Multiple
// requests failing at once share a single in-flight refresh instead of each
// firing their own.
let isRefreshing = false;
let refreshSubscribers: Array<(token: string | null) => void> = [];

function subscribeTokenRefresh(cb: (token: string | null) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token: string | null) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

function forceLogout() {
  useAuthStore.getState().logout();
  window.location.href = '/login';
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const originalRequest = error.config;
    const url: string = originalRequest?.url || '';
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh');

    if (status !== 401 || isAuthEndpoint || originalRequest?._retry) {
      if (status === 401 && url.includes('/auth/refresh')) {
        forceLogout();
      }
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        subscribeTokenRefresh((token) => {
          if (!token) {
            reject(error);
            return;
          }
          originalRequest.headers.Authorization = `Bearer ${token}`;
          resolve(api(originalRequest));
        });
      });
    }

    isRefreshing = true;
    return axios
      .post(`${API_URL}/api/auth/refresh`, {}, { withCredentials: true })
      .then((res) => {
        const newToken = res.data.accessToken as string;
        useAuthStore.getState().setAccessToken(newToken);
        isRefreshing = false;
        onRefreshed(newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      })
      .catch((refreshError) => {
        isRefreshing = false;
        onRefreshed(null);
        // Only log out when the server DEFINITIVELY rejected the session (401
        // response from /auth/refresh). A network-level failure — laptop
        // sleep, Wi-Fi blip, stalled connection while the tab is in the
        // background — must NOT log the user out: it used to hard-navigate to
        // /login, which cancelled every in-flight request and killed running
        // uploads ("không giữ tab là nó lỗi"). The chunk retry loop re-fires
        // and re-authenticates once the connection returns.
        if (refreshError?.response) {
          forceLogout();
        }
        return Promise.reject(refreshError);
      });
  }
);

// Auth API
export const authApi = {
  register: (data: { email: string; password: string; name: string }) =>
    api.post('/api/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/api/auth/login', data),
  logout: () => api.post('/api/auth/logout'),
  getMe: () => api.get('/api/auth/me'),
  forgotPassword: (email: string) => api.post('/api/auth/forgot-password', { email }),
  resetPassword: (token: string, newPassword: string) =>
    api.post('/api/auth/reset-password', { token, newPassword }),
  updateProfile: (data: { name?: string; avatarUrl?: string }) =>
    api.patch('/api/auth/me', data),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/api/auth/change-password', { currentPassword, newPassword }),
  googleLoginUrl: () => `${API_URL}/api/auth/google`,
};

// Projects API
export const projectsApi = {
  getAll: (opts?: { search?: string }) =>
    api.get('/api/projects', { params: opts?.search ? { search: opts.search } : undefined }),
  getById: (id: string) => api.get(`/api/projects/${id}`),
  create: (data: { name: string; description?: string }) =>
    api.post('/api/projects', data),
  update: (id: string, data: { name?: string; description?: string }) =>
    api.patch(`/api/projects/${id}`, data),
  delete: (id: string) => api.delete(`/api/projects/${id}`),
};

// Project Members API
export const projectMembersApi = {
  getMembers: (projectId: string) => api.get(`/api/projects/${projectId}/members`),
  invite: (projectId: string, data: { email: string; role: string }) =>
    api.post(`/api/projects/${projectId}/members/invite`, data),
  updateRole: (projectId: string, memberId: string, role: string) =>
    api.patch(`/api/projects/${projectId}/members/${memberId}`, { role }),
  removeMember: (projectId: string, memberId: string) =>
    api.delete(`/api/projects/${projectId}/members/${memberId}`),
  acceptInvite: (token: string) => api.post(`/api/invites/${token}/accept`),
};

// Videos API
export const videosApi = {
  getByProject: (
    projectId: string,
    folderId?: string | null,
    opts?: { search?: string; reviewStatus?: string },
  ) =>
    api.get(`/api/projects/${projectId}/videos`, {
      params: { folderId: folderId || undefined, search: opts?.search, reviewStatus: opts?.reviewStatus },
    }),
  getTrash: (projectId: string) => api.get(`/api/projects/${projectId}/trash`),
  getById: (id: string) => api.get(`/api/videos/${id}`),
  getVersions: (id: string) => api.get(`/api/videos/${id}/versions`),
  rename: (id: string, title: string) => api.patch(`/api/videos/${id}`, { title }),
  move: (id: string, folderId: string | null) => api.patch(`/api/videos/${id}/move`, { folderId }),
  delete: (id: string) => api.delete(`/api/videos/${id}`),
  restore: (id: string) => api.post(`/api/videos/${id}/restore`),
  setReviewStatus: (id: string, status: string) =>
    api.patch(`/api/videos/${id}/review-status`, { status }),
  // Fetch a short-lived, video-scoped stream token (separate from the API JWT).
  getStreamToken: (videoId: string) =>
    api.get(`/api/videos/${videoId}/stream-token`),
  // One round-trip for the whole project grid — every thumbnail <img> needs
  // its own stream token because images can't send Authorization headers.
  getStreamTokens: (projectId: string) =>
    api.get(`/api/projects/${projectId}/stream-tokens`),
  // Build the stream URL from a stream token (obtained via getStreamToken) —
  // the API access token is NOT put in the URL anymore.
  getStreamUrl: (videoId: string, quality: string, streamToken: string) =>
    `${API_URL}/api/videos/${videoId}/stream/${quality}?token=${encodeURIComponent(streamToken)}`,
  getThumbnailUrl: (videoId: string, streamToken?: string) =>
    streamToken ? `${API_URL}/api/videos/${videoId}/thumbnail?token=${encodeURIComponent(streamToken)}` : undefined,
};

// Folders API
export const foldersApi = {
  getByProject: (projectId: string, parentFolderId?: string | null) =>
    api.get(`/api/projects/${projectId}/folders`, { params: parentFolderId ? { parentFolderId } : undefined }),
  create: (projectId: string, data: { name: string; parentFolderId?: string }) =>
    api.post(`/api/projects/${projectId}/folders`, data),
  rename: (projectId: string, id: string, name: string) =>
    api.patch(`/api/projects/${projectId}/folders/${id}`, { name }),
  delete: (projectId: string, id: string) => api.delete(`/api/projects/${projectId}/folders/${id}`),
};

// Comments API
export const commentsApi = {
  getByVideo: (videoId: string, opts?: { sort?: 'timecode' | 'date'; offset?: number; limit?: number }) =>
    api.get(`/api/videos/${videoId}/comments`, { params: opts }),
  create: (videoId: string, data: {
    content: string;
    timestamp: number;
    frameNumber: number;
    positionX?: number;
    positionY?: number;
    parentId?: string;
  }) => api.post(`/api/videos/${videoId}/comments`, data),
  update: (id: string, data: { content?: string }) =>
    api.patch(`/api/comments/${id}`, data),
  delete: (id: string) => api.delete(`/api/comments/${id}`),
  setResolved: (id: string, resolved: boolean) =>
    api.patch(`/api/comments/${id}/resolve`, { resolved }),
};

// Reactions API
export const reactionsApi = {
  toggle: (commentId: string, emoji: string) =>
    api.post(`/api/comments/${commentId}/reactions`, { emoji }),
  getByComment: (commentId: string) => api.get(`/api/comments/${commentId}/reactions`),
};

// Notifications API
export const notificationsApi = {
  getAll: (unreadOnly?: boolean) =>
    api.get('/api/notifications', { params: unreadOnly ? { unreadOnly: 'true' } : undefined }),
  markRead: (id: string) => api.patch(`/api/notifications/${id}/read`),
  markAllRead: () => api.patch('/api/notifications/read-all'),
};

// Upload API
export const uploadApi = {
  init: (
    projectId: string,
    filename: string,
    fileSize: number,
    mimeType: string,
    opts?: { assetGroupId?: string; folderId?: string },
  ) => api.post('/api/upload/init', { projectId, filename, fileSize, mimeType, ...opts }),
  getStatus: (uploadId: string) => api.get(`/api/upload/${uploadId}/status`),
  uploadChunk: (uploadId: string, chunkIndex: number, chunk: Blob, config?: Parameters<typeof api.post>[2]) => {
    const formData = new FormData();
    formData.append('chunk', chunk);
    return api.post(`/api/upload/chunk/${uploadId}/${chunkIndex}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      ...config,
    });
  },
  // Long timeout: complete concatenates all chunks server-side, which takes a
  // while for multi-GB files.
  complete: (uploadId: string) => api.post(`/api/upload/complete/${uploadId}`, undefined, { timeout: 300_000 }),
};

// Annotations API
export const annotationsApi = {
  getByVideo: (videoId: string) => api.get(`/api/videos/${videoId}/annotations`),
  create: (commentId: string, data: { type: string; data: Record<string, unknown> }) =>
    api.post(`/api/comments/${commentId}/annotations`, data),
  update: (commentId: string, id: string, data: { type?: string; data?: Record<string, unknown> }) =>
    api.patch(`/api/comments/${commentId}/annotations/${id}`, data),
  delete: (commentId: string, id: string) =>
    api.delete(`/api/comments/${commentId}/annotations/${id}`),
};

// Share Links API
export const shareLinksApi = {
  create: (videoId: string, data: { permission?: string; expiresAt?: string; password?: string }) =>
    api.post(`/api/videos/${videoId}/share-links`, data),
  list: (videoId: string) => api.get(`/api/videos/${videoId}/share-links`),
  revoke: (id: string) => api.patch(`/api/share-links/${id}/revoke`),
};

// Activity API
export const activityApi = {
  getByProject: (projectId: string, before?: string) =>
    api.get(`/api/projects/${projectId}/activity`, { params: before ? { before } : undefined }),
};

// Export API
export const exportApi = {
  getXml: (videoId: string) =>
    api.get(`/api/videos/${videoId}/export/xml`, { responseType: 'text' }),
  getPdf: (videoId: string) =>
    api.get(`/api/videos/${videoId}/export/pdf`, { responseType: 'blob' }),
};