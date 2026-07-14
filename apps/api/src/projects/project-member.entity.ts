import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Project } from './project.entity';
import { User } from '../auth/user.entity';

export enum MemberRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  EDITOR = 'editor',
  REVIEWER = 'reviewer',
}

export enum MemberStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
}

// Rank used to compare roles (higher = more privileged). OWNER and ADMIN share
// every permission except owner-only actions (transfer/removal), which are
// checked explicitly wherever they matter rather than via this rank.
export const MEMBER_ROLE_RANK: Record<MemberRole, number> = {
  [MemberRole.REVIEWER]: 0,
  [MemberRole.EDITOR]: 1,
  [MemberRole.ADMIN]: 2,
  [MemberRole.OWNER]: 3,
};

@Entity('project_members')
@Unique(['projectId', 'userId'])
export class ProjectMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @Column({ nullable: true })
  userId: string;

  @Column({ type: 'varchar', nullable: true })
  invitedEmail: string | null;

  @Column({ type: 'enum', enum: MemberRole, default: MemberRole.EDITOR })
  role: MemberRole;

  @Column({ type: 'enum', enum: MemberStatus, default: MemberStatus.PENDING })
  status: MemberStatus;

  @Column({ type: 'varchar', nullable: true, unique: true })
  inviteToken: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  invitedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  joinedAt: Date;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;
}
