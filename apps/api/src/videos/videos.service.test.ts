import 'reflect-metadata';
import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { VideosService } from './videos.service';

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
