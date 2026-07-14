import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Project } from '../projects/project.entity';

@Entity('folders')
export class Folder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @Column({ type: 'varchar', nullable: true })
  parentFolderId: string | null;

  @Column()
  name: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;
}
