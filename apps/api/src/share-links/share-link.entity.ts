import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Video } from '../videos/video.entity';

export enum SharePermission {
  VIEW_ONLY = 'view_only',
  CAN_COMMENT = 'can_comment',
}

@Entity('share_links')
export class ShareLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  videoId: string;

  @Column()
  createdBy: string;

  @Column({ unique: true })
  token: string;

  @Column({ type: 'enum', enum: SharePermission, default: SharePermission.CAN_COMMENT })
  permission: SharePermission;

  @Column({ type: 'varchar', nullable: true })
  passwordHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Video, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'videoId' })
  video: Video;
}
