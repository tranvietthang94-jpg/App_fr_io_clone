import { applyDecorators, CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../auth/user.entity';
import { AdminPermission, effectivePermissions, isSuperAdminId } from './admin-permissions';

const ADMIN_META = 'admin:requirements';

interface AdminRequirements {
  perms: AdminPermission[];
  superOnly: boolean;
}

/** JWT + at least one of `perms` (no args: any admin permission or super admin). */
export const RequireAdmin = (...perms: AdminPermission[]) =>
  applyDecorators(
    SetMetadata(ADMIN_META, { perms, superOnly: false } satisfies AdminRequirements),
    UseGuards(AuthGuard('jwt'), AdminGuard),
  );

export const RequireSuperAdmin = () =>
  applyDecorators(
    SetMetadata(ADMIN_META, { perms: [], superOnly: true } satisfies AdminRequirements),
    UseGuards(AuthGuard('jwt'), AdminGuard),
  );

/** Reloads the user on every request so a revoked permission applies immediately, not when the JWT expires. */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(User) private users: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const { perms, superOnly } = this.reflector.getAllAndOverride<AdminRequirements>(ADMIN_META, [
      context.getHandler(),
      context.getClass(),
    ]);
    const user = await this.users.findOne({ where: { id: req.user?.userId } });
    if (!user) throw new ForbiddenException('Không có quyền quản trị');

    const held = effectivePermissions(user);
    const allowed = superOnly
      ? isSuperAdminId(user.id)
      : perms.length > 0
        ? perms.some((p) => held.includes(p))
        : held.length > 0;
    if (!allowed) throw new ForbiddenException('Không có quyền quản trị');

    req.admin = { id: user.id, permissions: held };
    return true;
  }
}
