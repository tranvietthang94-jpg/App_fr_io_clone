import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Project } from './project.entity';
import { ProjectMember, MemberRole, MemberStatus, MEMBER_ROLE_RANK } from './project-member.entity';
import { User } from '../auth/user.entity';
import { MailerService } from '../mailer/mailer.service';
import { ActivityLogService } from '../activity/activity-log.service';
import { ActivityType } from '../activity/activity-log.entity';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private projectsRepository: Repository<Project>,
    @InjectRepository(ProjectMember)
    private membersRepository: Repository<ProjectMember>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private mailerService: MailerService,
    private activityLogService: ActivityLogService,
  ) {}

  /**
   * Projects created before the membership model existed have no
   * ProjectMember rows. Lazily create the owner's row on first access
   * instead of requiring a separate migration script.
   */
  private async ensureOwnerMembership(project: Project): Promise<void> {
    const existing = await this.membersRepository.findOne({
      where: { projectId: project.id, userId: project.ownerId },
    });
    if (existing) {
      return;
    }
    try {
      await this.membersRepository.save(
        this.membersRepository.create({
          projectId: project.id,
          userId: project.ownerId,
          role: MemberRole.OWNER,
          status: MemberStatus.ACCEPTED,
          joinedAt: new Date(),
        }),
      );
    } catch (err: any) {
      // Two concurrent requests can both see "no row" and race to insert
      // (e.g. React effects firing twice on first load of a legacy project).
      // The unique (projectId, userId) constraint is the real guard; losing
      // the race just means another request already created the row.
      if (err?.code !== '23505') {
        throw err;
      }
    }
  }

  async getMemberRole(projectId: string, userId: string): Promise<MemberRole | null> {
    const member = await this.membersRepository.findOne({
      where: { projectId, userId, status: MemberStatus.ACCEPTED },
    });
    return member?.role ?? null;
  }

  async findAll(userId: string, search?: string) {
    const memberships = await this.membersRepository.find({
      where: { userId, status: MemberStatus.ACCEPTED },
    });
    if (memberships.length === 0) {
      return [];
    }
    const qb = this.projectsRepository
      .createQueryBuilder('project')
      .where('project.id IN (:...ids)', { ids: memberships.map((m) => m.projectId) })
      .orderBy('project.createdAt', 'DESC');
    if (search) {
      qb.andWhere('project.name ILIKE :search', { search: `%${search}%` });
    }
    return qb.getMany();
  }

  async findOne(id: string, userId: string) {
    const project = await this.projectsRepository.findOne({ where: { id } });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    await this.ensureOwnerMembership(project);
    const role = await this.getMemberRole(id, userId);
    if (!role) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  /** Loads the project and throws 403 (not 404) if the caller is a member below minRole. */
  async assertRole(id: string, userId: string, minRole: MemberRole): Promise<Project> {
    const project = await this.findOne(id, userId);
    const role = await this.getMemberRole(id, userId);
    if (!role || MEMBER_ROLE_RANK[role] < MEMBER_ROLE_RANK[minRole]) {
      throw new ForbiddenException('Insufficient project role');
    }
    return project;
  }

  async create(data: { name: string; description?: string }, userId: string) {
    const project = this.projectsRepository.create({ ...data, ownerId: userId });
    const saved = await this.projectsRepository.save(project);
    await this.membersRepository.save(
      this.membersRepository.create({
        projectId: saved.id,
        userId,
        role: MemberRole.OWNER,
        status: MemberStatus.ACCEPTED,
        joinedAt: new Date(),
      }),
    );
    return saved;
  }

  async update(id: string, data: { name?: string; description?: string }, userId: string) {
    const project = await this.assertRole(id, userId, MemberRole.ADMIN);
    Object.assign(project, data);
    return this.projectsRepository.save(project);
  }

  async delete(id: string, userId: string) {
    const project = await this.assertRole(id, userId, MemberRole.ADMIN);
    await this.projectsRepository.remove(project);
    return { success: true };
  }

  async getMembers(projectId: string, userId: string) {
    await this.findOne(projectId, userId);
    return this.membersRepository.find({
      where: { projectId },
      relations: ['user'],
      order: { invitedAt: 'ASC' },
    });
  }

  async invite(projectId: string, userId: string, data: { email: string; role: MemberRole }, actorName: string) {
    const project = await this.assertRole(projectId, userId, MemberRole.ADMIN);

    const existingUser = await this.usersRepository.findOne({ where: { email: data.email } });
    const existingMember = await this.membersRepository.findOne({
      where: existingUser
        ? { projectId, userId: existingUser.id }
        : { projectId, invitedEmail: data.email },
    });
    if (existingMember) {
      throw new ConflictException('User đã là thành viên hoặc đã được mời');
    }

    const member = this.membersRepository.create({
      projectId,
      userId: existingUser?.id,
      invitedEmail: existingUser ? undefined : data.email,
      role: data.role,
      status: MemberStatus.PENDING,
      inviteToken: randomUUID(),
    });
    const saved = await this.membersRepository.save(member);

    const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/invite/${saved.inviteToken}`;
    await this.mailerService.send(
      data.email,
      `Lời mời tham gia dự án "${project.name}"`,
      `<p>Bạn được mời tham gia dự án <strong>${project.name}</strong> trên FrameClone.</p><p><a href="${acceptUrl}">Chấp nhận lời mời</a></p>`,
      acceptUrl,
    );

    await this.activityLogService.record(
      projectId,
      ActivityType.MEMBER_ADDED,
      userId,
      actorName,
      { memberEmail: data.email, role: data.role },
    );

    return saved;
  }

  async acceptInvite(token: string, userId: string, userEmail: string) {
    const member = await this.membersRepository.findOne({
      where: { inviteToken: token, status: MemberStatus.PENDING },
    });
    if (!member) {
      throw new NotFoundException('Lời mời không tồn tại hoặc đã được sử dụng');
    }
    if (member.invitedEmail && member.invitedEmail !== userEmail) {
      throw new ForbiddenException('Lời mời này được gửi cho một email khác');
    }

    member.userId = userId;
    member.invitedEmail = null;
    member.status = MemberStatus.ACCEPTED;
    member.joinedAt = new Date();
    member.inviteToken = null;
    return this.membersRepository.save(member);
  }

  async updateMemberRole(projectId: string, memberId: string, userId: string, role: MemberRole) {
    await this.assertRole(projectId, userId, MemberRole.ADMIN);
    const member = await this.membersRepository.findOne({ where: { id: memberId, projectId } });
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    if (member.role === MemberRole.OWNER) {
      throw new ForbiddenException('Cannot change the owner role');
    }
    member.role = role;
    return this.membersRepository.save(member);
  }

  async removeMember(projectId: string, memberId: string, userId: string, actorName: string) {
    await this.assertRole(projectId, userId, MemberRole.ADMIN);
    const member = await this.membersRepository.findOne({ where: { id: memberId, projectId }, relations: ['user'] });
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    if (member.role === MemberRole.OWNER) {
      throw new ForbiddenException('Cannot remove the project owner');
    }
    await this.membersRepository.remove(member);
    await this.activityLogService.record(
      projectId,
      ActivityType.MEMBER_REMOVED,
      userId,
      actorName,
      { memberEmail: member.user?.email || member.invitedEmail, role: member.role },
    );
    return { success: true };
  }
}
