import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../auth/user.entity';

export enum NotificationType {
  MENTION = 'mention',
  REPLY = 'reply',
  RESOLVE = 'resolve',
  REACTION = 'reaction',
  PROJECT_INVITE = 'project_invite',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Recipient.
  @Column()
  userId: string;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  // { actorId, actorName, commentId?, videoId?, projectId?, content? } — shape depends on type.
  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ default: false })
  read: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
