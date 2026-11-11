import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../auth/user.entity';
import { Project } from '../projects/project.entity';
import { MemberStatus, ProjectMember } from '../projects/project-member.entity';
import { effectiveQuota } from '../storage/storage.service';
import { recalculateStorage } from '../storage/storage-recalc';
import { AdminPermission, effectivePermissions, isSuperAdminId, normalizePermissions } from './admin-permissions';

export interface AdminActor {
  id: string;
  permissions: AdminPermission[];
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  storageUsed: number;
  storageQuota: number | null; // effective; null = unlimited
  isCustomQuota: boolean;
  permissions: AdminPermission[];
  isSuperAdmin: boolean;
  projectCount: number;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(ProjectMember) private members: Repository<ProjectMember>,
    @InjectRepository(Project) private projects: Repository<Project>,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  private toRow(user: User, projectCount: number): AdminUserRow {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl ?? null,
      storageUsed: Number(user.storageUsed),
      storageQuota: effectiveQuota(user),
      isCustomQuota: user.storageQuota !== null,
      permissions: effectivePermissions(user),
      isSuperAdmin: isSuperAdminId(user.id),
      projectCount,
    };
  }

  private async projectCounts(userIds: string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const rows: Array<{ userId: string; n: string }> = await this.members
      .createQueryBuilder('m')
      .select('m.userId', 'userId')
      .addSelect('COUNT(*)', 'n')
      .where('m.userId IN (:...userIds)', { userIds })
      .andWhere('m.status = :status', { status: MemberStatus.ACCEPTED })
      .groupBy('m.userId')
      .getRawMany();
    return new Map(rows.map((r) => [r.userId, Number(r.n)]));
  }

  private async findUser(id: string): Promise<User> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Escapes LIKE wildcards so "100%" or "a_b" search literally. */
  private likePattern(search: string): string {
    return `%${search.replace(/[\\%_]/g, '\\$&')}%`;
  }

  async listUsers(opts: { search?: string; offset?: number; limit?: number }) {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
    const offset = Math.max(opts.offset ?? 0, 0);
    const qb = this.users.createQueryBuilder('u');
    if (opts.search) {
      qb.where('(u.name ILIKE :q OR u.email ILIKE :q)', { q: this.likePattern(opts.search) });
    }
    const [users, total] = await qb.orderBy('u.createdAt', 'ASC').skip(offset).take(limit).getManyAndCount();
    const counts = await this.projectCounts(users.map((u) => u.id));
    return { items: users.map((u) => this.toRow(u, counts.get(u.id) ?? 0)), total };
  }

  async updateQuota(actor: AdminActor, targetId: string, quotaBytes: number | null): Promise<AdminUserRow> {
    const target = await this.findUser(targetId);
    if (isSuperAdminId(target.id)) throw new BadRequestException('Không thể đổi dung lượng của super admin');
    if (actor.id === target.id) throw new ForbiddenException('Không thể tự chỉnh dung lượng của mình');

    // First custom quota for someone on the default = grant; any later change or reset = adjust.
    const needed =
      quotaBytes !== null && target.storageQuota === null ? AdminPermission.QUOTA_GRANT : AdminPermission.QUOTA_ADJUST;
    if (!actor.permissions.includes(needed)) throw new ForbiddenException('Không đủ quyền chỉnh dung lượng');

    // Lowering below current usage is allowed on purpose: the user becomes over quota, nothing is deleted.
    await this.users.update(target.id, { storageQuota: quotaBytes });
    this.logger.log(`quota: actor=${actor.id} target=${target.id} ${target.storageQuota} -> ${quotaBytes}`);
    const updated = { ...target, storageQuota: quotaBytes } as User;
    return this.toRow(updated, (await this.projectCounts([target.id])).get(target.id) ?? 0);
  }

  async updatePermissions(actor: AdminActor, targetId: string, permissions: string[]): Promise<AdminUserRow> {
    if (!isSuperAdminId(actor.id)) throw new ForbiddenException('Chỉ super admin được chỉnh quyền');
    const target = await this.findUser(targetId);
    if (isSuperAdminId(target.id)) throw new BadRequestException('Không thể đổi quyền của super admin');

    const next = normalizePermissions(permissions);
    await this.users.update(target.id, { adminPermissions: next });
    this.logger.log(`permissions: actor=${actor.id} target=${target.id} [${target.adminPermissions}] -> [${next}]`);
    const updated = { ...target, adminPermissions: next } as User;
    return this.toRow(updated, (await this.projectCounts([target.id])).get(target.id) ?? 0);
  }

  async userProjects(userId: string) {
    await this.findUser(userId);
    const memberships = await this.members.find({
      where: { userId, status: MemberStatus.ACCEPTED },
      relations: { project: true },
      order: { invitedAt: 'ASC' },
    });
    return memberships.map((m) => ({ id: m.project.id, name: m.project.name, ownerId: m.project.ownerId, role: m.role }));
  }

  async searchProjects(search?: string) {
    const qb = this.projects.createQueryBuilder('p').leftJoinAndSelect('p.owner', 'owner');
    if (search) qb.where('p.name ILIKE :q', { q: this.likePattern(search) });
    const projects = await qb.orderBy('p.createdAt', 'DESC').take(50).getMany();
    return projects.map((p) => ({ id: p.id, name: p.name, ownerName: p.owner?.name ?? '' }));
  }

  recalculate() {
    return recalculateStorage(this.dataSource);
  }
}
