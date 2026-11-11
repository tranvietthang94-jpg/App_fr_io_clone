import 'reflect-metadata';
import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { AdminPermission as P } from './admin-permissions';

const GB = 1024 ** 3;

type Row = { id: string; name: string; email: string; avatarUrl: string | null; storageQuota: number | null; storageUsed: number; adminPermissions: string[] };
const user = (id: string, extra: Partial<Row> = {}): Row => ({
  id, name: id, email: `${id}@x.test`, avatarUrl: null, storageQuota: null, storageUsed: 0, adminPermissions: [], ...extra,
});

function make(rows: Row[]) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const wheres: Array<[string, any]> = [];
  const usersRepo: any = {
    findOne: async ({ where }: any) => byId.get(where.id) ?? null,
    update: async (id: string, patch: any) => { Object.assign(byId.get(id)!, patch); },
    createQueryBuilder: () => {
      const qb: any = {
        where: (sql: string, params: any) => { wheres.push([sql, params]); return qb; },
        orderBy: () => qb, skip: () => qb, take: () => qb,
        getManyAndCount: async () => [[...byId.values()], byId.size],
      };
      return qb;
    },
  };
  const membersRepo: any = {
    createQueryBuilder: () => {
      const qb: any = {
        select: () => qb, addSelect: () => qb, where: () => qb, andWhere: () => qb, groupBy: () => qb,
        getRawMany: async () => [],
      };
      return qb;
    },
  };
  const service = new AdminService(usersRepo, membersRepo, null as any, null as any);
  return { service, byId, wheres };
}

const actor = (id: string, permissions: P[]) => ({ id, permissions });

describe('AdminService', () => {
  const saved = process.env.SUPER_ADMIN_USER_ID;
  beforeEach(() => { process.env.SUPER_ADMIN_USER_ID = 'boss'; Logger.overrideLogger(false); });
  afterEach(() => {
    if (saved === undefined) delete process.env.SUPER_ADMIN_USER_ID; else process.env.SUPER_ADMIN_USER_ID = saved;
    Logger.overrideLogger(['log', 'error', 'warn']);
  });

  test('quota_grant admin can set quota for a default user but not change a custom one', async () => {
    const { service, byId } = make([user('a'), user('plain'), user('custom', { storageQuota: 5 * GB })]);
    const grant = actor('a', [P.QUOTA_GRANT]);
    await service.updateQuota(grant, 'plain', 1 * GB);
    assert.equal(byId.get('plain')!.storageQuota, 1 * GB);
    await assert.rejects(service.updateQuota(grant, 'custom', 9 * GB), ForbiddenException);
    await assert.rejects(service.updateQuota(grant, 'custom', null), ForbiddenException);
    assert.equal(byId.get('custom')!.storageQuota, 5 * GB);
  });

  test('quota_adjust admin can change a custom quota and reset to null', async () => {
    const { service, byId } = make([user('a'), user('custom', { storageQuota: 5 * GB }), user('plain')]);
    const adjust = actor('a', [P.QUOTA_ADJUST]);
    await service.updateQuota(adjust, 'custom', 7 * GB);
    assert.equal(byId.get('custom')!.storageQuota, 7 * GB);
    await service.updateQuota(adjust, 'custom', null);
    assert.equal(byId.get('custom')!.storageQuota, null);
    // adjust alone cannot give a default user their first custom quota
    await assert.rejects(service.updateQuota(adjust, 'plain', 1 * GB), ForbiddenException);
  });

  test('admin cannot change own quota (403)', async () => {
    const { service } = make([user('a', { storageQuota: 5 * GB })]);
    await assert.rejects(
      service.updateQuota(actor('a', [P.QUOTA_GRANT, P.QUOTA_ADJUST]), 'a', 9 * GB),
      (e: any) => e instanceof ForbiddenException && e.message === 'Không thể tự chỉnh dung lượng của mình',
    );
  });

  test('nobody can change super admin quota (400)', async () => {
    const { service } = make([user('boss'), user('a')]);
    const all = [P.QUOTA_GRANT, P.QUOTA_ADJUST];
    await assert.rejects(service.updateQuota(actor('a', all), 'boss', 1), BadRequestException);
    await assert.rejects(service.updateQuota(actor('boss', all), 'boss', 1), BadRequestException);
  });

  test('lowering quota below usage succeeds and storageUsed is untouched', async () => {
    const { service, byId } = make([user('a'), user('u', { storageQuota: 10 * GB, storageUsed: 8 * GB })]);
    await service.updateQuota(actor('a', [P.QUOTA_ADJUST]), 'u', 1 * GB);
    assert.equal(byId.get('u')!.storageQuota, 1 * GB);
    assert.equal(byId.get('u')!.storageUsed, 8 * GB);
  });

  test('only super admin edits permissions; admin with every permission gets 403', async () => {
    const { service, byId } = make([user('boss'), user('a'), user('t')]);
    const everything = Object.values(P);
    await assert.rejects(service.updatePermissions(actor('a', everything), 't', ['project_view']), ForbiddenException);
    await service.updatePermissions(actor('boss', everything), 't', ['project_view']);
    assert.deepEqual(byId.get('t')!.adminPermissions, ['project_view']);
    await assert.rejects(service.updatePermissions(actor('boss', everything), 'boss', ['project_view']), BadRequestException);
  });

  test('permissions are normalized (content adds view)', async () => {
    const { service, byId } = make([user('boss'), user('t')]);
    await service.updatePermissions(actor('boss', []), 't', ['project_content', 'bogus']);
    assert.deepEqual(byId.get('t')!.adminPermissions, ['project_view', 'project_content']);
  });

  test('list search matches email case-insensitively', async () => {
    const { service, wheres } = make([user('a')]);
    await service.listUsers({ search: 'Foo_Bar%' });
    const [sql, params] = wheres[0];
    assert.match(sql, /u\.email ILIKE :q/);
    assert.match(sql, /u\.name ILIKE :q/);
    assert.equal(params.q, '%Foo\\_Bar\\%%'); // wildcards in the input are escaped
  });

  test('list rows expose effective quota, custom flag and permissions', async () => {
    const { service } = make([user('boss'), user('u', { storageQuota: 3 * GB, adminPermissions: ['project_view'] })]);
    const { items, total } = await service.listUsers({});
    assert.equal(total, 2);
    const boss = items.find((i) => i.id === 'boss')!;
    assert.equal(boss.storageQuota, null);
    assert.equal(boss.isSuperAdmin, true);
    assert.equal(boss.permissions.length, 5);
    const u = items.find((i) => i.id === 'u')!;
    assert.deepEqual([u.storageQuota, u.isCustomQuota, u.permissions], [3 * GB, true, ['project_view']]);
  });
});

describe('AdminGuard', () => {
  const saved = process.env.SUPER_ADMIN_USER_ID;
  afterEach(() => {
    if (saved === undefined) delete process.env.SUPER_ADMIN_USER_ID; else process.env.SUPER_ADMIN_USER_ID = saved;
  });

  function run(meta: { perms: P[]; superOnly: boolean }, row: Row | null, userId = 'u') {
    const guard = new AdminGuard(
      { getAllAndOverride: () => meta } as any,
      { findOne: async () => row } as any,
    );
    const req: any = { user: { userId } };
    const ctx: any = { getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => req }) };
    return { result: guard.canActivate(ctx), req };
  }

  test('revoked permission takes effect on the next request (guard reloads user)', async () => {
    const meta = { perms: [P.PROJECT_VIEW], superOnly: false };
    assert.equal(await run(meta, user('u', { adminPermissions: ['project_view'] })).result, true);
    await assert.rejects(run(meta, user('u', { adminPermissions: [] })).result, ForbiddenException);
  });

  test('passes with any listed permission, with no list any admin permission, and exposes req.admin', async () => {
    const one = run({ perms: [P.QUOTA_GRANT, P.QUOTA_ADJUST], superOnly: false }, user('u', { adminPermissions: ['quota_adjust'] }));
    assert.equal(await one.result, true);
    assert.deepEqual(one.req.admin, { id: 'u', permissions: ['quota_adjust'] });
    assert.equal(await run({ perms: [], superOnly: false }, user('u', { adminPermissions: ['quota_grant'] })).result, true);
    await assert.rejects(run({ perms: [], superOnly: false }, user('u')).result, ForbiddenException);
    await assert.rejects(run({ perms: [P.PROJECT_VIEW], superOnly: false }, user('u', { adminPermissions: ['quota_grant'] })).result, ForbiddenException);
  });

  test('superOnly admits only the super admin; a deleted user is refused', async () => {
    process.env.SUPER_ADMIN_USER_ID = 'boss';
    const meta = { perms: [], superOnly: true };
    assert.equal(await run(meta, user('boss'), 'boss').result, true);
    await assert.rejects(run(meta, user('u', { adminPermissions: ['project_view'] })).result, ForbiddenException);
    await assert.rejects(run({ perms: [], superOnly: false }, null).result, ForbiddenException);
  });
});
