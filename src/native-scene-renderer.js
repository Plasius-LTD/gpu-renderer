import { createGpuRenderer } from "./renderer-webgpu-runtime.js";
import { nativeSceneShader } from "./native-scene-shader.js";
import {
  validateNativeMaterials,
  createNativeMaterialTextures,
} from "./native-surface-materials.js";

const STRIDE = 12;
const UNIFORM_BYTES = 256;
const SHADOW_SIZE = 2048;
const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a) => {
  const length = Math.hypot(...a);
  return a.map((v) => v / length);
};
const finiteVector = (a) =>
  Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);

function validateFrame(frame, maxVertices, materialCount) {
  const { vertices, camera, time = 0 } = frame ?? {};
  if (
    !(vertices instanceof Float32Array) ||
    vertices.length % (STRIDE * 3) !== 0 ||
    vertices.length > maxVertices * STRIDE ||
    !vertices.every(Number.isFinite)
  ) {
    throw new Error(
      `vertices must contain bounded, finite interleaved triangles (12 floats per vertex); received ${vertices?.length ?? 0} floats; first nonfinite component ${vertices instanceof Float32Array ? vertices.findIndex((v) => !Number.isFinite(v)) : "unknown"}.`,
    );
  }
  if (
    !finiteVector(camera?.eye) ||
    !finiteVector(camera?.target) ||
    Math.hypot(...sub(camera.eye, camera.target)) < 0.001 ||
    !Number.isFinite(camera.fov ?? 54) ||
    (camera.fov ?? 54) < 10 ||
    (camera.fov ?? 54) > 120
  ) {
    throw new Error(
      "camera must provide distinct finite eye/target vectors and a 10–120 degree fov.",
    );
  }
  if (!Number.isFinite(time)) throw new Error("time must be finite.");
  if (!Number.isFinite(frame.waterLevel ?? 0))
    throw new Error("waterLevel must be finite.");
  if (
    frame.wakes !== undefined &&
    (!Array.isArray(frame.wakes) ||
      frame.wakes.length > 4 ||
      frame.wakes.some(
        (w) => !Array.isArray(w) || w.length !== 3 || !w.every(Number.isFinite),
      ))
  ) {
    throw new Error(
      "wakes must contain at most four finite [x, z, heading] entries.",
    );
  }
  const count = vertices.length / STRIDE;
  if (
    frame.texcoords !== undefined &&
    (!(frame.texcoords instanceof Float32Array) ||
      frame.texcoords.length !== count * 2 ||
      !frame.texcoords.every(Number.isFinite))
  ) {
    throw new Error(
      "texcoords must contain two finite coordinates per vertex.",
    );
  }
  if (frame.surfaces !== undefined) {
    if (
      !Array.isArray(frame.surfaces) ||
      frame.surfaces.length > 256 ||
      !frame.texcoords
    ) {
      throw new Error(
        "surfaces require texcoords and at most 256 contiguous draw ranges.",
      );
    }
    let end = 0;
    for (const range of frame.surfaces) {
      if (
        !range ||
        range.firstVertex !== end ||
        !Number.isInteger(range.vertexCount) ||
        range.vertexCount <= 0 ||
        range.vertexCount % 3 !== 0 ||
        !Number.isInteger(range.materialIndex) ||
        range.materialIndex < 0 ||
        range.materialIndex >= materialCount
      ) {
        throw new Error(
          "surface ranges must cover triangles in order and reference a valid material.",
        );
      }
      end += range.vertexCount;
    }
    if (end !== count)
      throw new Error("surface ranges must cover every vertex exactly once.");
  }
  return { ...frame, time };
}

function frameUniforms(frame, width, height, reflected = false) {
  const eye = [...frame.camera.eye];
  let forward = unit(sub(frame.camera.target, eye));
  const referenceUp = Math.abs(forward[1]) > 0.999 ? [0, 0, 1] : [0, 1, 0];
  const right = unit(cross(forward, referenceUp));
  const up = unit(cross(right, forward));
  const waterLevel = frame.waterLevel ?? 0;
  if (reflected) {
    eye[1] = 2 * waterLevel - eye[1];
    forward = [forward[0], -forward[1], forward[2]];
    right[1] *= -1;
    up[1] *= -1;
  }
  const sun = unit([-0.62, 0.48, 0.62]);
  const lightForward = sun.map((x) => -x);
  const lightRight = unit(cross(lightForward, [0, 1, 0]));
  const lightUp = unit(cross(lightRight, lightForward));
  const uniforms = new Float32Array(64);
  uniforms.set(eye, 0);
  uniforms.set(right, 4);
  uniforms.set(up, 8);
  uniforms.set(forward, 12);
  uniforms.set(
    [
      Math.tan(((frame.camera.fov ?? 54) * Math.PI) / 360),
      width / height,
      frame.time,
      0.86,
    ],
    16,
  );
  uniforms.set(sun, 20);
  uniforms.set(lightRight, 24);
  uniforms.set(lightUp, 28);
  uniforms.set(lightForward, 32);
  uniforms.set([sun[0] * 45, sun[1] * 45, sun[2] * 45 + 4], 36);
  uniforms.set([width, height, waterLevel, 0], 40);
  (frame.wakes ?? []).forEach((wake, index) =>
    uniforms.set([...wake, 0], 44 + index * 4),
  );
  uniforms.set([(frame.wakes ?? []).length, reflected ? 1 : 0, 0, 0], 60);
  return uniforms;
}

/** Native raster surfaces. The caller owns simulation, animation and scheduling. */
export async function createNativeSceneRenderer(options = {}) {
  const maxVertices = options.maxVertices ?? 300_000;
  const materials = options.materials ?? [];
  validateNativeMaterials(materials);
  const materialCount = materials.length;
  if (
    !Number.isInteger(maxVertices) ||
    maxVertices < 3 ||
    maxVertices > 600_000
  ) {
    throw new Error("maxVertices must be an integer between 3 and 600000.");
  }
  let base;
  let destroyed = false;
  let available = true;
  let targets = null;
  let vertexBuffer = null;
  let uvBuffer = null;
  let vertexCapacity = 0;
  let pendingFrame = null;
  let submittedFrames = 0;
  let vertexCount = 0;
  const owned = new Set();
  const own = (resource) => {
    owned.add(resource);
    return resource;
  };
  const release = (resource) => {
    resource.destroy();
    owned.delete(resource);
  };
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    base?.destroy();
    for (const resource of owned) resource.destroy();
    owned.clear();
    base?.device.destroy?.();
  };

  try {
    base = await createGpuRenderer({
      ...options,
      alpha: false,
      encodeFrame: encode,
    });
    const { device, format } = base;
    device.lost?.then(() => {
      available = false;
      if (!destroyed)
        options.onUnavailable?.(
          "WebGPU device lost. Reload the demo to reconnect.",
        );
    });
    const module = device.createShaderModule({
      label: "plasius.native-scene",
      code: nativeSceneShader,
    });
    const compilation = await module.getCompilationInfo?.();
    const shaderErrors =
      compilation?.messages.filter((m) => m.type === "error") ?? [];
    if (shaderErrors.length)
      throw new Error(
        `Native scene shader compilation failed: ${shaderErrors.map((m) => `${m.lineNum}: ${m.message}`).join("; ")}`,
      );
    const uniformLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: 3,
          buffer: { type: "uniform", minBindingSize: UNIFORM_BYTES },
        },
      ],
    });
    const shadowLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: 2, texture: { sampleType: "depth" } },
        { binding: 1, visibility: 2, sampler: { type: "comparison" } },
      ],
    });
    const reflectionLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: 2, texture: { sampleType: "float" } },
        { binding: 1, visibility: 2, sampler: { type: "filtering" } },
      ],
    });
    const materialLayout = device.createBindGroupLayout({
      entries: [
        ...[0, 1, 2].map((binding) => ({
          binding,
          visibility: 2,
          texture: { sampleType: "float" },
        })),
        { binding: 3, visibility: 2, sampler: { type: "filtering" } },
        {
          binding: 4,
          visibility: 2,
          buffer: { type: "uniform", minBindingSize: 16 },
        },
      ],
    });
    const materialSampler = device.createSampler({
      addressModeU: "repeat",
      addressModeV: "repeat",
      minFilter: "linear",
      magFilter: "linear",
      mipmapFilter: "linear",
      maxAnisotropy: 4,
    });
    const materialGroups = createNativeMaterialTextures(
      device,
      materials,
      own,
    ).map((material) => {
      const params = own(
        device.createBuffer({
          size: 16,
          usage: 0x48,
          label: "native.material-parameters",
        }),
      );
      device.queue.writeBuffer(
        params,
        0,
        new Float32Array([
          material.normalScale,
          material.authored ? 1 : 0,
          material.clearcoat,
          material.clearcoatRoughness,
        ]),
      );
      return device.createBindGroup({
        layout: materialLayout,
        entries: [
          { binding: 0, resource: material.baseColor },
          { binding: 1, resource: material.normal },
          { binding: 2, resource: material.orm },
          { binding: 3, resource: materialSampler },
          { binding: 4, resource: { buffer: params } },
        ],
      });
    });
    const uniformBuffer = own(
      device.createBuffer({
        label: "native.frame",
        size: UNIFORM_BYTES,
        usage: 0x48,
      }),
    );
    const reflectionBuffer = own(
      device.createBuffer({
        label: "native.reflected-frame",
        size: UNIFORM_BYTES,
        usage: 0x48,
      }),
    );
    const bindUniform = (buffer) =>
      device.createBindGroup({
        layout: uniformLayout,
        entries: [{ binding: 0, resource: { buffer } }],
      });
    const mainGroup = bindUniform(uniformBuffer);
    const reflectedGroup = bindUniform(reflectionBuffer);
    const shadowTexture = own(
      device.createTexture({
        label: "native.shadow",
        size: [SHADOW_SIZE, SHADOW_SIZE],
        format: "depth32float",
        usage: 0x14,
      }),
    );
    const shadowView = shadowTexture.createView();
    const shadowGroup = device.createBindGroup({
      layout: shadowLayout,
      entries: [
        { binding: 0, resource: shadowView },
        {
          binding: 1,
          resource: device.createSampler({
            compare: "less-equal",
            minFilter: "linear",
            magFilter: "linear",
          }),
        },
      ],
    });
    const reflectionSampler = device.createSampler({
      minFilter: "linear",
      magFilter: "linear",
    });
    const attributes = [0, 1, 2, 3].map((i) => ({
      shaderLocation: i,
      offset: i * 12,
      format: "float32x3",
    }));
    const createPipeline =
      device.createRenderPipelineAsync?.bind(device) ??
      device.createRenderPipeline.bind(device);
    const pipeline = (
      label,
      vertex,
      fragment,
      colourFormat,
      samples,
      layouts,
      geometry = false,
    ) =>
      createPipeline({
        label: `native.${label}`,
        layout: device.createPipelineLayout({ bindGroupLayouts: layouts }),
        vertex: {
          module,
          entryPoint: vertex,
          ...(geometry
            ? {
                buffers: [
                  {
                    arrayStride: STRIDE * 4,
                    attributes:
                      vertex === "shadowVertex"
                        ? attributes.slice(0, 1)
                        : attributes,
                  },
                  ...(vertex === "shadowVertex"
                    ? []
                    : [
                        {
                          arrayStride: 8,
                          attributes: [
                            {
                              shaderLocation: 4,
                              offset: 0,
                              format: "float32x2",
                            },
                          ],
                        },
                      ]),
                ],
              }
            : {}),
        },
        ...(fragment
          ? {
              fragment: {
                module,
                entryPoint: fragment,
                targets: [{ format: colourFormat }],
              },
            }
          : {}),
        primitive: { topology: "triangle-list", cullMode: "none" },
        depthStencil: {
          format: "depth32float",
          depthWriteEnabled: label !== "sky" && label !== "reflection-sky",
          depthCompare: "less-equal",
        },
        multisample: { count: samples },
      });
    const shadowPipeline = await pipeline(
      "shadow",
      "shadowVertex",
      null,
      null,
      1,
      [uniformLayout],
      true,
    );
    const surfacePipeline = await pipeline(
      "surface",
      "surfaceVertex",
      "surfaceFragment",
      format,
      4,
      [uniformLayout, shadowLayout, materialLayout],
      true,
    );
    const skyPipeline = await pipeline(
      "sky",
      "fullscreenVertex",
      "skyFragment",
      format,
      4,
      [uniformLayout],
    );
    const waterPipeline = await pipeline(
      "water",
      "fullscreenVertex",
      "waterFragment",
      format,
      4,
      [uniformLayout, shadowLayout, materialLayout, reflectionLayout],
    );
    const reflectedSurfacePipeline = await pipeline(
      "reflection-surface",
      "surfaceVertex",
      "reflectionSurface",
      "rgba16float",
      1,
      [uniformLayout, shadowLayout, materialLayout],
      true,
    );
    const reflectedSkyPipeline = await pipeline(
      "reflection-sky",
      "fullscreenVertex",
      "reflectionSky",
      "rgba16float",
      1,
      [uniformLayout],
    );

    function ensureTargets() {
      const limit = Math.min(device.limits.maxTextureDimension2D, 3840);
      const requestedWidth = Math.max(1, Number(base.canvas.width) || 1);
      const requestedHeight = Math.max(1, Number(base.canvas.height) || 1);
      const scale = Math.min(
        1,
        limit / requestedWidth,
        limit / requestedHeight,
        Math.sqrt((1920 * 1080) / (requestedWidth * requestedHeight)),
      );
      const width = Math.max(1, Math.floor(requestedWidth * scale));
      const height = Math.max(1, Math.floor(requestedHeight * scale));
      base.canvas.width = width;
      base.canvas.height = height;
      if (targets?.width === width && targets?.height === height) return;
      if (targets) for (const texture of targets.textures) release(texture);
      const reflectionWidth = Math.min(1280, Math.max(1, Math.ceil(width / 2)));
      const reflectionHeight = Math.max(
        1,
        Math.round((height * reflectionWidth) / width),
      );
      const texture = (
        label,
        w,
        h,
        pixelFormat,
        sampleCount = 1,
        usage = 0x10,
      ) =>
        own(
          device.createTexture({
            label,
            size: [w, h],
            format: pixelFormat,
            sampleCount,
            usage,
          }),
        );
      const colour = texture("native.msaa-colour", width, height, format, 4);
      const depth = texture(
        "native.msaa-depth",
        width,
        height,
        "depth32float",
        4,
      );
      const reflection = texture(
        "native.reflection",
        reflectionWidth,
        reflectionHeight,
        "rgba16float",
        1,
        0x14,
      );
      const reflectionDepth = texture(
        "native.reflection-depth",
        reflectionWidth,
        reflectionHeight,
        "depth32float",
      );
      const reflectionView = reflection.createView();
      targets = {
        width,
        height,
        reflectionWidth,
        reflectionHeight,
        colour: colour.createView(),
        depth: depth.createView(),
        reflection: reflectionView,
        reflectionDepth: reflectionDepth.createView(),
        textures: [colour, depth, reflection, reflectionDepth],
        reflectionGroup: device.createBindGroup({
          layout: reflectionLayout,
          entries: [
            { binding: 0, resource: reflectionView },
            { binding: 1, resource: reflectionSampler },
          ],
        }),
      };
    }

    function encode({ encoder, view }) {
      const depthAttachment = (depthView) => ({
        view: depthView,
        depthLoadOp: "clear",
        depthClearValue: 1,
        depthStoreOp: "store",
      });
      const drawGeometry = (pass, p, uniforms) => {
        pass.setPipeline(p);
        pass.setBindGroup(0, uniforms);
        if (p !== shadowPipeline) pass.setBindGroup(1, shadowGroup);
        if (vertexCount > 0) {
          pass.setVertexBuffer(0, vertexBuffer);
          if (p === shadowPipeline) {
            pass.draw(vertexCount);
          } else {
            pass.setVertexBuffer(1, uvBuffer);
            if (pendingFrame.surfaces) {
              for (const range of pendingFrame.surfaces) {
                pass.setBindGroup(2, materialGroups[range.materialIndex + 1]);
                pass.draw(range.vertexCount, 1, range.firstVertex);
              }
            } else {
              pass.setBindGroup(2, materialGroups[0]);
              pass.draw(vertexCount);
            }
          }
        }
      };
      const shadowPass = encoder.beginRenderPass({
        label: "native.shadow",
        colorAttachments: [],
        depthStencilAttachment: depthAttachment(shadowView),
      });
      drawGeometry(shadowPass, shadowPipeline, mainGroup);
      shadowPass.end();
      const reflectedPass = encoder.beginRenderPass({
        label: "native.reflection",
        colorAttachments: [
          {
            view: targets.reflection,
            loadOp: "clear",
            storeOp: "store",
            clearValue: [0, 0, 0, 1],
          },
        ],
        depthStencilAttachment: depthAttachment(targets.reflectionDepth),
      });
      reflectedPass.setPipeline(reflectedSkyPipeline);
      reflectedPass.setBindGroup(0, reflectedGroup);
      reflectedPass.draw(3);
      drawGeometry(reflectedPass, reflectedSurfacePipeline, reflectedGroup);
      reflectedPass.end();
      const pass = encoder.beginRenderPass({
        label: "native.scene",
        colorAttachments: [
          {
            view: targets.colour,
            resolveTarget: view,
            loadOp: "clear",
            storeOp: "discard",
            clearValue: [0, 0, 0, 1],
          },
        ],
        depthStencilAttachment: depthAttachment(targets.depth),
      });
      pass.setPipeline(skyPipeline);
      pass.setBindGroup(0, mainGroup);
      pass.draw(3);
      if (pendingFrame.water !== false) {
        pass.setPipeline(waterPipeline);
        pass.setBindGroup(1, shadowGroup);
        pass.setBindGroup(2, materialGroups[0]);
        pass.setBindGroup(3, targets.reflectionGroup);
        pass.draw(3);
      }
      drawGeometry(pass, surfacePipeline, mainGroup);
      pass.end();
    }

    return {
      render(input) {
        if (destroyed) throw new Error("Native scene renderer was destroyed.");
        if (!available) throw new Error("WebGPU device was lost.");
        pendingFrame = validateFrame(input, maxVertices, materialCount);
        const data = pendingFrame.vertices;
        ensureTargets();
        if (data.byteLength > vertexCapacity) {
          if (vertexBuffer) release(vertexBuffer);
          if (uvBuffer) release(uvBuffer);
          vertexCapacity = Math.min(
            maxVertices * STRIDE * 4,
            Math.max(4096, 2 ** Math.ceil(Math.log2(data.byteLength))),
          );
          uvBuffer = own(
            device.createBuffer({
              label: "native.surface-uvs",
              size: Math.ceil(vertexCapacity / (STRIDE * 4)) * 8,
              usage: 0x28,
            }),
          );
          vertexBuffer = own(
            device.createBuffer({
              label: "native.surface-vertices",
              size: vertexCapacity,
              usage: 0x28,
            }),
          );
        }
        if (pendingFrame.texcoords?.byteLength)
          device.queue.writeBuffer(uvBuffer, 0, pendingFrame.texcoords);
        vertexCount = data.length / STRIDE;
        if (data.byteLength) device.queue.writeBuffer(vertexBuffer, 0, data);
        device.queue.writeBuffer(
          uniformBuffer,
          0,
          frameUniforms(pendingFrame, targets.width, targets.height),
        );
        device.queue.writeBuffer(
          reflectionBuffer,
          0,
          frameUniforms(
            pendingFrame,
            targets.reflectionWidth,
            targets.reflectionHeight,
            true,
          ),
        );
        base.renderOnce(pendingFrame.time * 1000);
        submittedFrames++;
        return this.getSnapshot();
      },
      getSnapshot() {
        return {
          backend: "webgpu-raster",
          available: available && !destroyed,
          submittedFrames,
          vertexCount,
          shadowMapSize: SHADOW_SIZE,
          samples: 4,
          width: targets?.width ?? 0,
          height: targets?.height ?? 0,
        };
      },
      destroy,
    };
  } catch (error) {
    destroy();
    throw error;
  }
}
