import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { canPerform, ProjectAction as A } from './project-access';
import { MemberRole } from './project-member.entity';
import { AdminPermission as P } from '../admin/admin-permissions';

// Columns: [READ, INTERACT, CONTENT, EDIT, MANAGE]
const ACTIONS = [A.READ, A.INTERACT, A.CONTENT, A.EDIT, A.MANAGE];
const NONE = [false, false, false, false, false];

// What each member role may do on its own.
const MEMBER: Array<[MemberRole, boolean[]]> = [
  [MemberRole.REVIEWER, [true, true, false, false, false]],
  [MemberRole.EDITOR, [true, true, true, true, false]],
  [MemberRole.ADMIN, [true, true, true, true, true]],
];

// What admin permissions alone grant (EDIT / MANAGE are never granted).
const ADMIN: Array<[string, P[], boolean[]]> = [
  ['no admin perms', [], NONE],
  ['view', [P.PROJECT_VIEW], [true, false, false, false, false]],
  ['view+interact', [P.PROJECT_VIEW, P.PROJECT_INTERACT], [true, true, false, false, false]],
  ['view+content', [P.PROJECT_VIEW, P.PROJECT_CONTENT], [true, false, true, false, false]],
  ['quota perms only', [P.QUOTA_GRANT, P.QUOTA_ADJUST], NONE],
];

describe('canPerform matrix', () => {
  for (const [name, perms, adminRow] of ADMIN) {
    test(`non-member with ${name}`, () => {
      ACTIONS.forEach((a, i) => assert.equal(canPerform(null, perms, a), adminRow[i], A[a]));
    });
    for (const [role, memberRow] of MEMBER) {
      test(`${role} member with ${name}`, () => {
        // Admin permissions only ever add rights on top of the member row.
        ACTIONS.forEach((a, i) => assert.equal(canPerform(role, perms, a), memberRow[i] || adminRow[i], A[a]));
      });
    }
  }
});
