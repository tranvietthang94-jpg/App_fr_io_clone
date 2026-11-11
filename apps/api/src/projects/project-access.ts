import { AdminPermission } from '../admin/admin-permissions';
import { MemberRole, MEMBER_ROLE_RANK } from './project-member.entity';

export enum ProjectAction {
  READ,
  INTERACT, // comment, annotate, react, review status, realtime presence
  CONTENT, // delete / restore / move / copy / duplicate videos and folders
  EDIT, // upload, rename, create folders, share links — members only
  MANAGE, // project settings and members — members only
}

const ADMIN_PERMISSION_FOR: Partial<Record<ProjectAction, AdminPermission>> = {
  [ProjectAction.READ]: AdminPermission.PROJECT_VIEW,
  [ProjectAction.INTERACT]: AdminPermission.PROJECT_INTERACT,
  [ProjectAction.CONTENT]: AdminPermission.PROJECT_CONTENT,
};

function memberCan(role: MemberRole | null, action: ProjectAction): boolean {
  if (!role) return false;
  const rank = MEMBER_ROLE_RANK[role];
  switch (action) {
    case ProjectAction.READ:
    case ProjectAction.INTERACT:
      return true;
    case ProjectAction.CONTENT:
    case ProjectAction.EDIT:
      return rank >= MEMBER_ROLE_RANK[MemberRole.EDITOR];
    case ProjectAction.MANAGE:
      return rank >= MEMBER_ROLE_RANK[MemberRole.ADMIN];
  }
}

/** Member rights first; admin permissions only add (EDIT and MANAGE are never reachable through them). */
export function canPerform(role: MemberRole | null, perms: AdminPermission[], action: ProjectAction): boolean {
  if (memberCan(role, action)) return true;
  const needed = ADMIN_PERMISSION_FOR[action];
  return needed !== undefined && perms.includes(needed);
}
