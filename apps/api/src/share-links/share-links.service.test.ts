import 'reflect-metadata';
import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import * as bcrypt from 'bcryptjs';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ShareLinksService } from './share-links.service';

const HASH = bcrypt.hashSync('s3cret', 4);
const HOUR = 3_600_000;

const makeLink = (over: Record<string, unknown> = {}) => ({
  token: 'tok',
  videoId: 'v1',
  passwordHash: null,
  revokedAt: null,
  expiresAt: null,
  video: { deletedAt: null },
  ...over,
});

/** Service whose repository returns `link` for any lookup (null = unknown token). */
const serviceWith = (link: unknown) =>
  new ShareLinksService({ findOne: async () => link } as any, null as any, null as any, null as any);

describe('ShareLinksService.resolveForAccess', () => {
  test('unknown token -> NotFound', async () => {
    await assert.rejects(serviceWith(null).resolveForAccess('nope'), NotFoundException);
  });

  test('revoked link -> NotFound', async () => {
    await assert.rejects(serviceWith(makeLink({ revokedAt: new Date() })).resolveForAccess('tok'), NotFoundException);
  });

  test('expired link -> NotFound', async () => {
    const link = makeLink({ expiresAt: new Date(Date.now() - HOUR) });
    await assert.rejects(serviceWith(link).resolveForAccess('tok'), NotFoundException);
  });

  test('soft-deleted video -> NotFound', async () => {
    const link = makeLink({ video: { deletedAt: new Date() } });
    await assert.rejects(serviceWith(link).resolveForAccess('tok'), NotFoundException);
  });

  test('not-yet-expired link resolves', async () => {
    const link = makeLink({ expiresAt: new Date(Date.now() + HOUR) });
    assert.equal(await serviceWith(link).resolveForAccess('tok'), link);
  });

  test('password link without password -> Unauthorized', async () => {
    await assert.rejects(serviceWith(makeLink({ passwordHash: HASH })).resolveForAccess('tok'), UnauthorizedException);
  });

  test('password link with empty password -> Unauthorized', async () => {
    await assert.rejects(serviceWith(makeLink({ passwordHash: HASH })).resolveForAccess('tok', ''), UnauthorizedException);
  });

  test('password link with wrong password -> Unauthorized', async () => {
    await assert.rejects(
      serviceWith(makeLink({ passwordHash: HASH })).resolveForAccess('tok', 'wrong'),
      UnauthorizedException,
    );
  });

  test('password link with correct password returns the link', async () => {
    const link = makeLink({ passwordHash: HASH });
    assert.equal(await serviceWith(link).resolveForAccess('tok', 's3cret'), link);
  });

  test('link without password returns the link (a supplied password is ignored)', async () => {
    const link = makeLink();
    assert.equal(await serviceWith(link).resolveForAccess('tok'), link);
    assert.equal(await serviceWith(link).resolveForAccess('tok', 'whatever'), link);
  });
});
