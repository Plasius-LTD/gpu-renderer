import { recordDirectDispatch } from "./wavefront-frame-runtime.js";
import { createConfigPayload } from "./wavefront-packers.js";
import { WORKGROUP_SIZE } from "./wavefront-core.js";

export function dispatchWavefrontGpuAccelerationBuild({
  config,
  accelerationBuilt,
  tiles,
  device,
  bvhBuildConfigBuffer,
  configBufferStride,
  bvhBuildBindGroup,
  pipelines,
  parallelism,
  frameIndex,
}) {
  if (!config.gpuAccelerationBuildRequired || accelerationBuilt) {
    return false;
  }
  const buildTile = tiles[0] ?? { x: 0, y: 0, width: 1, height: 1 };
  const encoder = device.createCommandEncoder({
    label: `plasius.wavefront.buildAcceleration.${frameIndex}`,
  });
  device.queue.writeBuffer(
    bvhBuildConfigBuffer,
    0,
    createConfigPayload(config, buildTile, frameIndex, {
      sortItemCount: config.bvhLeafSortCapacity,
    })
  );
  config.bvhSortStages.forEach((sortStage, stageIndex) => {
    device.queue.writeBuffer(
      bvhBuildConfigBuffer,
      (stageIndex + 1) * configBufferStride,
      createConfigPayload(config, buildTile, frameIndex, {
        start: sortStage.compareDistance,
        count: sortStage.sequenceSize,
        sortItemCount: config.bvhLeafSortCapacity,
      })
    );
  });
  const buildLevelConfigStart = 1 + config.bvhSortStages.length;
  config.bvhBuildLevels.forEach((buildLevel, levelIndex) => {
    device.queue.writeBuffer(
      bvhBuildConfigBuffer,
      (buildLevelConfigStart + levelIndex) * configBufferStride,
      createConfigPayload(config, buildTile, frameIndex, buildLevel)
    );
  });
  const passEncoder = encoder.beginComputePass({
    label: "plasius.wavefront.buildAccelerationPass",
  });
  passEncoder.setBindGroup(0, bvhBuildBindGroup, [0]);
  passEncoder.setPipeline(pipelines.prepareMeshTrianglesAndLeaves);
  const prepareWorkgroups = Math.ceil(config.bvhLeafSortCapacity / WORKGROUP_SIZE);
  passEncoder.dispatchWorkgroups(prepareWorkgroups);
  recordDirectDispatch(parallelism, [prepareWorkgroups], WORKGROUP_SIZE);
  passEncoder.setPipeline(pipelines.sortBvhLeafRefs);
  for (let stageIndex = 0; stageIndex < config.bvhSortStages.length; stageIndex += 1) {
    passEncoder.setBindGroup(0, bvhBuildBindGroup, [
      (stageIndex + 1) * configBufferStride,
    ]);
    const sortWorkgroups = Math.ceil(config.bvhLeafSortCapacity / WORKGROUP_SIZE);
    passEncoder.dispatchWorkgroups(sortWorkgroups);
    recordDirectDispatch(parallelism, [sortWorkgroups], WORKGROUP_SIZE);
  }
  passEncoder.setBindGroup(0, bvhBuildBindGroup, [0]);
  passEncoder.setPipeline(pipelines.writeSortedBvhLeaves);
  const leafWriteWorkgroups = Math.ceil(config.triangleCount / WORKGROUP_SIZE);
  passEncoder.dispatchWorkgroups(leafWriteWorkgroups);
  recordDirectDispatch(parallelism, [leafWriteWorkgroups], WORKGROUP_SIZE);
  passEncoder.setPipeline(pipelines.buildBvhInternalLevel);
  for (let levelIndex = 0; levelIndex < config.bvhBuildLevels.length; levelIndex += 1) {
    const buildLevel = config.bvhBuildLevels[levelIndex];
    passEncoder.setBindGroup(0, bvhBuildBindGroup, [
      (buildLevelConfigStart + levelIndex) * configBufferStride,
    ]);
    const levelWorkgroups = Math.ceil(buildLevel.count / WORKGROUP_SIZE);
    passEncoder.dispatchWorkgroups(levelWorkgroups);
    recordDirectDispatch(parallelism, [levelWorkgroups], WORKGROUP_SIZE);
  }
  passEncoder.end();
  device.queue.submit([encoder.finish()]);
  return true;
}
