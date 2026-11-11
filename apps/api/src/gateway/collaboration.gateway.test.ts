import 'reflect-metadata';
import { test, describe, before } from 'node:test';
import * as assert from 'node:assert/strict';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { CollaborationGateway } from './collaboration.gateway';

before(() => Logger.overrideLogger(false)); // expected auth failures log errors

type Sent = { room: string; event: string; payload: any };

/** Fake socket recording join/leave and every room broadcast. */
function fakeClient(id: string, auth: Record<string, unknown>) {
  const sent: Sent[] = [];
  const own: Array<{ event: string; payload: any }> = [];
  const client: any = {
    id,
    handshake: { auth },
    disconnected: false,
    joined: [] as string[],
    sent,
    own,
    disconnect() { client.disconnected = true; },
    join(room: string) { client.joined.push(room); },
    leave() {},
    to: (room: string) => ({ emit: (event: string, payload: any) => sent.push({ room, event, payload }) }),
    emit: (event: string, payload: any) => own.push({ event, payload }),
  };
  return client;
}

function makeGateway(opts: { resolve?: (token: string, password?: string) => Promise<any>; ownedVideos?: string[] } = {}) {
  const resolveCalls: Array<[string, string | undefined]> = [];
  const shareLinks: any = {
    resolveForAccess: async (token: string, password?: string) => {
      resolveCalls.push([token, password]);
      return opts.resolve ? opts.resolve(token, password) : { videoId: 'v1' };
    },
  };
  const jwt: any = {
    verify: (t: string) => {
      if (t !== 'good') throw new Error('bad jwt');
      return { sub: 'u1', username: 'alice' };
    },
  };
  const videos: any = {
    findOwned: async (videoId: string) => {
      if (!(opts.ownedVideos ?? ['v1']).includes(videoId)) throw new Error('not owned');
    },
  };
  return { gateway: new CollaborationGateway(jwt, videos, shareLinks), resolveCalls };
}

describe('CollaborationGateway connection', () => {
  test('connect with no credentials is disconnected', async () => {
    const { gateway } = makeGateway();
    const c = fakeClient('c1', {});
    await gateway.handleConnection(c);
    assert.equal(c.disconnected, true);
  });

  test('invalid JWT is disconnected; valid JWT stays connected and gets a personal room', async () => {
    const { gateway } = makeGateway();
    const bad = fakeClient('c1', { token: 'forged' });
    await gateway.handleConnection(bad);
    assert.equal(bad.disconnected, true);

    const ok = fakeClient('c2', { token: 'good' });
    await gateway.handleConnection(ok);
    assert.equal(ok.disconnected, false);
    assert.deepEqual(ok.joined, ['user:u1']);
  });

  test('guest whose link is rejected is disconnected and cannot join', async () => {
    const { gateway } = makeGateway({ resolve: async () => { throw new UnauthorizedException(); } });
    const c = fakeClient('c1', { shareToken: 't' });
    await gateway.handleConnection(c);
    assert.equal(c.disconnected, true);
    await gateway.handleJoinVideo(c, { videoId: 'v1' });
    assert.deepEqual(c.joined, []);
  });

  test('sharePassword is passed through to resolveForAccess', async () => {
    const { gateway, resolveCalls } = makeGateway();
    await gateway.handleConnection(fakeClient('c1', { shareToken: 't', sharePassword: 'pw' }));
    assert.deepEqual(resolveCalls, [['t', 'pw']]);
  });

  test('non-string and over-long sharePassword are ignored (resolve sees undefined)', async () => {
    const { gateway, resolveCalls } = makeGateway();
    for (const [i, bad] of ([123, { $ne: '' }, ['x'], 'x'.repeat(201)] as unknown[]).entries()) {
      await gateway.handleConnection(fakeClient(`c${i}`, { shareToken: 't', sharePassword: bad }));
    }
    assert.deepEqual(resolveCalls.map((c) => c[1]), [undefined, undefined, undefined, undefined]);
  });

  test('a 200-char sharePassword is still accepted', async () => {
    const { gateway, resolveCalls } = makeGateway();
    await gateway.handleConnection(fakeClient('c1', { shareToken: 't', sharePassword: 'x'.repeat(200) }));
    assert.equal(resolveCalls[0][1], 'x'.repeat(200));
  });
});

describe('CollaborationGateway join:video', () => {
  test('guest can join only the video its link is bound to', async () => {
    const { gateway } = makeGateway({ resolve: async () => ({ videoId: 'v1' }) });
    const c = fakeClient('c1', { shareToken: 't', guestName: 'G' });
    await gateway.handleConnection(c);

    await gateway.handleJoinVideo(c, { videoId: 'v2' });
    assert.deepEqual(c.joined, []);
    assert.equal(c.own.at(-1)?.event, 'error');

    await gateway.handleJoinVideo(c, { videoId: 'v1' });
    assert.deepEqual(c.joined, ['video:v1']);
    assert.equal(c.own.at(-1)?.event, 'room:users');
  });

  test('authenticated user cannot join a video they do not own', async () => {
    const { gateway } = makeGateway({ ownedVideos: ['v1'] });
    const c = fakeClient('c1', { token: 'good' });
    await gateway.handleConnection(c);
    await gateway.handleJoinVideo(c, { videoId: 'other' });
    assert.ok(!c.joined.includes('video:other'));
    assert.equal(c.own.at(-1)?.event, 'error');
  });

  test('join:video emitted before guest auth resolves still joins (authenticating await)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { gateway } = makeGateway({ resolve: async () => { await gate; return { videoId: 'v1' }; } });
    const c = fakeClient('c1', { shareToken: 't' });

    const connecting = gateway.handleConnection(c); // auth still pending
    const joining = gateway.handleJoinVideo(c, { videoId: 'v1' }); // client already emitted join
    release();
    await Promise.all([connecting, joining]);

    assert.deepEqual(c.joined, ['video:v1']);
  });

  test('join:video from a socket that never connected is ignored', async () => {
    const { gateway } = makeGateway();
    const c = fakeClient('ghost', {});
    await gateway.handleJoinVideo(c, { videoId: 'v1' });
    assert.deepEqual(c.joined, []);
  });
});

describe('CollaborationGateway room-scoped broadcasts', () => {
  const handlers: Array<[string, (g: CollaborationGateway, c: any, d: any) => void, any]> = [
    ['comment:new', (g, c, d) => g.handleNewComment(c, d), { content: 'x', timestamp: 1, frameNumber: 2 }],
    ['comment:typing', (g, c, d) => g.handleTyping(c, d), { isTyping: true }],
    ['video:seek', (g, c, d) => g.handleVideoSeek(c, d), { timestamp: 3 }],
    ['video:play', (g, c, d) => g.handleVideoPlay(c, d), { timestamp: 3 }],
    ['video:pause', (g, c, d) => g.handleVideoPause(c, d), { timestamp: 3 }],
    ['comment:resolved', (g, c, d) => g.handleCommentResolved(c, d), { commentId: 'c', resolved: true }],
    ['comment:reaction', (g, c, d) => g.handleCommentReaction(c, d), { commentId: 'c' }],
  ];

  for (const [event, call, extra] of handlers) {
    test(`${event}: only broadcasts into the room the socket joined`, async () => {
      const { gateway } = makeGateway({ ownedVideos: ['v1', 'v2'] });
      const c = fakeClient('c1', { token: 'good' });
      await gateway.handleConnection(c);

      // Not in any room yet -> dropped.
      call(gateway, c, { videoId: 'v1', ...extra });
      assert.deepEqual(c.sent.filter((s: Sent) => s.event === event), []);

      await gateway.handleJoinVideo(c, { videoId: 'v1' });

      // Spoofed videoId for a room this socket never joined -> dropped.
      call(gateway, c, { videoId: 'v2', ...extra });
      assert.deepEqual(c.sent.filter((s: Sent) => s.event === event), []);

      // Joined room -> broadcast there only.
      call(gateway, c, { videoId: 'v1', ...extra });
      const out = c.sent.filter((s: Sent) => s.event === event);
      assert.equal(out.length, 1);
      assert.equal(out[0].room, 'video:v1');
    });
  }

  test('a guest cannot broadcast into another video by spoofing videoId', async () => {
    const { gateway } = makeGateway({ resolve: async () => ({ videoId: 'v1' }) });
    const c = fakeClient('c1', { shareToken: 't' });
    await gateway.handleConnection(c);
    await gateway.handleJoinVideo(c, { videoId: 'v1' });
    gateway.handleVideoSeek(c, { videoId: 'v2', timestamp: 9 });
    assert.deepEqual(c.sent.filter((s: Sent) => s.event === 'video:seek'), []);
  });
});
