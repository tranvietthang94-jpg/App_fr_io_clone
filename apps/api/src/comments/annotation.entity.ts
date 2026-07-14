import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Comment } from './comment.entity';

@Entity('annotations')
export class Annotation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  commentId: string;

  @Column()
  type: string; // 'draw', 'highlight', 'text', 'rectangle'

  @Column({ type: 'jsonb' })
  data: Record<string, any>; // SVG path, points, color, etc.

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Comment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'commentId' })
  comment: Comment;
}