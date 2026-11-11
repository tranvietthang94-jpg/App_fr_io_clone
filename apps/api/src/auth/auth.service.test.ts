import 'reflect-metadata';
import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import * as bcrypt from 'bcryptjs';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

/** AuthService over plain-object mocks; `disconnected` records gateway.disconnectUser calls. */
function setup(opts: { user?: any; refreshRow?: any } = {}) {
  const disconnected: string[] = [];
  const updates: any[] = [];
  const users: any = {
    createQueryBuilder: () => {
      const qb: any = { addSelect: () => qb, where: () => qb, getOne: async () => opts.user ?? null };
      return qb;
    },
    save: async (u: any) => u,
  };
  const refreshTokens: any = {
    findOne: async () => opts.refreshRow ?? null,
    update: async (...args: any[]) => { updates.push(args); },
  };
  const service = new AuthService(
    users, refreshTokens, null as any, null as any, null as any,
    { disconnectUser: (id: string) => disconnected.push(id) } as any,
  );
  return { service, disconnected, updates };
}

describe('AuthService session revocation drops live sockets', () => {
  test('changePassword revokes refresh tokens and disconnects the user\'s sockets', async () => {
    const user = { id: 'u1', passwordHash: bcrypt.hashSync('old-pass', 4) };
    const { service, disconnected, updates } = setup({ user });
    await service.changePassword('u1', 'old-pass', 'new-pass-123');
    assert.equal(updates.length, 1);
    assert.deepEqual(disconnected, ['u1']);
  });

  test('changePassword with the wrong current password revokes nothing and disconnects nobody', async () => {
    const user = { id: 'u1', passwordHash: bcrypt.hashSync('old-pass', 4) };
    const { service, disconnected, updates } = setup({ user });
    await assert.rejects(service.changePassword('u1', 'WRONG', 'new-pass-123'), UnauthorizedException);
    assert.deepEqual(updates, []);
    assert.deepEqual(disconnected, []);
  });

  test('refresh-token reuse revokes all sessions and disconnects the user\'s sockets', async () => {
    const { service, disconnected, updates } = setup({ refreshRow: { userId: 'u9', revokedAt: new Date() } });
    await assert.rejects(service.refresh('stolen'), UnauthorizedException);
    assert.equal(updates.length, 1);
    assert.deepEqual(disconnected, ['u9']);
  });

  test('an unknown refresh token disconnects nobody', async () => {
    const { service, disconnected } = setup();
    await assert.rejects(service.refresh('nope'), UnauthorizedException);
    assert.deepEqual(disconnected, []);
  });
});
