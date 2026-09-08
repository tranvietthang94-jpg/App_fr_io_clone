import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Deliberately a plain axios instance, not the shared `api` client in api.ts —
// that one attaches an authenticated Bearer token and a 401->refresh->login
// interceptor, neither of which applies to an anonymous guest reviewer.
const client = axios.create({ baseURL: API_URL });

function authHeaders(password?: string) {
  return password ? { 'x-share-password': password } : undefined;
}

export const publicReviewApi = {
  get: (token: string, password?: string) =>
    client.get(`/api/public/review/${token}`, { headers: authHeaders(password) }),
  streamUrl: (token: string, quality: string = '720p') =>
    `${API_URL}/api/public/review/${token}/stream/${quality}`,
  getComments: (
    token: string,
    opts?: { sort?: 'timecode' | 'date'; offset?: number; limit?: number },
    password?: string,
  ) => client.get(`/api/public/review/${token}/comments`, { params: opts, headers: authHeaders(password) }),
  addComment: (
    token: string,
    data: {
      guestName: string;
      guestEmail?: string;
      content: string;
      timestamp: number;
      frameNumber: number;
      endTimestamp?: number;
      positionX?: number;
      positionY?: number;
      parentId?: string;
    },
    password?: string,
  ) => client.post(`/api/public/review/${token}/comments`, data, { headers: authHeaders(password) }),
  editComment: (token: string, commentId: string, editToken: string, content: string, password?: string) =>
    client.patch(
      `/api/public/review/${token}/comments/${commentId}`,
      { editToken, content },
      { headers: authHeaders(password) },
    ),
  deleteComment: (token: string, commentId: string, editToken: string, password?: string) =>
    client.delete(`/api/public/review/${token}/comments/${commentId}`, {
      data: { editToken },
      headers: authHeaders(password),
    }),
  getAnnotations: (token: string, password?: string) =>
    client.get(`/api/public/review/${token}/annotations`, { headers: authHeaders(password) }),
  addAnnotation: (
    token: string,
    commentId: string,
    data: { type: string; data: Record<string, unknown> },
    password?: string,
  ) =>
    client.post(`/api/public/review/${token}/comments/${commentId}/annotations`, data, {
      headers: authHeaders(password),
    }),
  setReviewStatus: (token: string, status: string, password?: string) =>
    client.patch(`/api/public/review/${token}/review-status`, { status }, { headers: authHeaders(password) }),
};
