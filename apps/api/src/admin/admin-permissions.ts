export enum AdminPermission {
  QUOTA_GRANT = 'quota_grant',
  QUOTA_ADJUST = 'quota_adjust',
  PROJECT_VIEW = 'project_view',
  PROJECT_INTERACT = 'project_interact',
  PROJECT_CONTENT = 'project_content',
}

const ALL = Object.values(AdminPermission);

/** Read at call time so tests (and a restarted env) always see the current value. Unset = no super admin. */
export function isSuperAdminId(userId: string): boolean {
  const id = process.env.SUPER_ADMIN_USER_ID;
  return !!id && userId === id;
}

/** Drops unknown values, dedupes, orders by enum, and adds PROJECT_VIEW when INTERACT/CONTENT is present. */
export function normalizePermissions(input: string[]): AdminPermission[] {
  const wanted = new Set(input);
  if (wanted.has(AdminPermission.PROJECT_INTERACT) || wanted.has(AdminPermission.PROJECT_CONTENT)) {
    wanted.add(AdminPermission.PROJECT_VIEW);
  }
  return ALL.filter((p) => wanted.has(p));
}

/** What the user may actually do: everything for the super admin, else the stored list. */
export function effectivePermissions(user: { id: string; adminPermissions: string[] }): AdminPermission[] {
  return isSuperAdminId(user.id) ? [...ALL] : normalizePermissions(user.adminPermissions ?? []);
}
