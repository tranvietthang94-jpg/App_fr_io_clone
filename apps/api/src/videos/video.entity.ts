import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Project } from '../projects/project.entity';

@Entity('videos')
export class Video {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @Column()
  title: string;

  @Column()
  originalFilename: string;

  @Column()
  filePath: string;

  @Column({ type: 'float', default: 0 })
  duration: number;

  @Column({ default: 0 })
  width: number;

  @Column({ default: 0 })
  height: number;

  @Column({ type: 'float', default: 30 })
  fps: number;

  @Column({ type: 'bigint', default: 0 })
  fileSize: number;

  @Column({ default: 'processing' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Project)
  @JoinColumn({ name: 'projectId' })
  project: Project;
}