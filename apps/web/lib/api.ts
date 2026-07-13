import axios from 'axios';
import { useAuthStore } from './stores/authStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
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

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  register: (data: { email: string; password: string; name: string }) =>
    api.post('/api/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/api/auth/login', data),
  getMe: () => api.get('/api/auth/me'),
};

// Projects API
export const projectsApi = {
  getAll: () => api.get('/api/projects'),
  getById: (id: string) => api.get(`/api/projects/${id}`),
  create: (data: { name: string; description?: string }) =>
    api.post('/api/projects', data),
  update: (id: string, data: { name?: string; description?: string }) =>
    api.patch(`/api/projects/${id}`, data),
  delete: (id: string) => api.delete(`/api/projects/${id}`),
};

// Videos API
export const videosApi = {
  getByProject: (projectId: string) =>
    api.get(`/api/projects/${projectId}/videos`),
  getById: (id: string) => api.get(`/api/videos/${id}`),
  delete: (id: string) => api.delete(`/api/videos/${id}`),
  getStreamUrl: (videoId: string, quality: string) => {
    const token = useAuthStore.getState().accessToken;
    return `${API_URL}/api/videos/${videoId}/stream/${quality}?token=${encodeURIComponent(token || '')}`;
  },
};

// Comments API
export const commentsApi = {
  getByVideo: (videoId: string) => api.get(`/api/videos/${videoId}/comments`),
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
};

// Upload API
export const uploadApi = {
  init: (projectId: string, filename: string, fileSize: number, mimeType: string) =>
    api.post('/api/upload/init', { projectId, filename, fileSize, mimeType }),
  uploadChunk: (uploadId: string, chunkIndex: number, chunk: Blob) => {
    const formData = new FormData();
    formData.append('chunk', chunk);
    return api.post(`/api/upload/chunk/${uploadId}/${chunkIndex}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  complete: (uploadId: string) => api.post(`/api/upload/complete/${uploadId}`),
};

// Annotations API
export const annotationsApi = {
  getByVideo: (videoId: string) => api.get(`/api/videos/${videoId}/annotations`),
  create: (commentId: string, data: { type: string; data: Record<string, unknown> }) =>
    api.post(`/api/comments/${commentId}/annotations`, data),
};

// Export API
export const exportApi = {
  getXml: (videoId: string) =>
    api.get(`/api/videos/${videoId}/export/xml`, { responseType: 'text' }),
  getPdf: (videoId: string) =>
    api.get(`/api/videos/${videoId}/export/pdf`, { responseType: 'blob' }),
};