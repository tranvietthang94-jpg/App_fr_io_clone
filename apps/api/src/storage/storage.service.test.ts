import 'reflect-metadata';
import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { StorageService, QuotaExceededException } from './storage.service';
import { formatBytes } from './format-bytes';

const GiB = 1024 ** 3;
const DEFAULT = 16106127360;

/** StorageService over an in-memory users table; transaction just runs the callback. */
function setup(rows: Record<string, { id: string; storageQuota: number | null; storageUsed: number }>) {
  const manager: any = {
    getRepository: () => ({
      findOne: async ({ where }: any) => rows[where.id] ?? null,
      update: async (id: string, patch: any) => { Object.assign(rows[id], patch); },
    }),
  };
  const ds: any = { transaction: async (cb: any) => cb(manager) };
  return new StorageService(ds);
}

describe('StorageService', () => {
  const saved = process.env.SUPER_ADMIN_USER_ID;
  beforeEach(() => { delete process.env.SUPER_ADMIN_USER_ID; delete process.env.DEFAULT_STORAGE_QUOTA_BYTES; });
  afterEach(() => { if (saved === undefined) delete process.env.SUPER_ADMIN_USER_ID; else process.env.SUPER_ADMIN_USER_ID = saved; });

  test('effectiveQuota returns default 16106127360 when storageQuota is null', () => {
    const s = setup({});
    assert.equal(s.effectiveQuota({ id: 'u', storageQuota: null }), DEFAULT);
    assert.equal(s.effectiveQuota({ id: 'u', storageQuota: 5 }), 5);
  });

  test('effectiveQuota returns null for SUPER_ADMIN_USER_ID', () => {
    process.env.SUPER_ADMIN_USER_ID = 'boss';
    const s = setup({});
    assert.equal(s.effectiveQuota({ id: 'boss', storageQuota: 5 }), null);
  });

  test('charge throws QuotaExceededException with status 413 and the exact Vietnamese message when used+bytes > quota', async () => {
    const rows = { u: { id: 'u', storageQuota: null, storageUsed: DEFAULT - GiB } };
    await assert.rejects(setup(rows).charge('u', 2 * GiB), (e: any) => {
      assert.ok(e instanceof QuotaExceededException);
      assert.equal(e.getStatus(), 413);
      assert.equal(e.message, 'Còn trống 1 GB, file cần 2 GB — liên hệ admin để nâng dung lượng');
      return true;
    });
    assert.equal(rows.u.storageUsed, DEFAULT - GiB);
  });

  test('charge allows exactly reaching the quota', async () => {
    const rows = { u: { id: 'u', storageQuota: 100, storageUsed: 40 } };
    await setup(rows).charge('u', 60);
    assert.equal(rows.u.storageUsed, 100);
  });

  test('credit subtracts numerically when bytes is a string', async () => {
    const rows = { u: { id: 'u', storageQuota: null, storageUsed: 10 } };
    await setup(rows).credit('u', '5');
    assert.equal(rows.u.storageUsed, 5);
  });

  test('credit never goes below 0 and ignores a null user', async () => {
    const rows = { u: { id: 'u', storageQuota: null, storageUsed: 3 } };
    const s = setup(rows);
    await s.credit('u', 10);
    assert.equal(rows.u.storageUsed, 0);
    await s.credit(null, 10);
  });

  test('chargeMany charges nobody when one user lacks space', async () => {
    const rows = {
      a: { id: 'a', storageQuota: 100, storageUsed: 0 },
      b: { id: 'b', storageQuota: 100, storageUsed: 90 },
    };
    await assert.rejects(setup(rows).chargeMany(new Map([['a', 10], ['b', 20]])), QuotaExceededException);
    assert.equal(rows.a.storageUsed, 0);
    assert.equal(rows.b.storageUsed, 90);
  });

  test('getUsage returns used and effective quota', async () => {
    const rows = { u: { id: 'u', storageQuota: 50, storageUsed: 7 } };
    assert.deepEqual(await setup(rows).getUsage('u'), { used: 7, quota: 50 });
  });
});

describe('formatBytes', () => {
  test('formats GB and MB with at most one decimal', () => {
    assert.equal(formatBytes(1288490188.8), '1.2 GB');
    assert.equal(formatBytes(524288000), '500 MB');
    assert.equal(formatBytes(GiB), '1 GB');
  });
});
