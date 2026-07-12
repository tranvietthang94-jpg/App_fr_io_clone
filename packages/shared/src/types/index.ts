// User types
export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  createdAt: Date;
}

export interface CreateUserDto {
  email: string;
  password: string;
  name: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

// Project types
export interface Project {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  thumbnailUrl?: string;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
  owner?: User;
  videos?: Video[];
  members?: ProjectMember[];
}

export enum ProjectStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

export interface CreateProjectDto {
  name: string;
  description?: string;
}

export interface UpdateProjectDto {
  name?: string;
  description?: string;
  status?: ProjectStatus;
}

// Video types
export interface Video {
  id: string;
  projectId: string;
  title: string;
  originalFilename: string;
  filePath: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  fileSize: number;
  status: VideoStatus;
  createdAt: Date;
  updatedAt: Date;
  project?: Project;
  versions?: VideoVersion[];
  comments?: Comment[];
}

export enum VideoStatus {
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}

export interface VideoVersion {
  id: string;
  videoId: string;
  quality: string;
  filePath: string;
  fileSize: number;
  width: number;
  height: number;
  createdAt: Date;
}

// Comment types
export interface Comment {
  id: string;
  videoId: string;
  userId: string;
  parentId?: string;
  content: string;
  timestamp: number;
  frameNumber: number;
  positionX?: number;
  positionY?: number;
  createdAt: Date;
  updatedAt: Date;
  user?: User;
  replies?: Comment[];
  annotations?: Annotation[];
}

export interface CreateCommentDto {
  content: string;
  timestamp: number;
  frameNumber: number;
  positionX?: number;
  positionY?: number;
  parentId?: string;
}

// Annotation types
export interface Annotation {
  id: string;
  commentId: string;
  type: AnnotationType;
  data: Record<string, unknown>;
  createdAt: Date;
}

export enum AnnotationType {
  DRAW = 'draw',
  HIGHLIGHT = 'highlight',
  TEXT = 'text',
  SHAPE = 'shape',
}

// Project Member types
export interface ProjectMember {
  projectId: string;
  userId: string;
  role: MemberRole;
  joinedAt: Date;
  user?: User;
}

export enum MemberRole {
  OWNER = 'owner',
  EDITOR = 'editor',
  VIEWER = 'viewer',
}

// Upload types
export interface UploadInitResponse {
  uploadId: string;
  chunkSize: number;
  urls: string[];
}

export interface UploadCompleteDto {
  uploadId: string;
  filename: string;
  mimeType: string;
  totalSize: number;
}

// Export types
export interface ExportData {
  project: Project;
  video: Video;
  comments: Comment[];
  exportedAt: Date;
  exportedBy: User;
}