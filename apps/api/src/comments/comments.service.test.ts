import 'reflect-metadata';
import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CommentsService } from './comments.service';

const TOKEN = 'a'.repeat(32);

/** In-memory stand-ins for the collaborators; `calls` records every write. */
function setup(rows: Record<string, any>) {
  const calls: string[] = [];
  const emitted: Array<{ videoId: string; event: string; payload: any }> = [];
  const repo: any = {
    findOne: async ({ where }: any) => rows[where.id] ?? null,
    create: (d: any) => d,
    save: async (d: any) => ({ id: 'new-id', ...d }),
    update: async (id: string, data: any) => { calls.push(`update:${id}`); Object.assign(rows[id], data); },
    delete: async (id: string) => { calls.push(`delete:${id}`); delete rows[id]; },
  };
  const service = new CommentsService(
    repo,
    null as any,
    { findOne: async () => ({ projectId: 'p1' }) } as any,
    null as any,
    { create: async () => undefined } as any,
    { record: async () => undefined } as any,
    { emitToVideo: (videoId: string, event: string, payload: any) => emitted.push({ videoId, event, payload }) } as any,
  );
  return { service, calls, emitted, rows };
}

const guestComment = (over: Record<string, unknown> = {}) => ({
  id: 'c1', videoId: 'v1', content: 'hi', guestEditToken: TOKEN, ...over,
});

describe('CommentsService guest edit/delete', () => {
  for (const [label, run] of [
    ['updateAsGuest', (s: CommentsService, id: string, t: any) => s.updateAsGuest(id, t, { content: 'x' })],
    ['deleteAsGuest', (s: CommentsService, id: string, t: any) => s.deleteAsGuest(id, t)],
  ] as const) {
    describe(label, () => {
      test('wrong token -> Forbidden, nothing written', async () => {
        const { service, calls } = setup({ c1: guestComment() });
        await assert.rejects(run(service, 'c1', 'b'.repeat(32)), ForbiddenException);
        assert.deepEqual(calls, []);
      });

      test('missing/empty token -> Forbidden', async () => {
        const { service, calls } = setup({ c1: guestComment() });
        await assert.rejects(run(service, 'c1', undefined), ForbiddenException);
        await assert.rejects(run(service, 'c1', ''), ForbiddenException);
        assert.deepEqual(calls, []);
      });

      test('comment without guestEditToken (member-authored) -> Forbidden even for empty/undefined token', async () => {
        const { service, calls } = setup({ c1: guestComment({ guestEditToken: null }) });
        await assert.rejects(run(service, 'c1', ''), ForbiddenException);
        await assert.rejects(run(service, 'c1', undefined), ForbiddenException);
        await assert.rejects(run(service, 'c1', 'null'), ForbiddenException);
        assert.deepEqual(calls, []);
      });

      test('unknown comment -> Forbidden (no existence leak)', async () => {
        const { service } = setup({});
        await assert.rejects(run(service, 'nope', TOKEN), ForbiddenException);
      });
    });
  }

  test('updateAsGuest with the correct token updates the comment', async () => {
    const { service, calls, rows } = setup({ c1: guestComment() });
    await service.updateAsGuest('c1', TOKEN, { content: 'edited' });
    assert.deepEqual(calls, ['update:c1']);
    assert.equal(rows.c1.content, 'edited');
  });

  test('deleteAsGuest with the correct token deletes the comment', async () => {
    const { service, calls } = setup({ c1: guestComment() });
    assert.deepEqual(await service.deleteAsGuest('c1', TOKEN), { success: true });
    assert.deepEqual(calls, ['delete:c1']);
  });
});

describe('CommentsService.create', () => {
  const base = { videoId: 'v1', actorName: 'G', content: 'hello', timestamp: 5, frameNumber: 120 };

  test('endTimestamp <= timestamp -> BadRequest, nothing saved', async () => {
    const { service, emitted } = setup({});
    await assert.rejects(service.create({ ...base, endTimestamp: 5 }), BadRequestException);
    await assert.rejects(service.create({ ...base, endTimestamp: 4 }), BadRequestException);
    assert.deepEqual(emitted, []);
  });

  test('parentId from another video -> BadRequest, nothing broadcast', async () => {
    const { service, emitted } = setup({ parent: { id: 'parent', videoId: 'other-video', userId: 'u2' } });
    await assert.rejects(service.create({ ...base, parentId: 'parent' }), BadRequestException);
    assert.deepEqual(emitted, []);
  });

  test('unknown parentId -> BadRequest', async () => {
    const { service } = setup({});
    await assert.rejects(service.create({ ...base, parentId: 'ghost' }), BadRequestException);
  });

  test('valid reply on the same video is saved and broadcast with ids only', async () => {
    const { service, emitted } = setup({ parent: { id: 'parent', videoId: 'v1', userId: null } });
    const saved = await service.create({ ...base, parentId: 'parent', endTimestamp: 6 });
    assert.equal(saved.parentId, 'parent');
    assert.equal(emitted.length, 1);
    assert.deepEqual(emitted[0].payload, { commentId: 'new-id', parentId: 'parent', videoId: 'v1' });
  });

  test('guest comment gets an edit token that is never broadcast; member comment gets none', async () => {
    const { service, emitted } = setup({});
    const guest = await service.create({ ...base, guestName: 'G' });
    assert.match(guest.guestEditToken!, /^[0-9a-f]{32}$/);
    assert.ok(!JSON.stringify(emitted).includes(guest.guestEditToken!));

    const member = await service.create({ ...base, userId: 'u1' });
    assert.equal(member.guestEditToken, null);
  });
});
