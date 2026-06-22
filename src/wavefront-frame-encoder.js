import {
  recordDirectDispatch,
  recordIndirectDispatch,
} from "./wavefront-frame-runtime.js";
import {
  COUNTER_DISPATCH_ARGS_OFFSET,
  INDIRECT_DISPATCH_ARGS_BYTES,
  WORKGROUP_SIZE,
} from "./wavefront-core.js";

function resolveGetter(valueOrGetter) {
  return typeof valueOrGetter === "function" ? valueOrGetter : () => valueOrGetter;
}

export function createWavefrontFrameEncoder({
  getConfig,
  getBindGroups,
  pipelines,
  counterBuffer,
  activeDispatchBuffer,
  denoiseRadianceBindGroup,
  denoiseResolveBindGroup,
  denoiseDirectResolveBindGroup,
  presentPipeline,
  presentBindGroup,
  context,
}) {
  const resolveConfig = resolveGetter(getConfig);
  const resolveBindGroups = resolveGetter(getBindGroups);

  return Object.freeze({
    encodeTileSample(encoder, tile, configOffset, parallelism) {
      const config = resolveConfig();
      const bindGroups = resolveBindGroups();
      const generatePass = encoder.beginComputePass({
        label: "plasius.wavefront.generatePrimaryRaysPass",
      });
      const tileWorkgroups = Math.ceil((tile.width * tile.height) / WORKGROUP_SIZE);

      generatePass.setBindGroup(0, bindGroups[0], [configOffset]);
      generatePass.setPipeline(pipelines.generatePrimaryRays);
      generatePass.dispatchWorkgroups(tileWorkgroups);
      recordDirectDispatch(parallelism, [tileWorkgroups], WORKGROUP_SIZE);
      generatePass.end();

      for (let bounceIndex = 0; bounceIndex < config.maxDepth; bounceIndex += 1) {
        encoder.copyBufferToBuffer(
          counterBuffer,
          COUNTER_DISPATCH_ARGS_OFFSET,
          activeDispatchBuffer,
          0,
          INDIRECT_DISPATCH_ARGS_BYTES
        );
        const passEncoder = encoder.beginComputePass({
          label: `plasius.wavefront.bounce.${bounceIndex}`,
        });
        passEncoder.setBindGroup(0, bindGroups[bounceIndex % 2], [configOffset]);
        passEncoder.setPipeline(pipelines.intersectActiveQueue);
        passEncoder.dispatchWorkgroupsIndirect(activeDispatchBuffer, 0);
        recordIndirectDispatch(parallelism, tileWorkgroups, WORKGROUP_SIZE);
        passEncoder.setPipeline(pipelines.resolveSurfaceRecords);
        passEncoder.dispatchWorkgroupsIndirect(activeDispatchBuffer, 0);
        recordIndirectDispatch(parallelism, tileWorkgroups, WORKGROUP_SIZE);
        passEncoder.setPipeline(pipelines.compactAndSwapQueues);
        passEncoder.dispatchWorkgroups(1);
        recordDirectDispatch(parallelism, [1], 1);
        passEncoder.end();
      }
    },

    encodeTileOutput(encoder, tile, configOffset, parallelism) {
      const bindGroups = resolveBindGroups();
      const passEncoder = encoder.beginComputePass({
        label: "plasius.wavefront.outputPass",
      });
      const tileWorkgroups = Math.ceil((tile.width * tile.height) / WORKGROUP_SIZE);

      passEncoder.setBindGroup(0, bindGroups[0], [configOffset]);
      passEncoder.setPipeline(pipelines.accumulateTerminalRadiance);
      passEncoder.dispatchWorkgroups(tileWorkgroups);
      recordDirectDispatch(parallelism, [tileWorkgroups], WORKGROUP_SIZE);
      passEncoder.end();
    },

    encodeDenoise(encoder, configOffset, parallelism, renderedSamplesPerPixel) {
      const config = resolveConfig();
      if (!config.denoise) {
        return;
      }
      const denoiseWorkgroupsX = Math.ceil(config.width / 8);
      const denoiseWorkgroupsY = Math.ceil(config.height / 8);
      const useTwoPassDenoise = renderedSamplesPerPixel < 4;
      if (useTwoPassDenoise) {
        const radiancePass = encoder.beginComputePass({
          label: "plasius.wavefront.denoiseRadiancePass",
        });
        radiancePass.setBindGroup(0, denoiseRadianceBindGroup, [configOffset]);
        radiancePass.setPipeline(pipelines.denoiseLinearRadiance);
        radiancePass.dispatchWorkgroups(denoiseWorkgroupsX, denoiseWorkgroupsY);
        recordDirectDispatch(
          parallelism,
          [denoiseWorkgroupsX, denoiseWorkgroupsY],
          WORKGROUP_SIZE
        );
        radiancePass.end();
      }

      const resolvePass = encoder.beginComputePass({
        label: "plasius.wavefront.denoiseResolvePass",
      });
      resolvePass.setBindGroup(
        0,
        useTwoPassDenoise ? denoiseResolveBindGroup : denoiseDirectResolveBindGroup,
        [configOffset]
      );
      resolvePass.setPipeline(pipelines.resolveDenoisedOutputImage);
      resolvePass.dispatchWorkgroups(denoiseWorkgroupsX, denoiseWorkgroupsY);
      recordDirectDispatch(
        parallelism,
        [denoiseWorkgroupsX, denoiseWorkgroupsY],
        WORKGROUP_SIZE
      );
      resolvePass.end();
    },

    encodePresent(encoder) {
      const texture = context.getCurrentTexture();
      const passEncoder = encoder.beginRenderPass({
        label: "plasius.wavefront.presentPass",
        colorAttachments: [
          {
            view: texture.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      passEncoder.setPipeline(presentPipeline);
      passEncoder.setBindGroup(0, presentBindGroup);
      passEncoder.draw(3);
      passEncoder.end();
    },
  });
}
