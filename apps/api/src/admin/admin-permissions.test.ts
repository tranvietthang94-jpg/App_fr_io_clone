import { test, describe, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { AdminPermission, normalizePermissions, effectivePermissions, isSuperAdminId } from './admin-permissions';

describe('admin permissions', () => {
  const saved = process.env.SUPER_ADMIN_USER_ID;
  afterEach(() => {
    if (saved === undefined) delete process.env.SUPER_ADMIN_USER_ID;
    else process.env.SUPER_ADMIN_USER_ID = saved;
  });

  test("normalizePermissions(['project_content','bogus']) deep-equals ['project_content','project_view'] in enum order", () => {
    assert.deepEqual(normalizePermissions(['project_content', 'bogus']), ['project_view', 'project_content']);
  });

  test('normalizePermissions dedupes and interact also adds view', () => {
    assert.deepEqual(
      normalizePermissions(['project_interact', 'project_interact', 'quota_grant']),
      ['quota_grant', 'project_view', 'project_interact'],
    );
  });

  test('isSuperAdminId reads the env at call time; unset means nobody', () => {
    delete process.env.SUPER_ADMIN_USER_ID;
    assert.equal(isSuperAdminId('boss'), false);
    process.env.SUPER_ADMIN_USER_ID = 'boss';
    assert.equal(isSuperAdminId('boss'), true);
    assert.equal(isSuperAdminId('other'), false);
  });

  test('effectivePermissions gives the super admin all five and others their own', () => {
    process.env.SUPER_ADMIN_USER_ID = 'boss';
    assert.equal(effectivePermissions({ id: 'boss', adminPermissions: [] }).length, 5);
    assert.deepEqual(effectivePermissions({ id: 'u', adminPermissions: ['project_view'] }), [AdminPermission.PROJECT_VIEW]);
  });
});
