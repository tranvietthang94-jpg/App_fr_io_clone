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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Video)
  @JoinColumn({ name: 'videoId' })
  video: Video;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;
}