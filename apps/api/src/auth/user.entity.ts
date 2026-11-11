import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { bigintNumber } from '../storage/bigint.transformer';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  // select: false — never loaded by default, so `relations: { user: true }`
  // (comments, members, …) can't leak the bcrypt hash to clients. Queries that
  // need it (login, change-password) re-select it explicitly.
  @Column({ select: false })
  passwordHash: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ type: 'varchar', nullable: true, unique: true })
  googleId: string | null;

  // null = default quota (StorageService.defaultQuota).
  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  storageQuota: number | null;

  // Bytes of original files attributed to the user, including live upload reservations.
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  storageUsed: number;

  @Column({ type: 'simple-array', default: '' })
  adminPermissions: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}