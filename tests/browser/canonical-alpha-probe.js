import { canonicalAlphaCases } from "../fixtures/canonical-alpha.js";

/** Run manually against a built/packed API in a secure WebGPU browser.
 * Uses the production WGSL unchanged, plus a readback-only material entry point.
 * Both CPU triangle uploads and the real GPU triangle-build kernel are tested.
 */
export async function qualifyCanonicalAlphaGpu(api) {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter || adapter.info.isFallbackAdapter) throw new Error("Physical WebGPU adapter required.");
  const device = await adapter.requestDevice({ requiredLimits: { maxSampledTexturesPerShaderStage: 17 } });
  const resources = [];
  const errors = [];
  device.addEventListener("uncapturederror", event => errors.push(event.error.message));
  const createBuffer = (data, usage) => {
    const buffer = device.createBuffer({ size: data.byteLength, usage: usage | GPUBufferUsage.COPY_DST });
    resources.push(buffer);
    device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  };
  try {
    const cases = canonicalAlphaCases(api);
    const meshes = cases.map(item => item.mesh);
    const materials = api.createWavefrontGpuMaterialSource(meshes);
    const acceleration = api.createWavefrontMeshAcceleration(meshes, materials);
    const gpu = api.createWavefrontGpuMeshSource(meshes, materials);
    const triangles = createBuffer(api.packWavefrontTriangles(acceleration.triangles).buffer, GPUBufferUsage.STORAGE);
    const outputSize = cases.length * 32;
    const output = createBuffer(new ArrayBuffer(outputSize), GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
    const readback = device.createBuffer({ size: outputSize, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    resources.push(readback);
    const shader = device.createShaderModule({ code: api.createWavefrontPathTracingComputeShaderSource() + `
@group(1) @binding(0) var<storage, read_write> alphaProbe: array<vec4<f32>>;
@compute @workgroup_size(1)
fn canonicalAlphaProbe(@builtin(global_invocation_id) id: vec3<u32>) {
  let sample = sample_surface_material(triangles[id.x], vec2<f32>(0.5), vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(0.0, 0.0, 1.0));
  alphaProbe[id.x * 2u] = sample.color;
  alphaProbe[id.x * 2u + 1u] = sample.material;
}` });
    const compilation = await shader.getCompilationInfo();
    const compileErrors = compilation.messages.filter(message => message.type === "error");
    if (compileErrors.length) throw new Error(compileErrors.map(message => message.message).join("\n"));
    const pipeline = await device.createComputePipelineAsync({ layout: "auto", compute: { module: shader, entryPoint: "canonicalAlphaProbe" } });
    const entries = [{ binding: 8, resource: { buffer: triangles } }];
    const atlases = [[23, materials.baseColorAtlas], [24, materials.metallicRoughnessAtlas],
      [25, materials.normalAtlas], [26, materials.occlusionAtlas], [27, materials.emissiveAtlas],
      ...["clearcoat", "clearcoatRoughness", "clearcoatNormal", "transmission", "thickness", "sheenColor", "sheenRoughness",
        "specular", "specularColor", "iridescence", "iridescenceThickness", "anisotropy"].map((key, index) => [33 + index, materials.extensionAtlases[key]])];
    for (const [binding, atlas] of atlases) {
      const texture = device.createTexture({ size: [atlas.width, atlas.height], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
      resources.push(texture);
      device.queue.writeTexture({ texture }, atlas.data, { bytesPerRow: atlas.width * 4 }, [atlas.width, atlas.height]);
      entries.push({ binding, resource: texture.createView() });
    }
    entries.push({ binding: 28, resource: device.createSampler({ minFilter: "nearest", magFilter: "nearest" }) });
    const group0 = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries });
    const group1 = device.createBindGroup({ layout: pipeline.getBindGroupLayout(1), entries: [{ binding: 0, resource: { buffer: output } }] });
    const config = new ArrayBuffer(320);
    const configView = new DataView(config);
    configView.setUint32(44, cases.length, true);
    configView.setUint32(56, cases.length, true);
    const buildBuffers = [[5, createBuffer(config, GPUBufferUsage.UNIFORM)], [8, triangles],
      [9, createBuffer(new ArrayBuffer((cases.length * 2 - 1) * 48), GPUBufferUsage.STORAGE)],
      [10, createBuffer(gpu.vertices.buffer, GPUBufferUsage.STORAGE)],
      [11, createBuffer(gpu.indices.buffer, GPUBufferUsage.STORAGE)],
      [12, createBuffer(gpu.meshes.buffer, GPUBufferUsage.STORAGE)],
      [13, createBuffer(new ArrayBuffer(cases.length * 16), GPUBufferUsage.STORAGE)]];
    const buildPipeline = await device.createComputePipelineAsync({ layout: "auto", compute: { module: shader, entryPoint: "prepareMeshTrianglesAndLeaves" } });
    const buildGroup = device.createBindGroup({ layout: buildPipeline.getBindGroupLayout(0), entries: buildBuffers.map(([binding, buffer]) => ({ binding, resource: { buffer } })) });
    const results = [];
    for (const path of ["cpu-upload", "gpu-build"]) {
      const encoder = device.createCommandEncoder();
      if (path === "gpu-build") {
        const buildPass = encoder.beginComputePass();
        buildPass.setPipeline(buildPipeline); buildPass.setBindGroup(0, buildGroup);
        buildPass.dispatchWorkgroups(Math.ceil(cases.length / 64)); buildPass.end();
      }
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline); pass.setBindGroup(0, group0); pass.setBindGroup(1, group1);
      pass.dispatchWorkgroups(cases.length); pass.end();
      encoder.copyBufferToBuffer(output, 0, readback, 0, outputSize);
      device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const values = new Float32Array(readback.getMappedRange().slice(0)); readback.unmap();
      cases.forEach((item, index) => {
        const actual = values[index * 8 + 6];
        const color = Array.from(values.slice(index * 8, index * 8 + 3));
        const linear = value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        const textured = !!item.mesh.baseColorTexture;
        const expectedColor = [0.8, 0.6 * (textured ? linear(128 / 255) : 1), 0.4 * (textured ? linear(64 / 255) : 1)];
        const passed = Math.abs(actual - item.expected) < 1e-6 && color.every((value, component) => Math.abs(value - expectedColor[component]) < 1e-6);
        results.push({ path, name: item.name, expected: item.expected, actual, color, passed });
      });
    }
    if (errors.length) throw new Error(errors.join("\n"));
    return { adapter: { vendor: adapter.info.vendor, architecture: adapter.info.architecture, fallback: adapter.info.isFallbackAdapter },
      cases: results.length, passed: results.filter(item => item.passed).length, results };
  } finally {
    for (const resource of resources) resource.destroy();
    device.destroy();
  }
}
