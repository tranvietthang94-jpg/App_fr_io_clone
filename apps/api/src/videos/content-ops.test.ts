import 'reflect-metadata';
import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { VideosService } from './videos.service';
import { FoldersService } from './folders.service';
import { StorageService, QuotaExceededException } from '../storage/storage.service';
import { User } from '../auth/user.entity';
import { ActivityType } from '../activity/activity-log.entity';
import { canPerform } from '../projects/project-access';
import { MemberRole } from '../projects/project-member.entity';
import { AdminPermission } from '../admin/admin-permissions';

const MB = 1024 * 1024;

/** In-memory stand-in for a TypeORM repository: just what the services call. */
function fakeRepo(rows: any[]) {
  const match = (row: any, where: any) =>
    Object.entries(where).every(([k, v]) => {
      if (v instanceof FindOperator) {
        if (v.type === 'in') return (v.value as any[]).includes(row[k]);
        if (v.type === 'isNull') return row[k] == null;
        throw new Error(`unsupported operator ${v.type}`);
      }
      return row[k] === v;
    });
  return {
    rows,
    findOne: async ({ where }: any) => rows.find((r) => match(r, where)) ?? null,
    find: async ({ where }: any = { where: {} }) => rows.filter((r) => match(r, where)),
    create: (o: any) => ({ ...o }),
    save: async (o: any) => {
      if (!o.id) o.id = randomUUID(); // the database does this for real
      const i = rows.findIndex((r) => r.id === o.id);
      if (i >= 0) rows[i] = o; else rows.push(o);
      return o;
    },
    remove: async (x: any) => {
      for (const o of Array.isArray(x) ? x : [x]) {
        const i = rows.findIndex((r) => r.id === o.id);
        if (i >= 0) rows.splice(i, 1);
      }
    },
    update: async (where: any, patch: any) => { rows.filter((r) => match(r, where)).forEach((r) => Object.assign(r, patch)); },
  };
}

describe('content ops (copy, move, permanent delete)', () => {
  let cwd: string;
  let tmp: string;
  beforeEach(() => {
    cwd = process.cwd();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'content-ops-'));
    process.chdir(tmp);
    fs.mkdirSync(path.join(tmp, 'uploads'), { recursive: true });
    Logger.overrideLogger(false);
  });
  afterEach(() => {
    process.chdir(cwd);
    fs.rmSync(tmp, { recursive: true, force: true });
    Logger.overrideLogger(['log', 'error', 'warn']);
  });

  /**
   * world: users {id: [quota, used]}, members {"project:user": role}, admin perms per user.
   * Videos/folders are plain rows; files are created on disk for every video.
   */
  function build(opts: {
    users: Record<string, [number, number]>;
    members?: Record<string, MemberRole>;
    admins?: Record<string, AdminPermission[]>;
    videos?: any[];
    folders?: any[];
  }) {
    const usersTable: Record<string, any> = {};
    for (const [id, [quota, used]] of Object.entries(opts.users)) usersTable[id] = { id, storageQuota: quota, storageUsed: used };
    const usersRepo: any = {
      findOne: async ({ where }: any) => usersTable[where.id] ?? null,
      update: async (id: string, patch: any) => { Object.assign(usersTable[id], patch); },
    };
    const videoRepo = fakeRepo(opts.videos ?? []);
    const folderRepo = fakeRepo(opts.folders ?? []);
    const ds: any = {
      transaction: async (cb: any) => cb({ getRepository: () => usersRepo }),
      getRepository: (e: any) => (e === User ? usersRepo : videoRepo),
    };
    const storage = new StorageService(ds);

    const authorized: Array<[string, string, number]> = [];
    const projects: any = {
      authorize: async (projectId: string, userId: string, action: number) => {
        authorized.push([projectId, userId, action]);
        const role = opts.members?.[`${projectId}:${userId}`] ?? null;
        const perms = opts.admins?.[userId] ?? [];
        if (!canPerform(role, perms, 0)) throw new NotFoundException('Project not found');
        if (!canPerform(role, perms, action)) throw new ForbiddenException('Insufficient project role');
        return { project: { id: projectId }, role, viaAdmin: !canPerform(role, [], action) };
      },
    };
    const logs: any[][] = [];
    const activity: any = { record: async (...a: any[]) => { logs.push(a); } };
    const videos = new VideosService(videoRepo as any, folderRepo as any, projects, activity, storage);
    const folders = new FoldersService(folderRepo as any, videoRepo as any, projects, activity, videos, storage);
    return { videos, folders, storage, usersTable, videoRepo, folderRepo, logs, authorized };
  }

  /** Creates the original file (+ transcoded dir and thumbnail) for a video row and returns the row. */
  function video(o: { id: string; project: string; by: string | null; size: number; folder?: string | null; asset?: string; version?: number; trashed?: boolean; title?: string; status?: string }) {
    const filePath = path.join(tmp, 'uploads', `${o.id}_clip.mp4`);
    fs.writeFileSync(filePath, 'x'.repeat(8));
    fs.mkdirSync(path.join(tmp, 'uploads', 'transcoded', o.id), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'uploads', 'transcoded', o.id, '720p.mp4'), 'y');
    fs.mkdirSync(path.join(tmp, 'uploads', 'thumbnails'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'uploads', 'thumbnails', `${o.id}.jpg`), 'z');
    return {
      id: o.id, projectId: o.project, folderId: o.folder ?? null, assetGroupId: o.asset ?? o.id, versionNumber: o.version ?? 1,
      title: o.title ?? 'Clip', originalFilename: 'clip.mp4', filePath, fileSize: String(o.size) as any, // bigint arrives as string
      duration: 5, width: 10, height: 10, fps: 30, status: o.status ?? 'ready', uploadedById: o.by,
      deletedAt: o.trashed ? new Date() : null, reviewStatus: 'in_review',
    };
  }
  const uploadsCount = () => fs.readdirSync(path.join(tmp, 'uploads')).filter((f) => f.endsWith('.mp4')).length;
  const editor = (project: string, user: string) => ({ [`${project}:${user}`]: MemberRole.EDITOR });

  test('copy charges the original uploader, not the actor', async () => {
    const t = build({
      users: { up: [100 * MB, 10 * MB], actor: [100 * MB, 0] },
      members: { ...editor('p1', 'actor') },
      videos: [video({ id: 'v1', project: 'p1', by: 'up', size: 5 * MB })],
    });
    const copy = await t.videos.copyVideo('v1', { targetProjectId: 'p1', targetFolderId: null }, 'actor', 'Actor');
    assert.equal(t.usersTable.up.storageUsed, 15 * MB);
    assert.equal(t.usersTable.actor.storageUsed, 0);
    assert.equal(copy.uploadedById, 'up');
    assert.notEqual(copy.id, 'v1');
    assert.notEqual(copy.assetGroupId, 'v1');
    assert.equal(copy.versionNumber, 1);
    assert.equal(fs.existsSync(copy.filePath), true);
    assert.equal(path.basename(copy.filePath), `${copy.id}_clip.mp4`);
    assert.equal(fs.existsSync(path.join(tmp, 'uploads', 'transcoded', copy.id, '720p.mp4')), true);
    assert.equal(fs.existsSync(path.join(tmp, 'uploads', 'thumbnails', `${copy.id}.jpg`)), true);
    assert.equal(t.videoRepo.rows.length, 2);
    const log = t.logs.find((l) => l[1] === ActivityType.VIDEO_COPIED)!;
    assert.equal(log[0], 'p1');
    assert.equal(log[4].viaAdmin, false);
  });

  test('copy to a project where the actor lacks CONTENT is 403', async () => {
    const t = build({
      users: { up: [100 * MB, 0] },
      members: { ...editor('p1', 'actor'), 'p2:actor': MemberRole.REVIEWER },
      videos: [video({ id: 'v1', project: 'p1', by: 'up', size: MB })],
    });
    await assert.rejects(t.videos.copyVideo('v1', { targetProjectId: 'p2', targetFolderId: null }, 'actor', 'A'), ForbiddenException);
    assert.equal(t.usersTable.up.storageUsed, 0);
    assert.equal(t.videoRepo.rows.length, 1);
    assert.equal(uploadsCount(), 1);
  });

  test('copy refused with 413 leaves no file and no row', async () => {
    const t = build({
      users: { up: [10 * MB, 8 * MB] },
      members: { ...editor('p1', 'actor') },
      videos: [video({ id: 'v1', project: 'p1', by: 'up', size: 5 * MB })],
    });
    await assert.rejects(
      t.videos.duplicateVideo('v1', 'actor', 'A'),
      (e: any) => e instanceof QuotaExceededException && e.getStatus() === 413,
    );
    assert.equal(t.videoRepo.rows.length, 1);
    assert.equal(uploadsCount(), 1);
    assert.equal(t.usersTable.up.storageUsed, 8 * MB);
  });

  test('copy that fails while copying files removes partial files and credits back', async () => {
    const t = build({
      users: { up: [100 * MB, 0] },
      members: { ...editor('p1', 'actor') },
      videos: [video({ id: 'v1', project: 'p1', by: 'up', size: MB })],
    });
    fs.rmSync(t.videoRepo.rows[0].filePath); // source original vanished
    await assert.rejects(t.videos.duplicateVideo('v1', 'actor', 'A'));
    assert.equal(t.usersTable.up.storageUsed, 0);
    assert.equal(t.videoRepo.rows.length, 1);
    assert.equal(fs.existsSync(path.join(tmp, 'uploads', 'transcoded')) ? fs.readdirSync(path.join(tmp, 'uploads', 'transcoded')).length : 0, 1);
  });

  test('copy of a video that is still processing is refused (409)', async () => {
    const t = build({
      users: { up: [100 * MB, 0] },
      members: { ...editor('p1', 'actor') },
      videos: [video({ id: 'v1', project: 'p1', by: 'up', size: MB, status: 'processing' })],
    });
    await assert.rejects(t.videos.duplicateVideo('v1', 'actor', 'A'), (e: any) => e.getStatus() === 409);
    assert.equal(t.usersTable.up.storageUsed, 0);
  });

  test('folder copy with two uploaders where one lacks space copies nothing and charges nobody', async () => {
    const t = build({
      users: { a: [100 * MB, 0], b: [10 * MB, 9 * MB] },
      members: { ...editor('p1', 'actor') },
      folders: [{ id: 'f1', projectId: 'p1', parentFolderId: null, name: 'Src' }],
      videos: [
        video({ id: 'v1', project: 'p1', by: 'a', size: 5 * MB, folder: 'f1' }),
        video({ id: 'v2', project: 'p1', by: 'b', size: 5 * MB, folder: 'f1' }),
      ],
    });
    await assert.rejects(
      t.folders.copyFolder('f1', { targetProjectId: 'p1', targetParentFolderId: null }, 'actor', 'A'),
      QuotaExceededException,
    );
    assert.equal(t.usersTable.a.storageUsed, 0);
    assert.equal(t.usersTable.b.storageUsed, 9 * MB);
    assert.equal(t.folderRepo.rows.length, 1);
    assert.equal(t.videoRepo.rows.length, 2);
    assert.equal(uploadsCount(), 2);
  });

  test('folder copy copies subfolders and the latest non-trashed version of each asset, charging each uploader', async () => {
    const t = build({
      users: { a: [100 * MB, 0], b: [100 * MB, 0] },
      members: { ...editor('p1', 'actor'), ...editor('p2', 'actor') },
      folders: [
        { id: 'f1', projectId: 'p1', parentFolderId: null, name: 'Src' },
        { id: 'f2', projectId: 'p1', parentFolderId: 'f1', name: 'Sub' },
        { id: 'dest', projectId: 'p2', parentFolderId: null, name: 'Dest' },
      ],
      videos: [
        video({ id: 'v1', project: 'p1', by: 'a', size: 2 * MB, folder: 'f1', asset: 'g1', version: 1 }),
        video({ id: 'v1b', project: 'p1', by: 'a', size: 3 * MB, folder: 'f1', asset: 'g1', version: 2 }), // latest wins
        video({ id: 'v2', project: 'p1', by: 'b', size: 4 * MB, folder: 'f2' }),
        video({ id: 'v3', project: 'p1', by: 'b', size: 9 * MB, folder: 'f2', trashed: true }), // skipped
      ],
    });
    await t.folders.copyFolder('f1', { targetProjectId: 'p2', targetParentFolderId: 'dest' }, 'actor', 'A');
    assert.equal(t.usersTable.a.storageUsed, 3 * MB);
    assert.equal(t.usersTable.b.storageUsed, 4 * MB);
    const newFolders = t.folderRepo.rows.filter((f) => f.projectId === 'p2' && f.id !== 'dest');
    assert.deepEqual(newFolders.map((f) => f.name).sort(), ['Src', 'Sub']);
    const root = newFolders.find((f) => f.name === 'Src')!;
    assert.equal(root.parentFolderId, 'dest');
    assert.equal(newFolders.find((f) => f.name === 'Sub')!.parentFolderId, root.id);
    assert.equal(t.videoRepo.rows.filter((v) => v.projectId === 'p2').length, 2);
  });

  test('folder copy that fails midway removes copies and new folders and credits everything back', async () => {
    const t = build({
      users: { a: [100 * MB, 0], b: [100 * MB, 0] },
      members: { ...editor('p1', 'actor') },
      folders: [{ id: 'f1', projectId: 'p1', parentFolderId: null, name: 'Src' }],
      videos: [
        video({ id: 'v1', project: 'p1', by: 'a', size: 2 * MB, folder: 'f1' }),
        video({ id: 'v2', project: 'p1', by: 'b', size: 3 * MB, folder: 'f1' }),
      ],
    });
    fs.rmSync(t.videoRepo.rows[1].filePath); // second original vanished: the first copy already succeeded
    await assert.rejects(t.folders.copyFolder('f1', { targetProjectId: 'p1', targetParentFolderId: null }, 'actor', 'A'));
    assert.deepEqual([t.usersTable.a.storageUsed, t.usersTable.b.storageUsed], [0, 0]);
    assert.equal(t.folderRepo.rows.length, 1);
    assert.equal(t.videoRepo.rows.length, 2);
    assert.equal(uploadsCount(), 1); // only v1's original is left
  });

  test('folder copy into its own descendant is 400', async () => {
    const t = build({
      users: {},
      members: { ...editor('p1', 'actor') },
      folders: [
        { id: 'f1', projectId: 'p1', parentFolderId: null, name: 'A' },
        { id: 'f2', projectId: 'p1', parentFolderId: 'f1', name: 'B' },
      ],
    });
    await assert.rejects(t.folders.copyFolder('f1', { targetProjectId: 'p1', targetParentFolderId: 'f2' }, 'actor', 'A'), BadRequestException);
    await assert.rejects(t.folders.copyFolder('f1', { targetProjectId: 'p1', targetParentFolderId: 'f1' }, 'actor', 'A'), BadRequestException);
    assert.equal(t.folderRepo.rows.length, 2);
  });

  test('cross-project move moves all versions and keeps storage unchanged', async () => {
    const t = build({
      users: { a: [100 * MB, 7 * MB] },
      members: { ...editor('p1', 'actor'), ...editor('p2', 'actor') },
      folders: [{ id: 'tf', projectId: 'p2', parentFolderId: null, name: 'T' }],
      videos: [
        video({ id: 'v1', project: 'p1', by: 'a', size: 3 * MB, asset: 'g', version: 1 }),
        video({ id: 'v2', project: 'p1', by: 'a', size: 4 * MB, asset: 'g', version: 2 }),
        video({ id: 'other', project: 'p1', by: 'a', size: MB }),
      ],
    });
    await t.videos.move('v1', 'tf', 'actor', 'A', 'p2');
    assert.deepEqual(t.videoRepo.rows.filter((v) => v.assetGroupId === 'g').map((v) => [v.projectId, v.folderId]), [['p2', 'tf'], ['p2', 'tf']]);
    assert.equal(t.videoRepo.rows.find((v) => v.id === 'other').projectId, 'p1');
    assert.equal(t.usersTable.a.storageUsed, 7 * MB);
    const logged = t.logs.filter((l) => l[1] === ActivityType.VIDEO_MOVED_PROJECT).map((l) => l[0]).sort();
    assert.deepEqual(logged, ['p1', 'p2']);
  });

  test('cross-project move needs CONTENT on both projects and a folder from the target project', async () => {
    const t = build({
      users: {},
      members: { ...editor('p1', 'actor'), 'p2:actor': MemberRole.REVIEWER },
      folders: [{ id: 'f1', projectId: 'p1', parentFolderId: null, name: 'F' }],
      videos: [video({ id: 'v1', project: 'p1', by: null, size: MB })],
    });
    await assert.rejects(t.videos.move('v1', null, 'actor', 'A', 'p2'), ForbiddenException);
    const t2 = build({
      users: {},
      members: { ...editor('p1', 'actor'), ...editor('p2', 'actor') },
      folders: [{ id: 'f1', projectId: 'p1', parentFolderId: null, name: 'F' }],
      videos: [video({ id: 'v1', project: 'p1', by: null, size: MB })],
    });
    await assert.rejects(t2.videos.move('v1', 'f1', 'actor', 'A', 'p2'), BadRequestException); // f1 belongs to p1
    assert.equal(t2.videoRepo.rows[0].projectId, 'p1');
  });

  test('permanent delete with wrong confirmName is 400 and deletes nothing', async () => {
    const t = build({
      users: { a: [100 * MB, 3 * MB] },
      members: { ...editor('p1', 'actor') },
      videos: [video({ id: 'v1', project: 'p1', by: 'a', size: 3 * MB, title: 'My Clip' })],
    });
    await assert.rejects(
      t.videos.deletePermanently('v1', 'my clip', 'actor', 'A'),
      (e: any) => e instanceof BadRequestException && e.message === 'Tên xác nhận không khớp',
    );
    assert.equal(t.videoRepo.rows.length, 1);
    assert.equal(uploadsCount(), 1);
    assert.equal(t.usersTable.a.storageUsed, 3 * MB);
    await t.videos.deletePermanently('v1', '  My Clip  ', 'actor', 'A'); // trimmed, exact otherwise
    assert.equal(t.videoRepo.rows.length, 0);
  });

  test('permanent delete of an asset destroys all versions and credits each uploader', async () => {
    const t = build({
      users: { a: [100 * MB, 5 * MB], b: [100 * MB, 4 * MB] },
      members: { ...editor('p1', 'actor') },
      videos: [
        video({ id: 'v1', project: 'p1', by: 'a', size: 2 * MB, asset: 'g', version: 1, title: 'Clip' }),
        video({ id: 'v2', project: 'p1', by: 'b', size: 4 * MB, asset: 'g', version: 2, title: 'Clip', trashed: true }),
        video({ id: 'keep', project: 'p1', by: 'a', size: 3 * MB }),
      ],
    });
    await t.videos.deletePermanently('v1', 'Clip', 'actor', 'A');
    assert.deepEqual(t.videoRepo.rows.map((v) => v.id), ['keep']);
    assert.equal(uploadsCount(), 1);
    assert.equal(t.usersTable.a.storageUsed, 3 * MB);
    assert.equal(t.usersTable.b.storageUsed, 0);
    const log = t.logs.find((l) => l[1] === ActivityType.VIDEO_DELETED_PERMANENTLY)!;
    assert.equal(log[4].viaAdmin, false);
  });

  test('folder permanent delete includes trashed videos in subfolders', async () => {
    const t = build({
      users: { a: [100 * MB, 10 * MB] },
      members: { ...editor('p1', 'actor') },
      folders: [
        { id: 'f1', projectId: 'p1', parentFolderId: null, name: 'Root' },
        { id: 'f2', projectId: 'p1', parentFolderId: 'f1', name: 'Sub' },
        { id: 'other', projectId: 'p1', parentFolderId: null, name: 'Other' },
      ],
      videos: [
        video({ id: 'v1', project: 'p1', by: 'a', size: 2 * MB, folder: 'f1' }),
        video({ id: 'v2', project: 'p1', by: 'a', size: 3 * MB, folder: 'f2', trashed: true }),
        video({ id: 'keep', project: 'p1', by: 'a', size: 5 * MB, folder: 'other' }),
      ],
    });
    assert.deepEqual(await t.folders.getDeletePreview('f1', 'actor'), { name: 'Root', videoCount: 2, totalBytes: 5 * MB });
    await assert.rejects(t.folders.deletePermanently('f1', 'root', 'actor', 'A'), BadRequestException);
    assert.equal(t.folderRepo.rows.length, 3);

    await t.folders.deletePermanently('f1', 'Root', 'actor', 'A');
    assert.deepEqual(t.videoRepo.rows.map((v) => v.id), ['keep']);
    assert.deepEqual(t.folderRepo.rows.map((f) => f.id), ['other']);
    assert.equal(t.usersTable.a.storageUsed, 5 * MB);
  });

  test('REVIEWER member cannot permanent-delete (403)', async () => {
    const t = build({
      users: { a: [100 * MB, MB] },
      members: { 'p1:rev': MemberRole.REVIEWER },
      folders: [{ id: 'f1', projectId: 'p1', parentFolderId: null, name: 'F' }],
      videos: [video({ id: 'v1', project: 'p1', by: 'a', size: MB })],
    });
    await assert.rejects(t.videos.deletePermanently('v1', 'Clip', 'rev', 'R'), ForbiddenException);
    await assert.rejects(t.folders.deletePermanently('f1', 'F', 'rev', 'R'), ForbiddenException);
    assert.equal(t.videoRepo.rows.length, 1);
  });

  test('admin with project_content can permanent-delete; the log says viaAdmin', async () => {
    const t = build({
      users: { a: [100 * MB, MB] },
      admins: { adm: [AdminPermission.PROJECT_VIEW, AdminPermission.PROJECT_CONTENT] },
      videos: [video({ id: 'v1', project: 'p1', by: 'a', size: MB })],
    });
    await t.videos.deletePermanently('v1', 'Clip', 'adm', 'Ada');
    assert.equal(t.videoRepo.rows.length, 0);
    const log = t.logs.find((l) => l[1] === ActivityType.VIDEO_DELETED_PERMANENTLY)!;
    assert.equal(log[2], 'adm');
    assert.equal(log[4].viaAdmin, true);
  });

  test('delete preview reports name, versions and bytes (READ access)', async () => {
    const t = build({
      users: {},
      members: { 'p1:rev': MemberRole.REVIEWER },
      videos: [
        video({ id: 'v1', project: 'p1', by: null, size: 2 * MB, asset: 'g', version: 1, title: 'Clip' }),
        video({ id: 'v2', project: 'p1', by: null, size: 3 * MB, asset: 'g', version: 2, title: 'Clip' }),
      ],
    });
    assert.deepEqual(await t.videos.getDeletePreview('v1', 'rev'), { name: 'Clip', videoCount: 2, totalBytes: 5 * MB });
  });
});
