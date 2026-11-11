import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseRange, streamVideoFile } from './stream-file.util';

const SIZE = 1000;

describe('parseRange', () => {
  test('normal range', () => assert.deepEqual(parseRange('bytes=0-99', SIZE), { start: 0, end: 99 }));
  test('open-ended range', () => assert.deepEqual(parseRange('bytes=100-', SIZE), { start: 100, end: 999 }));
  test('suffix range is the LAST N bytes', () => assert.deepEqual(parseRange('bytes=-500', SIZE), { start: 500, end: 999 }));
  test('suffix larger than file is the whole file', () => assert.deepEqual(parseRange('bytes=-5000', SIZE), { start: 0, end: 999 }));
  test('end past EOF is clamped', () => assert.deepEqual(parseRange('bytes=900-5000', SIZE), { start: 900, end: 999 }));
  test('reversed range is unsatisfiable', () => assert.equal(parseRange('bytes=500-100', SIZE), 'unsatisfiable'));
  test('start at EOF is unsatisfiable', () => assert.equal(parseRange('bytes=1000-', SIZE), 'unsatisfiable'));
  test('start beyond EOF is unsatisfiable', () => assert.equal(parseRange('bytes=2000-3000', SIZE), 'unsatisfiable'));
  test('zero-length suffix is unsatisfiable', () => assert.equal(parseRange('bytes=-0', SIZE), 'unsatisfiable'));
  test('multi-range falls back to full response', () => assert.equal(parseRange('bytes=0-1,5-9', SIZE), null));
  test('malformed header falls back to full response', () => assert.equal(parseRange('garbage', SIZE), null));
  test('missing header falls back to full response', () => assert.equal(parseRange(undefined, SIZE), null));
});

describe('streamVideoFile', () => {
  const file = path.join(os.tmpdir(), `range-test-${process.pid}.bin`);
  before(() => fs.writeFileSync(file, Buffer.from(Array.from({ length: SIZE }, (_, i) => i % 256))));
  after(() => fs.unlinkSync(file));

  const call = (range?: string) =>
    new Promise<{ status: number; headers: any; body: Buffer }>((resolve) => {
      const chunks: Buffer[] = [];
      const res: any = {
        writeHead(status: number, headers: any) { res.status = status; res.headers = headers; },
        write(c: Buffer) { chunks.push(c); return true; },
        end(c?: Buffer) { if (c) chunks.push(c); resolve({ status: res.status, headers: res.headers, body: Buffer.concat(chunks) }); },
        on() { return res; }, once() { return res; }, emit() { return true; }, removeListener() { return res; },
      };
      streamVideoFile(file, { headers: { range } } as any, res);
    });

  test('suffix range serves the tail of the file', async () => {
    const r = await call('bytes=-500');
    assert.equal(r.status, 206);
    assert.equal(r.headers['Content-Range'], 'bytes 500-999/1000');
    assert.equal(r.body.length, 500);
    assert.equal(r.body[0], 500 % 256);
  });

  test('unsatisfiable range answers 416 with Content-Range bytes */size', async () => {
    for (const range of ['bytes=500-100', 'bytes=1000-']) {
      const r = await call(range);
      assert.equal(r.status, 416, range);
      assert.equal(r.headers['Content-Range'], 'bytes */1000');
    }
  });

  test('open-ended range reports the remaining length', async () => {
    assert.equal((await call('bytes=100-')).headers['Content-Length'], 900);
  });

  test('no Range header serves the full file with 200', async () => {
    const r = await call();
    assert.equal(r.status, 200);
    assert.equal(r.body.length, SIZE);
  });
});
