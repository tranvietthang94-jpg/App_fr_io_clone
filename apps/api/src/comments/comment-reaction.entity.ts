import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Comment } from './comment.entity';
import { User } from '../auth/user.entity';

@Entity('comment_reactions')
@Unique(['commentId', 'userId', 'emoji'])
export class CommentReaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  commentId: string;

  @Column()
  userId: string;

  @Column()
  emoji: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Comment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'commentId' })
  comment: Comment;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
