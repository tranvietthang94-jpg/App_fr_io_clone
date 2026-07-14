import { IsEmail, IsIn } from 'class-validator';
import { MemberRole } from '../project-member.entity';

const INVITABLE_ROLES = [MemberRole.ADMIN, MemberRole.EDITOR, MemberRole.REVIEWER];

export class InviteMemberDto {
  @IsEmail()
  email: string;

  @IsIn(INVITABLE_ROLES)
  role: MemberRole;
}

export class UpdateMemberRoleDto {
  @IsIn(INVITABLE_ROLES)
  role: MemberRole;
}
