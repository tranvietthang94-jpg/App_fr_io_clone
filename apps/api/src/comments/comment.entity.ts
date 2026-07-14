import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Video } from '../videos/video.entity';
import { User } from '../auth/user.entity';

@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  videoId: string;

  @Column()
  userId: string;

  @Column({ nullable: true })
  parentId: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'float' })
  timestamp: number;

  @Column({ default: 0 })
  frameNumber: number;

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

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;
}