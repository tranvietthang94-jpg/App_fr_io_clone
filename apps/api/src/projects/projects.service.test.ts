import 'reflect-metadata';
import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectAction } from './project-access';
import { MemberRole } from './project-member.entity';
import { StorageService } from '../storage/storage.service';
import { User } from '../auth/user.entity';

describe('ProjectsService.authorize', () => {
  const PROJECT = { id: 'p1', ownerId: 'owner' };
  // members: userId -> role; admins: userId -> adminPermissions
  function make(members: Record<string, string>, admins: Record<string, string[]> = {}, projectExists = true) {
    const projectsRepo: any = { findOne: async () => (projectExists ? PROJECT : null) };
    const membersRepo: any = {
      findOne: async ({ where }: any) => {
        if (where.userId === 'owner') return { role: 'owner' };
        const role = members[where.userId];
        return role ? { role } : null;
      },
    };
    const usersRepo: any = {
      findOne: async ({ where }: any) => ({ id: where.id, adminPermissions: admins[where.id] ?? [] }),
    };
    return new ProjectsService(projectsRepo, membersRepo, usersRepo, null as any, null as any, null as any, null as any, null as any);
  }

  test('authorize returns 404 for a stranger, 403 for view-only admin on INTERACT, ok with viaAdmin=true for view admin on READ', async () => {
    const svc = make({}, { adm: ['project_view'] });
    await assert.rejects(svc.authorize('p1', 'stranger', ProjectAction.READ), NotFoundException);
    await assert.rejects(svc.authorize('p1', 'adm', ProjectAction.INTERACT), ForbiddenException);
    const r = await svc.authorize('p1', 'adm', ProjectAction.READ);
    assert.equal(r.viaAdmin, true);
    assert.equal(r.role, null);
  });

  test('members are authorized without viaAdmin; reviewer cannot CONTENT', async () => {
    const svc = make({ rev: 'reviewer' });
    assert.equal((await svc.authorize('p1', 'rev', ProjectAction.INTERACT)).viaAdmin, false);
    await assert.rejects(svc.authorize('p1', 'rev', ProjectAction.CONTENT), ForbiddenException);
  });

  test('super admin passes CONTENT on any project', async () => {
    process.env.SUPER_ADMIN_USER_ID = 'boss';
    try {
      const r = await make({}).authorize('p1', 'boss', ProjectAction.CONTENT);
      assert.equal(r.viaAdmin, true);
    } finally {
      delete process.env.SUPER_ADMIN_USER_ID;
    }
  });

  test('missing project is 404', async () => {
    await assert.rejects(make({}, {}, false).authorize('nope', 'u', ProjectAction.READ), NotFoundException);
  });

  test('assertRole stays member-only: a content admin gets 403 for EDITOR, a stranger 404', async () => {
    const svc = make({}, { adm: ['project_view', 'project_content'] });
    await assert.rejects(svc.assertRole('p1', 'adm', MemberRole.EDITOR), ForbiddenException);
    await assert.rejects(svc.assertRole('p1', 'stranger', MemberRole.EDITOR), NotFoundException);
  });

  test('getMyAccess reports what the caller may do', async () => {
    const svc = make({ ed: 'editor' }, { adm: ['project_view', 'project_interact'] });
    assert.deepEqual((await svc.getMyAccess('p1', 'ed')).myAccess, {
      role: 'editor', canInteract: true, canContent: true, canEdit: true, canManage: false, viaAdmin: false,
    });
    assert.deepEqual((await svc.getMyAccess('p1', 'adm')).myAccess, {
      role: null, canInteract: true, canContent: false, canEdit: false, canManage: false, viaAdmin: true,
    });
  });
});

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
