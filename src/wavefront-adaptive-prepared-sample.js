import { encodeAdaptiveBootstrap } from "./wavefront-adaptive-bootstrap.js";
import { encodeAdaptiveCameraRays } from "./wavefront-adaptive-camera.js";
import { createGpuParallelismCounters, recordDirectDispatch, recordIndirectDispatch } from "./wavefront-frame-runtime.js";
import { WORKGROUP_SIZE } from "./wavefront-core.js";

// Internal command composition only. The caller owns immutable tier/frame slots,
// submission, complete-camera-sample production and count commit.
export function createAdaptivePreparedSampleEncoder(options = {}) {
  if (options.enabled !== true) return null;
  const { bootstrapPipelines, cameraPipeline, frameEncoder, counterBuffer,
    primaryDispatchBuffer, getBindGroups } = options;
  return Object.freeze({
    encode(encoder, { tile, frameOffset, tileOffset, parallelism = createGpuParallelismCounters() }) {
      const selectedTile = { x: tile.x, y: tile.y, width: tile.width, height: tile.height };
      for (const value of Object.values(selectedTile)) {
        if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError("Invalid prepared sample tile.");
      }
      const pixels = selectedTile.width * selectedTile.height;
      if (!pixels || pixels > 16384 || selectedTile.x + selectedTile.width > 0xffffffff
        || selectedTile.y + selectedTile.height > 0xffffffff) throw new RangeError("Invalid prepared sample tile.");
      for (const offset of [frameOffset, tileOffset]) {
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > 0xffffffff || offset % 256 !== 0) {
          throw new RangeError("Invalid immutable prepared sample offset.");
        }
      }
      const { bootstrapFrame, bootstrapWorklist, cameraFrame, cameraWorklist } = getBindGroups();
      if (!bootstrapFrame || !bootstrapWorklist || !cameraFrame || !cameraWorklist) throw new TypeError("Missing prepared sample binding.");
      const groups = Math.ceil(pixels / WORKGROUP_SIZE);
      encodeAdaptiveBootstrap(encoder, bootstrapPipelines, bootstrapFrame, bootstrapWorklist,
        counterBuffer, frameOffset, tileOffset, pixels);
      recordDirectDispatch(parallelism, [groups], WORKGROUP_SIZE);
      recordDirectDispatch(parallelism, [groups], WORKGROUP_SIZE);
      encodeAdaptiveCameraRays(encoder, cameraPipeline, cameraFrame, cameraWorklist,
        primaryDispatchBuffer, frameOffset, tileOffset);
      recordIndirectDispatch(parallelism, groups, WORKGROUP_SIZE);
      frameEncoder.encodePreparedTileSample(encoder, selectedTile, frameOffset, parallelism);
    },
  });
}
