import test from 'node:test';
import assert from 'node:assert/strict';
import { planInstanceTexture, uploadInstanceTexture } from '../src/wavefront-instance-texture.js';

test('packs whole records across rows within device dimensions', () => {
  for (const limit of [9, 64, 4096, 8192]) {
    const row = Math.floor(limit / 9);
    for (const count of [1, row, row + 1, row * limit]) {
      const plan = planInstanceTexture(count, limit);
      assert.equal(plan.recordsPerRow, Math.min(count, row));
      assert.equal(plan.width, plan.recordsPerRow * 9);
      assert.equal(plan.height, Math.ceil(count / plan.recordsPerRow));
      assert.equal(plan.bytes, plan.width * plan.height * 16);
      assert.ok(plan.width <= limit && plan.height <= limit);
    }
    assert.throws(() => planInstanceTexture(row * limit + 1, limit), /dimension/i);
  }
  for (const count of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => planInstanceTexture(count, 8192));
  }
  assert.throws(() => planInstanceTexture(1, 8), /dimension/i);
  assert.throws(() => planInstanceTexture(1, NaN));
});

test('30,000 instances exceed the old row limit without duplicating their geometry', () => {
  const plan = planInstanceTexture(30000, 8192);
  assert.ok(plan.height < 8192);
  assert.ok(plan.bytes >= 30000 * 144);
  assert.ok(plan.bytes < 30000 * 144 + plan.width * 16);
});

test('bounded uploads preserve every record across rows and zero only final padding', async () => {
  const count = 10001, plan = planInstanceTexture(count, 1024);
  const layout = { ...plan };
  const data = new Uint8Array(count * 144);
  for (let i = 0; i < data.length; i++) data[i] = i % 251;
  const reconstructed = new Uint8Array(layout.bytes), writes = [];
  let waits = 0;
  const device = { queue: {
    writeTexture(destination, chunk, packing, size) {
      assert.ok(chunk.byteLength <= 32768);
      assert.equal(packing.bytesPerRow, layout.width * 16);
      assert.equal(size.width, layout.width);
      reconstructed.set(chunk, destination.origin.y * packing.bytesPerRow);
      writes.push(size.height);
    }, onSubmittedWorkDone: async () => { waits++; },
  } };
  await uploadInstanceTexture(device, {}, data.buffer, layout, { chunkBytes: 32768 });
  assert.deepEqual(reconstructed.subarray(0, data.length), data);
  assert.ok(reconstructed.subarray(data.length).every(n => n === 0));
  assert.equal(waits, writes.length);
  await assert.rejects(uploadInstanceTexture(device, {}, data.buffer, layout, { chunkBytes: 4 }), /chunk/i);
  await assert.rejects(uploadInstanceTexture(device, {}, new ArrayBuffer(1), layout), /record/i);
});
