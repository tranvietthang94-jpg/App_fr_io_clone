import 'reflect-metadata';
import 'dotenv/config';
import { test, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { User } from '../auth/user.entity';
import { Project } from '../projects/project.entity';
import { Video } from '../videos/video.entity';
import { ActivityLog, ActivityType } from '../activity/activity-log.entity';
import { recalculateStorage } from './storage-recalc';

// Needs the devenv Postgres. Every test runs inside ONE transaction that is rolled back,
// so nothing is committed and real users' storageUsed is never touched (recalc covers all
// users, but only inside the rolled-back transaction). Assertions look at our own rows only.
let ds: DataSource;
const ROLLBACK = new Error('rollback');
const HOUR = 3600_000;

before(async () => {
  ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'frclone',
    password: process.env.DB_PASSWORD || 'frclone123',
    database: process.env.DB_DATABASE || 'frclone',
    entities: [join(__dirname, '..', '**', '*.entity.ts')],
    synchronize: true,
  });
  await ds.initialize();
});
after(() => ds.destroy());

/** Runs fn in a transaction and always rolls it back. `db` hands recalc that same transaction. */
async function rolledBack(fn: (m: EntityManager, db: Pick<DataSource, 'transaction'>) => Promise<void>) {
  await assert.rejects(
    ds.transaction(async (m) => {
      await fn(m, { transaction: ((cb: any) => cb(m)) as any });
      throw ROLLBACK;
    }),
    (e) => e === ROLLBACK,
  );
}

async function seed(m: EntityManager) {
  const mkUser = async () => {
    const id = randomUUID();
    await m.getRepository(User).insert({ id, email: `${id}@recalc.int.test`, passwordHash: 'x', name: 'recalc' });
    return id;
  };
  const a = await mkUser();
  const b = await mkUser();
  const project = randomUUID();
  await m.getRepository(Project).insert({ id: project, name: 'p', ownerId: b });
  const video = async (size: number, extra: Partial<Video> = {}) => {
    const id = randomUUID();
    await m.getRepository(Video).insert({
      id, projectId: project, assetGroupId: id, title: 't', originalFilename: 't.mp4', filePath: '/nope', fileSize: size, ...extra,
    });
    return id;
  };
  const log = (videoId: string, actorId: string | null, createdAt: Date) =>
    m.getRepository(ActivityLog).insert({
      projectId: project, videoId, actorId, actorName: 'x', type: ActivityType.VIDEO_UPLOADED, payload: {}, createdAt,
    });
  const used = async (id: string) => (await m.getRepository(User).findOneByOrFail({ id })).storageUsed;
  const owner = async (id: string) => (await m.getRepository(Video).findOneByOrFail({ id })).uploadedById;
  return { a, b, project, video, log, used, owner };
}

const emptyRoot = () => fs.mkdtempSync(join(os.tmpdir(), 'recalc-'));

test('backfills uploadedById from the upload activity log, falls back to project owner', () =>
  rolledBack(async (m, db) => {
    const s = await seed(m);
    const logged = await s.video(10);
    await s.log(logged, s.b, new Date('2026-02-01')); // later upload entry
    await s.log(logged, s.a, new Date('2026-01-01')); // earliest wins
    const unknownActor = await s.video(20);
    await s.log(unknownActor, randomUUID(), new Date()); // actor no longer a user
    const noLog = await s.video(30);

    const { backfilled } = await recalculateStorage(db as DataSource, { uploadsRoot: emptyRoot() });

    assert.ok(backfilled >= 3);
    assert.equal(await s.owner(logged), s.a);
    assert.equal(await s.owner(unknownActor), s.b);
    assert.equal(await s.owner(noLog), s.b);
  }));

test('running twice yields identical storageUsed (idempotent)', () =>
  rolledBack(async (m, db) => {
    const s = await seed(m);
    const v = await s.video(10);
    await s.log(v, s.a, new Date());
    await s.video(30);
    const opts = { uploadsRoot: emptyRoot() };

    await recalculateStorage(db as DataSource, opts);
    const first = [await s.used(s.a), await s.used(s.b)];
    const second = await recalculateStorage(db as DataSource, opts);

    assert.deepEqual(first, [10, 30]);
    assert.deepEqual([await s.used(s.a), await s.used(s.b)], first);
    assert.equal(second.backfilled, 0);
  }));

test('counts trashed videos and live reservations, ignores expired reservations', () =>
  rolledBack(async (m, db) => {
    const s = await seed(m);
    await s.video(10, { uploadedById: s.a });
    await s.video(7, { uploadedById: s.a, deletedAt: new Date() }); // trashed still occupies disk

    const root = emptyRoot();
    const now = Date.now();
    const session = (userId: string, reservedBytes: number, ageMs: number) => {
      const dir = join(root, 'chunks', randomUUID());
      fs.mkdirSync(dir, { recursive: true });
      const meta = join(dir, 'metadata.json');
      fs.writeFileSync(meta, JSON.stringify({ userId, reservedBytes }));
      const t = new Date(now - ageMs);
      fs.utimesSync(meta, t, t);
    };
    session(s.a, 100, HOUR); // live
    session(s.a, 1000, 25 * HOUR); // expired: ignored

    await recalculateStorage(db as DataSource, { uploadsRoot: root, now });

    assert.equal(await s.used(s.a), 10 + 7 + 100);
    assert.equal(await s.used(s.b), 0);
  }));
