import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Comment } from './comment.entity';

@Entity('annotations')
export class Annotation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  commentId: string;

  @Column()
  type: string; // 'draw', 'highlight', 'text', 'shape'

  @Column({ type: 'jsonb' })
  data: Record<string, any>; // SVG path, points, color, etc.

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Comment)
  @JoinColumn({ name: 'commentId' })
  comment: Comment;
}