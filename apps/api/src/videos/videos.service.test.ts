import 'reflect-metadata';
import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { VideosService } from './videos.service';
import { ActivityType } from '../activity/activity-log.entity';
import { ProjectAction } from '../projects/project-access';

describe('VideosService content actions and admin logging', () => {
  function make(viaAdmin: boolean) {
    const video: any = { id: 'v1', projectId: 'p1', title: 'Clip', deletedAt: null, folderId: null };
    const repo: any = { findOne: async () => video, save: async (v: any) => v };
    const authorized: ProjectAction[] = [];
    const projects: any = {
      authorize: async (_p: string, _u: string, a: ProjectAction) => { authorized.push(a); return { viaAdmin }; },
    };
    const logs: any[][] = [];
    const activity: any = { record: async (...args: any[]) => { logs.push(args); } };
    const svc = new VideosService(repo, null as any, projects, activity, null as any);
    return { svc, logs, authorized };
  }

  test('admin softDelete records admin_video_trashed; member softDelete records nothing new', async () => {
    const admin = make(true);
    await admin.svc.softDelete('v1', 'adm', 'Ada Admin');
    assert.deepEqual(admin.authorized, [ProjectAction.CONTENT]);
    assert.equal(admin.logs.length, 1);
    assert.deepEqual(admin.logs[0].slice(0, 5), ['p1', ActivityType.ADMIN_VIDEO_TRASHED, 'adm', 'Ada Admin', { videoTitle: 'Clip' }]);

    const member = make(false);
    await member.svc.softDelete('v1', 'mem', 'Mia');
    assert.equal(member.logs.length, 0);
  });

  test('setReviewStatus requires INTERACT', async () => {
    const t = make(false);
    await t.svc.setReviewStatus('v1', 'approved' as any, 'u', 'U');
    assert.deepEqual(t.authorized, [ProjectAction.INTERACT]);
  });
});

const DAY = 24 * 60 * 60 * 1000;

describe('VideosService trash purge', () => {
  test('purgeAllExpiredTrash destroys only videos trashed > TRASH_RETENTION_DAYS ago across projects', async () => {
    const now = Date.now();
    const rows = [
      { id: 'old1', projectId: 'p1', deletedAt: new Date(now - 40 * DAY) },
      { id: 'old2', projectId: 'p2', deletedAt: new Date(now - 31 * DAY) },
      { id: 'recent', projectId: 'p1', deletedAt: new Date(now - 5 * DAY) },
      { id: 'live', projectId: 'p1', deletedAt: null },
    ];
    // The query builder mock applies the real cutoff param, so a wrong cutoff or
    // a project filter sneaking in would change what comes back.
    const repo: any = {
      createQueryBuilder: () => {
        let cutoff: Date | null = null;
        let projectId: string | null = null;
        const qb: any = {
          where: (_: string, p?: any) => { if (p?.projectId) projectId = p.projectId; return qb; },
          andWhere: (_: string, p?: any) => { if (p?.cutoff) cutoff = p.cutoff; if (p?.projectId) projectId = p.projectId; return qb; },
          getMany: async () => rows.filter((r) => r.deletedAt && cutoff && r.deletedAt < cutoff && (!projectId || r.projectId === projectId)),
        };
        return qb;
      },
    };
    const destroyed: string[][] = [];
    const storage: any = { destroyVideos: async (vs: any[]) => { destroyed.push(vs.map((v) => v.id)); } };
    const service = new VideosService(repo, null as any, null as any, null as any, storage);

    assert.equal(await service.purgeAllExpiredTrash(), 2);
    assert.deepEqual(destroyed, [['old1', 'old2']]);
  });
});
