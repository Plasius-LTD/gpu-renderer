import { CONFIG_BUFFER_BYTES } from "./wavefront-core.js";

export function createWavefrontTraceBindGroup({
  device,
  traceBindGroupLayout,
  activeBuffer,
  nextBuffer,
  frameConfigBuffer,
  hitBuffer,
  accumulationBuffer,
  sceneObjectBuffer,
  counterBuffer,
  outputView,
  triangleBuffer,
  bvhNodeBuffer,
  radianceView,
  environmentPortalBuffer,
  environmentMapResource,
  pathVertexBuffer,
  baseColorAtlasResource,
  metallicRoughnessAtlasResource,
  normalAtlasResource,
  occlusionAtlasResource,
  emissiveAtlasResource,
  materialAtlasSampler,
  brdfLutResource,
  environmentSamplingResource,
  mediumTextureResource,
  extensionAtlasResources = {},
  label,
}) {
  return device.createBindGroup({
    label,
    layout: traceBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: activeBuffer } },
      { binding: 1, resource: { buffer: nextBuffer } },
      { binding: 2, resource: { buffer: hitBuffer } },
      { binding: 3, resource: { buffer: accumulationBuffer } },
      { binding: 4, resource: { buffer: sceneObjectBuffer } },
      { binding: 5, resource: { buffer: frameConfigBuffer, size: CONFIG_BUFFER_BYTES } },
      { binding: 6, resource: { buffer: counterBuffer } },
      { binding: 7, resource: outputView },
      { binding: 8, resource: { buffer: triangleBuffer } },
      { binding: 9, resource: { buffer: bvhNodeBuffer } },
      { binding: 16, resource: radianceView },
      { binding: 19, resource: { buffer: environmentPortalBuffer } },
      { binding: 20, resource: environmentMapResource.view },
      { binding: 21, resource: environmentMapResource.sampler },
      { binding: 22, resource: { buffer: pathVertexBuffer } },
      { binding: 23, resource: baseColorAtlasResource.view },
      { binding: 24, resource: metallicRoughnessAtlasResource.view },
      { binding: 25, resource: normalAtlasResource.view },
      { binding: 26, resource: occlusionAtlasResource.view },
      { binding: 27, resource: emissiveAtlasResource.view },
      { binding: 28, resource: materialAtlasSampler },
      { binding: 29, resource: brdfLutResource.view },
      { binding: 30, resource: brdfLutResource.sampler },
      { binding: 31, resource: environmentSamplingResource.view },
      { binding: 32, resource: mediumTextureResource.view },
      { binding: 33, resource: extensionAtlasResources.clearcoat.view },
      { binding: 34, resource: extensionAtlasResources.clearcoatRoughness.view },
      { binding: 35, resource: extensionAtlasResources.clearcoatNormal.view },
      { binding: 36, resource: extensionAtlasResources.transmission.view },
      { binding: 37, resource: extensionAtlasResources.thickness.view },
      { binding: 38, resource: extensionAtlasResources.sheenColor.view },
      { binding: 39, resource: extensionAtlasResources.sheenRoughness.view },
      { binding: 40, resource: extensionAtlasResources.specular.view },
      { binding: 41, resource: extensionAtlasResources.specularColor.view },
      { binding: 42, resource: extensionAtlasResources.iridescence.view },
      { binding: 43, resource: extensionAtlasResources.iridescenceThickness.view },
      { binding: 44, resource: extensionAtlasResources.anisotropy.view },
    ],
  });
}

export function createWavefrontTraceBindGroups(options) {
  return [
    createWavefrontTraceBindGroup({
      ...options,
      activeBuffer: options.activeQueue,
      nextBuffer: options.nextQueue,
      label: "plasius.wavefront.bind.activeNext",
    }),
    createWavefrontTraceBindGroup({
      ...options,
      activeBuffer: options.nextQueue,
      nextBuffer: options.activeQueue,
      label: "plasius.wavefront.bind.nextActive",
    }),
  ];
}

export function createWavefrontBvhBuildBindGroup({
  device,
  accelerationBindGroupLayout,
  bvhBuildConfigBuffer,
  triangleBuffer,
  bvhNodeBuffer,
  meshVertexBuffer,
  meshIndexBuffer,
  meshRangeBuffer,
  bvhLeafRefBuffer,
}) {
  return device.createBindGroup({
    label: "plasius.wavefront.bind.bvhBuild",
    layout: accelerationBindGroupLayout,
    entries: [
      { binding: 5, resource: { buffer: bvhBuildConfigBuffer, size: CONFIG_BUFFER_BYTES } },
      { binding: 8, resource: { buffer: triangleBuffer } },
      { binding: 9, resource: { buffer: bvhNodeBuffer } },
      { binding: 10, resource: { buffer: meshVertexBuffer } },
      { binding: 11, resource: { buffer: meshIndexBuffer } },
      { binding: 12, resource: { buffer: meshRangeBuffer } },
      { binding: 13, resource: { buffer: bvhLeafRefBuffer } },
    ],
  });
}

function createWavefrontDenoiseRadianceBindGroup({
  device,
  denoiseRadianceBindGroupLayout,
  configBuffer,
  inputView,
  targetView,
  label,
}) {
  return device.createBindGroup({
    label,
    layout: denoiseRadianceBindGroupLayout,
    entries: [
      { binding: 5, resource: { buffer: configBuffer, size: CONFIG_BUFFER_BYTES } },
      { binding: 14, resource: inputView },
      { binding: 15, resource: targetView },
    ],
  });
}

function createWavefrontDenoiseResolveBindGroup({
  device,
  denoiseResolveBindGroupLayout,
  configBuffer,
  inputView,
  targetView,
  label,
}) {
  return device.createBindGroup({
    label,
    layout: denoiseResolveBindGroupLayout,
    entries: [
      { binding: 5, resource: { buffer: configBuffer, size: CONFIG_BUFFER_BYTES } },
      { binding: 17, resource: inputView },
      { binding: 18, resource: targetView },
    ],
  });
}

export function createWavefrontDenoiseBindGroups({
  device,
  denoiseRadianceBindGroupLayout,
  denoiseResolveBindGroupLayout,
  configBuffer,
  radianceView,
  denoiseScratchView,
  outputView,
}) {
  return Object.freeze({
    radiance: createWavefrontDenoiseRadianceBindGroup({
      device,
      denoiseRadianceBindGroupLayout,
      configBuffer,
      inputView: radianceView,
      targetView: denoiseScratchView,
      label: "plasius.wavefront.bind.denoise.radianceToScratch",
    }),
    resolve: createWavefrontDenoiseResolveBindGroup({
      device,
      denoiseResolveBindGroupLayout,
      configBuffer,
      inputView: denoiseScratchView,
      targetView: outputView,
      label: "plasius.wavefront.bind.denoise.scratchToOutput",
    }),
    directResolve: createWavefrontDenoiseResolveBindGroup({
      device,
      denoiseResolveBindGroupLayout,
      configBuffer,
      inputView: radianceView,
      targetView: outputView,
      label: "plasius.wavefront.bind.denoise.radianceToOutput",
    }),
  });
}

export function createWavefrontPresentBindGroup({
  device,
  presentBindGroupLayout,
  outputView,
  sampler,
}) {
  return device.createBindGroup({
    label: "plasius.wavefront.presentBindGroup",
    layout: presentBindGroupLayout,
    entries: [
      { binding: 0, resource: outputView },
      { binding: 1, resource: sampler },
    ],
  });
}
