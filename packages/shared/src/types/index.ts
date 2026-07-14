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
  folderId?: string | null;
  // Every version of the same uploaded asset shares one assetGroupId.
  assetGroupId: string;
  versionNumber: number;
  versionLabel?: string | null;
  deletedAt?: string | null;
  title: string;
  originalFilename: string;
  filePath: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  fileSize: number;
  status: VideoStatus;
  reviewStatus: VideoReviewStatus;
  reviewStatusUpdatedBy?: string | null;
  reviewStatusUpdatedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  project?: Project;
  versions?: VideoVersion[];
  comments?: Comment[];
}

export enum VideoReviewStatus {
  IN_REVIEW = 'in_review',
  APPROVED = 'approved',
  NEEDS_REVIEW = 'needs_review',
  REJECTED = 'rejected',
}

export interface Folder {
  id: string;
  projectId: string;
  parentFolderId?: string | null;
  name: string;
  createdAt: Date;
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
  userId?: string | null;
  parentId?: string;
  guestName?: string | null;
  guestEmail?: string | null;
  shareLinkId?: string | null;
  content: string;
  timestamp: number;
  frameNumber: number;
  positionX?: number;
  positionY?: number;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
  sequenceNumber?: number | null;
  createdAt: Date;
  updatedAt: Date;
  user?: User;
  replies?: Comment[];
  reactions?: CommentReaction[];
  annotations?: Annotation[];
}

export interface CommentReaction {
  id: string;
  commentId: string;
  userId: string;
  emoji: string;
  createdAt: Date;
}

export enum NotificationType {
  MENTION = 'mention',
  REPLY = 'reply',
  RESOLVE = 'resolve',
  REACTION = 'reaction',
  PROJECT_INVITE = 'project_invite',
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  payload: {
    actorId?: string;
    actorName?: string;
    commentId?: string;
    parentCommentId?: string;
    videoId?: string;
    projectId?: string;
    content?: string;
  };
  read: boolean;
  createdAt: Date;
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
  RECTANGLE = 'rectangle',
}

// Project Member types
export interface ProjectMember {
  id: string;
  projectId: string;
  userId?: string;
  invitedEmail?: string;
  role: MemberRole;
  status: MemberStatus;
  inviteToken?: string;
  invitedAt: Date;
  joinedAt?: Date;
  user?: User;
}

export enum MemberRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  EDITOR = 'editor',
  REVIEWER = 'reviewer',
}

export enum MemberStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
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

// Share link types
export enum SharePermission {
  VIEW_ONLY = 'view_only',
  CAN_COMMENT = 'can_comment',
}

export interface ShareLink {
  id: string;
  videoId: string;
  createdBy: string;
  token: string;
  permission: SharePermission;
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdAt: Date;
}

// Activity log types
export enum ActivityType {
  VIDEO_UPLOADED = 'video_uploaded',
  REVIEW_STATUS_CHANGED = 'review_status_changed',
  COMMENT_ADDED = 'comment_added',
  MEMBER_ADDED = 'member_added',
  MEMBER_REMOVED = 'member_removed',
  SHARE_LINK_CREATED = 'share_link_created',
}

export interface ActivityLogEntry {
  id: string;
  projectId: string;
  videoId?: string | null;
  actorId?: string | null;
  actorName: string;
  type: ActivityType;
  payload: Record<string, unknown>;
  createdAt: Date;
}

// Export types
export interface ExportData {
  project: Project;
  video: Video;
  comments: Comment[];
  exportedAt: Date;
  exportedBy: User;
}