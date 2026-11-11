// Run: npx ts-node --transpile-only src/videos/stream-file.util.check.ts  (from apps/api)
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseRange, streamVideoFile } from './stream-file.util';

const SIZE = 1000;
assert.deepStrictEqual(parseRange('bytes=0-99', SIZE), { start: 0, end: 99 }); // normal
assert.deepStrictEqual(parseRange('bytes=100-', SIZE), { start: 100, end: 999 }); // open-ended
assert.deepStrictEqual(parseRange('bytes=-500', SIZE), { start: 500, end: 999 }); // suffix = LAST 500
assert.deepStrictEqual(parseRange('bytes=-5000', SIZE), { start: 0, end: 999 }); // suffix > size
assert.deepStrictEqual(parseRange('bytes=900-5000', SIZE), { start: 900, end: 999 }); // end clamped
assert.strictEqual(parseRange('bytes=500-100', SIZE), 'unsatisfiable'); // reversed
assert.strictEqual(parseRange('bytes=1000-', SIZE), 'unsatisfiable'); // start == EOF
assert.strictEqual(parseRange('bytes=2000-3000', SIZE), 'unsatisfiable'); // beyond EOF
assert.strictEqual(parseRange('bytes=-0', SIZE), 'unsatisfiable');
assert.strictEqual(parseRange('bytes=0-1,5-9', SIZE), null); // multi-range -> full 200
assert.strictEqual(parseRange('garbage', SIZE), null);
assert.strictEqual(parseRange(undefined, SIZE), null);

// End-to-end through streamVideoFile with a real file and a fake response.
const file = path.join(os.tmpdir(), `range-check-${process.pid}.bin`);
fs.writeFileSync(file, Buffer.from(Array.from({ length: SIZE }, (_, i) => i % 256)));
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
(async () => {
  try {
    const suffix = await call('bytes=-500');
    assert.strictEqual(suffix.status, 206);
    assert.strictEqual(suffix.headers['Content-Range'], 'bytes 500-999/1000');
    assert.strictEqual(suffix.body.length, 500);
    assert.strictEqual(suffix.body[0], 500 % 256);
    const bad = await call('bytes=500-100');
    assert.strictEqual(bad.status, 416);
    assert.strictEqual(bad.headers['Content-Range'], 'bytes */1000');
    assert.strictEqual((await call('bytes=1000-')).status, 416);
    assert.strictEqual((await call('bytes=100-')).headers['Content-Length'], 900);
    assert.strictEqual((await call()).status, 200);
    console.log('ALL RANGE CHECKS PASSED');
  } finally {
    fs.unlinkSync(file);
  }
})();
