import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

export enum ActivityType {
  VIDEO_UPLOADED = 'video_uploaded',
  REVIEW_STATUS_CHANGED = 'review_status_changed',
  COMMENT_ADDED = 'comment_added',
  MEMBER_ADDED = 'member_added',
  MEMBER_REMOVED = 'member_removed',
  SHARE_LINK_CREATED = 'share_link_created',
}

@Entity('activity_logs')
export class ActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @Column({ type: 'varchar', nullable: true })
  videoId: string | null;

  // null only for guest-driven events (no ProjectMember row to point at).
  @Column({ type: 'varchar', nullable: true })
  actorId: string | null;

  @Column()
  actorName: string;

  @Column({ type: 'enum', enum: ActivityType })
  type: ActivityType;

  // Shape depends on type: { videoTitle?, oldStatus?, newStatus?, memberEmail?, role?, snippet?, permission? }
  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
