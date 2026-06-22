import {
  assertShaderModuleCompiles,
  createComputePipeline,
  createRenderPipeline,
} from "./wavefront-runtime-support.js";
import { PRESENT_WGSL, WAVEFRONT_COMPUTE_WGSL } from "./wavefront-shaders.js";
import { CONFIG_BUFFER_BYTES } from "./wavefront-core.js";

export function createWavefrontBindGroupLayouts(device, constants) {
  const trace = device.createBindGroupLayout({
    label: "plasius.wavefront.traceBindGroupLayout",
    entries: [
      { binding: 0, visibility: constants.shader.COMPUTE, buffer: { type: "storage" } },
      { binding: 1, visibility: constants.shader.COMPUTE, buffer: { type: "storage" } },
      { binding: 2, visibility: constants.shader.COMPUTE, buffer: { type: "storage" } },
      { binding: 3, visibility: constants.shader.COMPUTE, buffer: { type: "storage" } },
      { binding: 4, visibility: constants.shader.COMPUTE, buffer: { type: "read-only-storage" } },
      {
        binding: 5,
        visibility: constants.shader.COMPUTE,
        buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: CONFIG_BUFFER_BYTES },
      },
      { binding: 6, visibility: constants.shader.COMPUTE, buffer: { type: "storage" } },
      {
        binding: 7,
        visibility: constants.shader.COMPUTE,
        storageTexture: { access: "write-only", format: "rgba8unorm" },
      },
      { binding: 8, visibility: constants.shader.COMPUTE, buffer: { type: "storage" } },
      { binding: 9, visibility: constants.shader.COMPUTE, buffer: { type: "storage" } },
      {
        binding: 16,
        visibility: constants.shader.COMPUTE,
        storageTexture: { access: "write-only", format: "rgba16float" },
      },
      { binding: 19, visibility: constants.shader.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 20, visibility: constants.shader.COMPUTE, texture: { sampleType: "float" } },
      { binding: 21, visibility: constants.shader.COMPUTE, sampler: { type: "filtering" } },
      { binding: 22, visibility: constants.shader.COMPUTE, buffer: { type: "storage" } },
      { binding: 23, visibility: constants.shader.COMPUTE, texture: { sampleType: "float" } },
      { binding: 24, visibility: constants.shader.COMPUTE, texture: { sampleType: "float" } },
      { binding: 25, visibility: constants.shader.COMPUTE, texture: { sampleType: "float" } },
      { binding: 26, visibility: constants.shader.COMPUTE, texture: { sampleType: "float" } },
      { binding: 27, visibility: constants.shader.COMPUTE, texture: { sampleType: "float" } },
      { binding: 28, visibility: constants.shader.COMPUTE, sampler: { type: "filtering" } },
      { binding: 29, visibility: constants.shader.COMPUTE, texture: { sampleType: "float" } },
      { binding: 30, visibility: constants.shader.COMPUTE, sampler: { type: "filtering" } },
      { binding: 31, visibility: constants.shader.COMPUTE, texture: { sampleType: "float" } },
      { binding: 32, visibility: constants.shader.COMPUTE, texture: { sampleType: "float" } },
    ],
  });
  const acceleration = device.createBindGroupLayout({
    label: "plasius.wavefront.accelerationBindGroupLayout",
    entries: [
      {
        binding: 5,
        visibility: constants.shader.COMPUTE,
        buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: CONFIG_BUFFER_BYTES },
      },
      { binding: 8, visibility: constants.shader.COMPUTE, buffer: { type: "storage" } },
      { binding: 9, visibility: constants.shader.COMPUTE, buffer: { type: "storage" } },
      { binding: 10, visibility: constants.shader.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 11, visibility: constants.shader.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 12, visibility: constants.shader.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 13, visibility: constants.shader.COMPUTE, buffer: { type: "storage" } },
    ],
  });
  const denoiseRadiance = device.createBindGroupLayout({
    label: "plasius.wavefront.denoiseRadianceBindGroupLayout",
    entries: [
      {
        binding: 5,
        visibility: constants.shader.COMPUTE,
        buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: CONFIG_BUFFER_BYTES },
      },
      {
        binding: 14,
        visibility: constants.shader.COMPUTE,
        texture: { sampleType: "float" },
      },
      {
        binding: 15,
        visibility: constants.shader.COMPUTE,
        storageTexture: { access: "write-only", format: "rgba16float" },
      },
    ],
  });
  const denoiseResolve = device.createBindGroupLayout({
    label: "plasius.wavefront.denoiseResolveBindGroupLayout",
    entries: [
      {
        binding: 5,
        visibility: constants.shader.COMPUTE,
        buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: CONFIG_BUFFER_BYTES },
      },
      {
        binding: 17,
        visibility: constants.shader.COMPUTE,
        texture: { sampleType: "float" },
      },
      {
        binding: 18,
        visibility: constants.shader.COMPUTE,
        storageTexture: { access: "write-only", format: "rgba8unorm" },
      },
    ],
  });
  const present = device.createBindGroupLayout({
    label: "plasius.wavefront.presentBindGroupLayout",
    entries: [
      { binding: 0, visibility: constants.shader.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 1, visibility: constants.shader.FRAGMENT, sampler: { type: "filtering" } },
    ],
  });

  return Object.freeze({
    trace,
    acceleration,
    denoiseRadiance,
    denoiseResolve,
    present,
  });
}

export function createWavefrontPipelineLayouts(device, bindGroupLayouts) {
  return Object.freeze({
    trace: device.createPipelineLayout({
      label: "plasius.wavefront.tracePipelineLayout",
      bindGroupLayouts: [bindGroupLayouts.trace],
    }),
    acceleration: device.createPipelineLayout({
      label: "plasius.wavefront.accelerationPipelineLayout",
      bindGroupLayouts: [bindGroupLayouts.acceleration],
    }),
    denoiseRadiance: device.createPipelineLayout({
      label: "plasius.wavefront.denoiseRadiancePipelineLayout",
      bindGroupLayouts: [bindGroupLayouts.denoiseRadiance],
    }),
    denoiseResolve: device.createPipelineLayout({
      label: "plasius.wavefront.denoiseResolvePipelineLayout",
      bindGroupLayouts: [bindGroupLayouts.denoiseResolve],
    }),
  });
}

export async function createWavefrontComputePipelines(device, computeShader, pipelineLayouts) {
  return Object.freeze({
    prepareMeshTrianglesAndLeaves: await createComputePipeline(
      device,
      computeShader,
      pipelineLayouts.acceleration,
      "prepareMeshTrianglesAndLeaves",
      "plasius.wavefront.prepareMeshTrianglesAndLeaves"
    ),
    sortBvhLeafRefs: await createComputePipeline(
      device,
      computeShader,
      pipelineLayouts.acceleration,
      "sortBvhLeafRefs",
      "plasius.wavefront.sortBvhLeafRefs"
    ),
    writeSortedBvhLeaves: await createComputePipeline(
      device,
      computeShader,
      pipelineLayouts.acceleration,
      "writeSortedBvhLeaves",
      "plasius.wavefront.writeSortedBvhLeaves"
    ),
    buildBvhInternalLevel: await createComputePipeline(
      device,
      computeShader,
      pipelineLayouts.acceleration,
      "buildBvhInternalLevel",
      "plasius.wavefront.buildBvhInternalLevel"
    ),
    generatePrimaryRays: await createComputePipeline(
      device,
      computeShader,
      pipelineLayouts.trace,
      "generatePrimaryRays",
      "plasius.wavefront.generatePrimaryRays"
    ),
    intersectActiveQueue: await createComputePipeline(
      device,
      computeShader,
      pipelineLayouts.trace,
      "intersectActiveQueue",
      "plasius.wavefront.intersectActiveQueue"
    ),
    resolveSurfaceRecords: await createComputePipeline(
      device,
      computeShader,
      pipelineLayouts.trace,
      "resolveSurfaceRecords",
      "plasius.wavefront.resolveSurfaceRecords"
    ),
    compactAndSwapQueues: await createComputePipeline(
      device,
      computeShader,
      pipelineLayouts.trace,
      "compactAndSwapQueues",
      "plasius.wavefront.compactAndSwapQueues"
    ),
    accumulateTerminalRadiance: await createComputePipeline(
      device,
      computeShader,
      pipelineLayouts.trace,
      "accumulateTerminalRadiance",
      "plasius.wavefront.accumulateTerminalRadiance"
    ),
    denoiseLinearRadiance: await createComputePipeline(
      device,
      computeShader,
      pipelineLayouts.denoiseRadiance,
      "denoiseLinearRadiance",
      "plasius.wavefront.denoiseLinearRadiance"
    ),
    resolveDenoisedOutputImage: await createComputePipeline(
      device,
      computeShader,
      pipelineLayouts.denoiseResolve,
      "resolveDenoisedOutputImage",
      "plasius.wavefront.resolveDenoisedOutputImage"
    ),
  });
}

export async function createWavefrontPresentPipeline(device, presentBindGroupLayout, format) {
  const presentShader = device.createShaderModule({
    label: "plasius.wavefront.presentShader",
    code: PRESENT_WGSL,
  });
  return createRenderPipeline(device, {
    label: "plasius.wavefront.presentPipeline",
    layout: device.createPipelineLayout({
      label: "plasius.wavefront.presentPipelineLayout",
      bindGroupLayouts: [presentBindGroupLayout],
    }),
    vertex: { module: presentShader, entryPoint: "vertexMain" },
    fragment: {
      module: presentShader,
      entryPoint: "fragmentMain",
      targets: [{ format }],
    },
    primitive: { topology: "triangle-list" },
  });
}

export async function createWavefrontPipelineResources({ device, constants, format }) {
  const bindGroupLayouts = createWavefrontBindGroupLayouts(device, constants);
  const pipelineLayouts = createWavefrontPipelineLayouts(device, bindGroupLayouts);
  const computeShader = device.createShaderModule({
    label: "plasius.wavefront.computeShader",
    code: WAVEFRONT_COMPUTE_WGSL,
  });
  await assertShaderModuleCompiles(computeShader, "plasius.wavefront.computeShader");

  return Object.freeze({
    bindGroupLayouts,
    pipelineLayouts,
    computePipelines: await createWavefrontComputePipelines(
      device,
      computeShader,
      pipelineLayouts
    ),
    presentPipeline: await createWavefrontPresentPipeline(
      device,
      bindGroupLayouts.present,
      format
    ),
  });
}
