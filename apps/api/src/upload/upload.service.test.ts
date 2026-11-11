import 'reflect-metadata';
import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ForbiddenException } from '@nestjs/common';
import { UploadService } from './upload.service';
import { QuotaExceededException } from '../storage/storage.service';

const HOUR = 3600_000;

describe('UploadService quota reservation', () => {
  let cwd: string;
  let tmp: string;
  let charges: [string, number][];
  let credits: [string | null, number | string][];
  let created: any[];
  let chargeError: Error | null;
  let service: UploadService;

  beforeEach(() => {
    cwd = process.cwd();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-test-'));
    process.chdir(tmp); // UploadService roots its dirs at process.cwd()
    charges = []; credits = []; created = []; chargeError = null;
    const storage: any = {
      charge: async (id: string, n: number) => { if (chargeError) throw chargeError; charges.push([id, n]); },
      credit: async (id: string | null, n: number | string) => { credits.push([id, n]); },
    };
    const videos: any = {
      create: async (d: any) => { created.push(d); return { id: 'v1', ...d }; },
      getLatestVersion: async () => null,
    };
    const queue: any = { enqueue: async () => undefined };
    const projects: any = { assertRole: async () => undefined };
    service = new UploadService(videos, queue, projects, storage);
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const chunkRoot = () => path.join(tmp, 'uploads', 'chunks');
  const init = (userId = 'u1', size = 1000) =>
    service.initUpload('p1', 'a.mp4', size, 'video/mp4', userId);

  test('initUpload charges the uploader fileSize and records reservedBytes in metadata.json', async () => {
    const { uploadId } = await init('u1', 1000);
    assert.deepEqual(charges, [['u1', 1000]]);
    const meta = JSON.parse(fs.readFileSync(path.join(chunkRoot(), uploadId, 'metadata.json'), 'utf-8'));
    assert.equal(meta.reservedBytes, 1000);
  });

  test('initUpload refuses with 413 and creates no chunk dir when over quota', async () => {
    chargeError = new QuotaExceededException(0, 1000);
    await assert.rejects(init(), (e: any) => e.getStatus() === 413);
    assert.deepEqual(fs.readdirSync(chunkRoot()), []);
  });

  test('cancelUpload credits reservedBytes and deletes the dir; another user gets 403', async () => {
    const { uploadId } = await init('u1', 1000);
    await assert.rejects(service.cancelUpload(uploadId, 'u2'), ForbiddenException);
    assert.equal(fs.existsSync(path.join(chunkRoot(), uploadId)), true);
    assert.deepEqual(credits, []);

    assert.deepEqual(await service.cancelUpload(uploadId, 'u1'), { success: true });
    assert.deepEqual(credits, [['u1', 1000]]);
    assert.equal(fs.existsSync(path.join(chunkRoot(), uploadId)), false);
  });

  test('cleanupExpiredUploads releases only sessions older than 24h', async () => {
    const old = (await init('u1', 111)).uploadId;
    const fresh = (await init('u2', 222)).uploadId;
    const now = Date.now();
    const stale = new Date(now - 25 * HOUR);
    const dir = path.join(chunkRoot(), old);
    for (const f of fs.readdirSync(dir)) fs.utimesSync(path.join(dir, f), stale, stale);

    assert.equal(await service.cleanupExpiredUploads(now), 1);
    assert.deepEqual(credits, [['u1', 111]]);
    assert.equal(fs.existsSync(dir), false);
    assert.equal(fs.existsSync(path.join(chunkRoot(), fresh)), true);
  });

  test('completeUpload creates the video with uploadedById = uploader and does not charge again', async () => {
    const { uploadId } = await init('u1', 4);
    await service.uploadChunk(uploadId, 0, Buffer.from('abcd'), 'u1');
    await service.completeUpload(uploadId, 'u1', 'Tester');
    assert.equal(created.length, 1);
    assert.equal(created[0].uploadedById, 'u1');
    assert.equal(charges.length, 1);
    assert.deepEqual(credits, []);
  });
});
