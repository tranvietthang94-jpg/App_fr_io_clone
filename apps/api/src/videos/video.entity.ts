import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { randomUUID } from 'crypto';
import { Project } from '../projects/project.entity';

export enum VideoReviewStatus {
  IN_REVIEW = 'in_review',
  APPROVED = 'approved',
  NEEDS_REVIEW = 'needs_review',
  REJECTED = 'rejected',
}

@Entity('videos')
export class Video {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @Column({ type: 'varchar', nullable: true })
  folderId: string | null;

  // Every version of the "same" upload shares this id (set explicitly by
  // VideosService.create — a DB default can't reference the row's own
  // generated `id`). Re-uploading a new version reuses the original asset's
  // assetGroupId with an incremented versionNumber.
  @Column()
  assetGroupId: string;

  @Column({ default: 1 })
  versionNumber: number;

  @Column({ type: 'varchar', nullable: true })
  versionLabel: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Column()
  title: string;

  @Column()
  originalFilename: string;

  @Column()
  filePath: string;

  @Column({ type: 'float', default: 0 })
  duration: number;

  @Column({ default: 0 })
  width: number;

  @Column({ default: 0 })
  height: number;

  @Column({ type: 'float', default: 30 })
  fps: number;

  @Column({ type: 'bigint', default: 0 })
  fileSize: number;

  @Column({ default: 'processing' })
  status: string;

  // Editorial review decision (approved/rejected/etc), independent of the
  // transcode `status` above.
  @Column({ type: 'enum', enum: VideoReviewStatus, default: VideoReviewStatus.IN_REVIEW })
  reviewStatus: VideoReviewStatus;

  @Column({ type: 'varchar', nullable: true })
  reviewStatusUpdatedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewStatusUpdatedAt: Date | null;

  // Stable id for the exported PDF's permalink footer (kept separate from
  // the video's own id so re-exports of the same video always print the
  // same link, matching Frame.io's print/comments/{uuid} URL).
  @Column({ type: 'varchar', nullable: true })
  printUuid: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;
}