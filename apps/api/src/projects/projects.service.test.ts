import 'reflect-metadata';
import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProjectsService } from './projects.service';
import { StorageService } from '../storage/storage.service';
import { User } from '../auth/user.entity';

describe('ProjectsService.delete', () => {
  let cwd: string;
  let tmp: string;
  beforeEach(() => {
    cwd = process.cwd();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'project-delete-'));
    process.chdir(tmp);
  });
  afterEach(() => {
    process.chdir(cwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test("deleting a project destroys its videos' files and credits uploaders", async () => {
    const used: Record<string, number> = { a: 100, b: 100 };
    const removedRows: string[] = [];
    const usersRepo: any = {
      findOne: async ({ where }: any) => ({ id: where.id, storageQuota: null, storageUsed: used[where.id] }),
      update: async (id: string, patch: any) => { used[id] = patch.storageUsed; },
    };
    const ds: any = {
      transaction: async (cb: any) => cb({ getRepository: () => usersRepo }),
      getRepository: (e: any) =>
        e === User ? usersRepo : { remove: async (vs: any[]) => { removedRows.push(...vs.map((v) => v.id)); } },
    };
    const storage = new StorageService(ds);

    const mk = (id: string, by: string, size: string) => {
      const filePath = path.join(tmp, `${id}.mp4`);
      fs.writeFileSync(filePath, 'x');
      return { id, uploadedById: by, fileSize: size, filePath };
    };
    // includes a trashed video: it still occupies disk and quota
    const videos = [mk('v1', 'a', '10'), mk('v2', 'b', '30'), { ...mk('v3', 'a', '5'), deletedAt: new Date() }];
    const removedProjects: any[] = [];
    const projectsRepo: any = { remove: async (p: any) => { removedProjects.push(p); } };
    const videosRepo: any = { find: async ({ where }: any) => (where.projectId === 'p1' ? videos : []) };

    const service = new ProjectsService(
      projectsRepo, null as any, null as any, null as any, null as any, null as any, videosRepo, storage,
    );
    (service as any).assertRole = async () => ({ id: 'p1' });

    await service.delete('p1', 'owner');

    assert.deepEqual(removedRows, ['v1', 'v2', 'v3']);
    assert.ok(videos.every((v) => !fs.existsSync(v.filePath)));
    assert.deepEqual(used, { a: 85, b: 70 });
    assert.equal(removedProjects.length, 1);
  });
});
