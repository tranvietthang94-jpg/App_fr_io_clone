import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Video } from '../videos/video.entity';
import { User } from '../auth/user.entity';

@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  videoId: string;

  // Null for a guest comment (posted via a share link) — see guestName/guestEmail/shareLinkId below.
  @Column({ type: 'varchar', nullable: true })
  userId: string | null;

  @Column({ nullable: true })
  parentId: string;

  @Column({ type: 'varchar', nullable: true })
  guestName: string | null;

  @Column({ type: 'varchar', nullable: true })
  guestEmail: string | null;

  @Column({ type: 'varchar', nullable: true })
  shareLinkId: string | null;

  // Bearer secret returned once at creation time so a guest (no account) can
  // later prove ownership to edit/delete their own comment. Never selected by
  // default — only pulled via addSelect() for that one authorization check.
  @Column({ type: 'varchar', nullable: true, select: false })
  guestEditToken: string | null;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'float' })
  timestamp: number;

  @Column({ default: 0 })
  frameNumber: number;

  // Inclusive range end in seconds. Null = point comment (Frame.io-style In only).
  @Column({ type: 'float', nullable: true })
  endTimestamp: number | null;

  @Column({ type: 'float', nullable: true })
  positionX: number;

  @Column({ type: 'float', nullable: true })
  positionY: number;

  @Column({ default: false })
  resolved: boolean;

  @Column({ type: 'varchar', nullable: true })
  resolvedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Video, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'videoId' })
  video: Video;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;
}