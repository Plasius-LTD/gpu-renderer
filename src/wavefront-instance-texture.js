import { waitForSubmittedGpuWork } from './wavefront-gpu-synchronization.js';
import { WAVEFRONT_INSTANCE_BYTES } from './wavefront-instances.js';

const TEXELS_PER_RECORD = WAVEFRONT_INSTANCE_BYTES / 16;

/** Whole records never cross rows; limits come from the granted GPU device. */
export function planInstanceTexture(count, maxDimension = 8192) {
  if (!Number.isSafeInteger(count) || count < 1 || count >= 0xffffffff) {
    throw new Error('Instance count must fit unsigned shader addressing.');
  }
  if (!Number.isSafeInteger(maxDimension) || maxDimension < TEXELS_PER_RECORD) {
    throw new Error('GPU instance texture dimension cannot hold one record.');
  }
  const recordsPerRow = Math.min(count, Math.floor(maxDimension / TEXELS_PER_RECORD));
  const width = recordsPerRow * TEXELS_PER_RECORD, height = Math.ceil(count / recordsPerRow);
  if (height > maxDimension) throw new Error('GPU instance texture dimension limit exceeded.');
  const bytes = width * height * 16;
  if (!Number.isSafeInteger(bytes)) throw new Error('Instance texture byte size is out of range.');
  return Object.freeze({ count, recordsPerRow, width, height, bytes });
}

/** Queue writes have no 256-byte row-alignment requirement. Bound staging by rows. */
export async function uploadInstanceTexture(device, texture, buffer, layout, { chunkBytes = 8 * 1024 * 1024 } = {}) {
  const bytesPerRow = layout.width * 16;
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < bytesPerRow) {
    throw new Error('Instance upload chunk must hold at least one texture row.');
  }
  if (buffer.byteLength !== layout.count * WAVEFRONT_INSTANCE_BYTES) {
    throw new Error('Instance upload does not match its record count.');
  }
  const source = new Uint8Array(buffer), rowsPerChunk = Math.floor(chunkBytes / bytesPerRow);
  for (let y = 0; y < layout.height; y += rowsPerChunk) {
    const rows = Math.min(rowsPerChunk, layout.height - y), offset = y * bytesPerRow;
    const length = rows * bytesPerRow;
    let chunk = source.subarray(offset, offset + length);
    if (chunk.byteLength < length) {
      const padded = new Uint8Array(length); padded.set(chunk); chunk = padded;
    }
    device.queue.writeTexture({ texture, origin: { x: 0, y, z: 0 } }, chunk,
      { bytesPerRow, rowsPerImage: rows }, { width: layout.width, height: rows, depthOrArrayLayers: 1 });
    await waitForSubmittedGpuWork(device, { timeoutMs: 10000, maxWaitMs: 10000, allowTimeout: false });
  }
}
