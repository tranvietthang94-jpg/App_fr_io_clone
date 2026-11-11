import 'reflect-metadata';
import 'dotenv/config';
import { test, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { User } from '../auth/user.entity';
import { StorageService, QuotaExceededException } from './storage.service';

// Needs the devenv Postgres (scripts/devenv.ps1 start); connection from apps/api/.env.
let ds: DataSource;
const userIds: string[] = [];

before(async () => {
  ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'frclone',
    password: process.env.DB_PASSWORD || 'frclone123',
    database: process.env.DB_DATABASE || 'frclone',
    entities: [join(__dirname, '..', '**', '*.entity.ts')],
    synchronize: true, // same schema sync the API does at boot
  });
  await ds.initialize();
});

after(async () => {
  if (userIds.length) await ds.getRepository(User).delete(userIds);
  await ds.destroy();
});

test('two concurrent charge() calls for the last free slot: exactly one rejects with QuotaExceededException and storageUsed equals quota', async () => {
  const id = randomUUID();
  userIds.push(id);
  await ds.getRepository(User).insert({
    id, email: `${id}@quota.int.test`, passwordHash: 'x', name: 'quota-int', storageQuota: 100, storageUsed: 50,
  });
  const storage = new StorageService(ds);

  const results = await Promise.allSettled([storage.charge(id, 50), storage.charge(id, 50)]);

  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0].reason instanceof QuotaExceededException);
  const row = await ds.getRepository(User).findOneByOrFail({ id });
  assert.equal(row.storageUsed, 100);
});
