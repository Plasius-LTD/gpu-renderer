import test from "node:test";
import assert from "node:assert/strict";
import { createNativeSceneRenderer } from "../src/native-scene-renderer.js";

function gpuFixture() {
  const calls = [];
  let loseDevice;
  const resource = (kind, descriptor) => ({
    kind,
    descriptor,
    destroy() {
      calls.push(["destroy", kind]);
    },
    createView() {
      return { kind: `${kind}-view` };
    },
  });
  const device = {
    limits: { maxTextureDimension2D: 8192 },
    lost: new Promise((resolve) => {
      loseDevice = resolve;
    }),
    queue: {
      writeTexture(destination, bytes) {
        calls.push([
          "upload-texture",
          destination.texture.descriptor.label,
          bytes.length,
        ]);
      },
      writeBuffer(...args) {
        calls.push([
          "write",
          args[0].descriptor.label,
          args[2].length,
          [...args[2]],
        ]);
      },
      submit() {
        calls.push(["submit"]);
      },
    },
    createBuffer: (d) => resource("buffer", d),
    createTexture: (d) => {
      calls.push(["texture", d]);
      return resource("texture", d);
    },
    createShaderModule: (d) => ({
      ...d,
      getCompilationInfo: async () => ({ messages: [] }),
    }),
    createSampler: (d) => ({ ...d }),
    createBindGroupLayout: (d) => d,
    createPipelineLayout: (d) => d,
    createBindGroup: (d) => d,
    createRenderPipeline: (d) => {
      calls.push(["pipeline", d]);
      return d;
    },
    createCommandEncoder: () => ({
      beginRenderPass(d) {
        calls.push(["pass", d]);
        return {
          setPipeline(p) {
            calls.push(["use", p.label]);
          },
          setBindGroup(index, group) {
            calls.push(["bind", index, group]);
          },
          setVertexBuffer() {},
          draw(n, instances, first) {
            calls.push(["draw", n, instances, first]);
          },
          end() {},
        };
      },
      finish: () => ({}),
    }),
  };
  const context = {
    configure() {},
    unconfigure() {
      calls.push(["unconfigure"]);
    },
    getCurrentTexture: () => resource("canvas", {}),
  };
  const canvas = { width: 960, height: 540, getContext: () => context };
  const navigator = {
    gpu: {
      requestAdapter: async () => ({ requestDevice: async () => device }),
      getPreferredCanvasFormat: () => "bgra8unorm",
    },
  };
  return {
    calls,
    canvas,
    navigator,
    device,
    loseDevice: () => loseDevice({ reason: "unknown" }),
  };
}

const vertices = new Float32Array([
  -1, 0, 0, 0, 0, 1, 0.5, 0.2, 0.1, 0.6, 0, 0, 1, 0, 0, 0, 0, 1, 0.5, 0.2, 0.1,
  0.6, 0, 0, 0, 2, 0, 0, 0, 1, 0.5, 0.2, 0.1, 0.6, 0, 0,
]);
const frame = () => ({
  vertices,
  camera: { eye: [0, 3, 8], target: [0, 1, 0], fov: 54 },
  time: 1,
});

test("native scene submits actual geometry, shadows, reflection and water with antialiasing", async () => {
  const f = gpuFixture();
  const renderer = await createNativeSceneRenderer(f);
  assert.equal(renderer.getSnapshot().submittedFrames, 0);
  renderer.render(frame());
  assert.equal(f.calls.filter((c) => c[0] === "submit").length, 1);
  assert.equal(f.calls.filter((c) => c[0] === "pass").length, 3);
  for (const name of ["shadow", "surface", "sky", "water"]) {
    assert.ok(
      f.calls.some((c) => c[0] === "use" && c[1].includes(name)),
      name,
    );
  }
  assert.ok(
    f.calls.some((c) => c[0] === "pipeline" && c[1].multisample?.count === 4),
  );
  assert.equal(renderer.getSnapshot().vertexCount, 3);
  assert.equal(renderer.getSnapshot().submittedFrames, 1);
  assert.equal(renderer.getSnapshot().backend, "webgpu-raster");
  renderer.destroy();
  assert.throws(() => renderer.render(frame()), /destroyed/i);
});

test("native scene reuses targets until resize and releases every allocation", async () => {
  const f = gpuFixture();
  const renderer = await createNativeSceneRenderer(f);
  renderer.render(frame());
  const count = f.calls.filter((c) => c[0] === "texture").length;
  renderer.render(frame());
  assert.equal(f.calls.filter((c) => c[0] === "texture").length, count);
  f.canvas.width = 640;
  renderer.render(frame());
  assert.ok(f.calls.some((c) => c[0] === "destroy" && c[1] === "texture"));
  renderer.destroy();
  const destroyed = f.calls.filter((c) => c[0] === "destroy").length;
  renderer.destroy();
  assert.equal(f.calls.filter((c) => c[0] === "destroy").length, destroyed);
  assert.equal(
    f.calls.filter((c) => c[0] === "texture").length,
    f.calls.filter((c) => c[0] === "destroy" && c[1] === "texture").length,
  );
});

test("invalid input is rejected before GPU submission", async () => {
  const f = gpuFixture();
  const renderer = await createNativeSceneRenderer({ ...f, maxVertices: 6 });
  for (const value of [
    new Float32Array(1),
    new Float32Array(108),
    new Float32Array([NaN, ...vertices.slice(1)]),
  ]) {
    assert.throws(
      () => renderer.render({ ...frame(), vertices: value }),
      /vertices/i,
    );
  }
  assert.throws(
    () =>
      renderer.render({
        ...frame(),
        camera: { eye: [0, 0, 0], target: [0, 0, 0] },
      }),
    /camera/i,
  );
  assert.throws(() => renderer.render({ ...frame(), time: Infinity }), /time/i);
  assert.equal(f.calls.filter((c) => c[0] === "submit").length, 0);
  renderer.destroy();
});

test("device loss stops submission and exposes an unavailable status", async () => {
  const f = gpuFixture();
  const renderer = await createNativeSceneRenderer(f);
  f.loseDevice();
  await Promise.resolve();
  assert.equal(renderer.getSnapshot().available, false);
  assert.throws(() => renderer.render(frame()), /device.*lost/i);
  renderer.destroy();
});

test("pipeline validation failure releases allocations and rejects readiness", async () => {
  const f = gpuFixture();
  f.device.createRenderPipelineAsync = async () => {
    throw new Error("pipeline rejected");
  };
  await assert.rejects(createNativeSceneRenderer(f), /pipeline rejected/);
  assert.ok(f.calls.some((c) => c[0] === "destroy"));
  assert.ok(f.calls.some((c) => c[0] === "unconfigure"));
});

test("shader validation failure and invalid budgets fail closed", async () => {
  const f = gpuFixture();
  f.device.createShaderModule = () => ({
    getCompilationInfo: async () => ({
      messages: [{ type: "error", lineNum: 1, message: "invalid" }],
    }),
  });
  await assert.rejects(
    createNativeSceneRenderer(f),
    /shader compilation failed/,
  );
  await assert.rejects(
    createNativeSceneRenderer({ ...f, maxVertices: Infinity }),
    /maxVertices/,
  );
});

test("surface-only and empty scenes remain bounded at large display sizes", async () => {
  const f = gpuFixture();
  f.canvas.width = 8000;
  f.canvas.height = 8000;
  const renderer = await createNativeSceneRenderer(f);
  renderer.render({
    ...frame(),
    vertices: new Float32Array(),
    water: false,
    wakes: [[1, 2, 3]],
  });
  const snapshot = renderer.getSnapshot();
  assert.ok(snapshot.width * snapshot.height <= 1920 * 1080);
  assert.equal(snapshot.width, snapshot.height);
  assert.ok(!f.calls.some((c) => c[0] === "use" && c[1] === "native.water"));
  renderer.render({
    ...frame(),
    camera: { eye: [0, 3, 0], target: [0, 0, 0] },
  });
  assert.throws(
    () => renderer.render({ ...frame(), wakes: [[NaN, 0, 0]] }),
    /wakes/,
  );
  assert.throws(
    () => renderer.render({ ...frame(), waterLevel: NaN }),
    /waterLevel/,
  );
  renderer.destroy();
});

const solidMap = {
  width: 1,
  height: 1,
  data: new Uint8Array([180, 100, 50, 255]),
};
test("textured geometry binds authored materials and UVs in both colour passes", async () => {
  const f = gpuFixture();
  const renderer = await createNativeSceneRenderer({
    ...f,
    materials: [{ baseColor: solidMap }],
  });
  const uploads = f.calls.filter((c) => c[0] === "upload-texture").length;
  const textured = {
    ...frame(),
    texcoords: new Float32Array([0, 0, 1, 0, 0, 1]),
    surfaces: [{ firstVertex: 0, vertexCount: 3, materialIndex: 0 }],
  };
  renderer.render(textured);
  assert.equal(f.calls.filter((c) => c[0] === "draw" && c[3] === 0).length, 2);
  assert.ok(
    f.calls.some(
      (c) => c[0] === "write" && c[1] === "native.surface-uvs" && c[2] === 6,
    ),
  );
  renderer.render(textured);
  assert.equal(
    f.calls.filter((c) => c[0] === "upload-texture").length,
    uploads,
  );
  renderer.destroy();
});
test("missing UVs and invalid material ranges reject before frame submission", async () => {
  const f = gpuFixture();
  const renderer = await createNativeSceneRenderer({ ...f, materials: [{}] });
  const uv = new Float32Array(6),
    range = { firstVertex: 0, vertexCount: 3, materialIndex: 0 };
  for (const properties of [
    { texcoords: new Float32Array([NaN, 0, 0, 0, 0, 0]) },
    { texcoords: new Float32Array(4) },
    { surfaces: [range] },
    { texcoords: uv, surfaces: {} },
    { texcoords: uv, surfaces: [{ ...range, firstVertex: 3 }] },
    { texcoords: uv, surfaces: [{ ...range, materialIndex: 1 }] },
    { texcoords: uv, surfaces: [{ ...range, vertexCount: 2 }] },
    { texcoords: uv, surfaces: [] },
    { texcoords: uv, surfaces: new Array(257).fill(range) },
    { texcoords: uv, surfaces: [null] },
  ])
    assert.throws(
      () => renderer.render({ ...frame(), ...properties }),
      /surface|texcoords/i,
    );
  assert.equal(f.calls.filter((c) => c[0] === "submit").length, 0);
  renderer.destroy();
});
test("a material upload failure releases textures and the rendering context", async () => {
  const f = gpuFixture();
  f.device.queue.writeTexture = () => {
    throw new Error("upload failed");
  };
  await assert.rejects(createNativeSceneRenderer(f), /upload failed/);
  assert.equal(
    f.calls.filter((c) => c[0] === "texture").length,
    f.calls.filter((c) => c[0] === "destroy" && c[1] === "texture").length,
  );
  assert.ok(f.calls.some((c) => c[0] === "unconfigure"));
});

test("caller material-list mutation cannot change the uploaded material range", async () => {
  const f = gpuFixture(),
    materials = [{}];
  const renderer = await createNativeSceneRenderer({ ...f, materials });
  materials.push({});
  assert.throws(
    () =>
      renderer.render({
        ...frame(),
        texcoords: new Float32Array(6),
        surfaces: [{ firstVertex: 0, vertexCount: 3, materialIndex: 1 }],
      }),
    /valid material/,
  );
  renderer.destroy();
});

test("native materials upload independent clearcoat strength and roughness", async () => {
  const f = gpuFixture();
  const renderer = await createNativeSceneRenderer({
    ...f,
    materials: [{ clearcoat: 0.5, clearcoatRoughness: 0.25 }],
  });
  const parameters = f.calls.filter(
    (c) => c[0] === "write" && c[1] === "native.material-parameters",
  );
  assert.deepEqual(parameters[0][3], [0, 0, 0, 0]);
  assert.deepEqual(parameters[1][3], [0, 0, 0.5, 0.25]);
  renderer.destroy();
});
