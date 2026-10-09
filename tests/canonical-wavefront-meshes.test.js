import assert from "node:assert/strict";
import test from "node:test";

import { createCanonicalWavefrontMeshInputs } from "../src/canonical-wavefront-meshes.js";
import {
  createWavefrontGpuMaterialSource,
  createWavefrontMeshAcceleration,
} from "../src/wavefront-mesh-sources.js";
import { normalizeWavefrontMesh } from "../src/wavefront-scene-normalizers.js";

function material(id, overrides = {}) {
  return {
    id,
    workflow: "metallic-roughness",
    alphaMode: "opaque",
    baseColorFactor: [0.8, 0.6, 0.4, 1],
    metallicFactor: 0.25,
    roughnessFactor: 0.5,
    textures: {},
    extensions: {},
    sourceMetadata: {},
    ...overrides,
  };
}

function documentWith(primitives, materials = []) {
  return {
    meshes: [{ id: "mesh-1", primitives }],
    materials,
  };
}

function geometry(primitiveId, overrides = {}) {
  return {
    primitiveId,
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    indices: [0, 1, 2],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    texcoords: [0, 0, 1, 0, 0, 1],
    ...overrides,
  };
}

test("maps canonical primitives, PBR material fields, and decoded standard textures", () => {
  const baseColorSample = { width: 1, height: 1, data: [255, 64, 32, 255] };
  const normalSample = { width: 1, height: 1, data: [128, 128, 255, 255] };
  const document = documentWith(
    [
      { id: "primitive-a", topology: "triangles", attributes: [], materialId: "material-a" },
      { id: "primitive-b", topology: "triangles", attributes: [], materialId: "material-b" },
    ],
    [
      material("material-a", {
        baseColorFactor: [0.2, 0.4, 0.6, 0.75],
        metallicFactor: 0.8,
        roughnessFactor: 0.3,
        normalScale: 0.4,
        textures: {
          baseColor: { textureId: "base-color", texCoordSet: 1, colorSpace: "srgb", intendedUsage: "base-color" },
          normal: { textureId: "normal", texCoordSet: 0, colorSpace: "normal-map", intendedUsage: "normal" },
        },
      }),
      material("material-b", { baseColorFactor: [0.9, 0.8, 0.7, 1] }),
    ],
  );

  const result = createCanonicalWavefrontMeshInputs({
    document,
    geometry: [geometry("primitive-a"), geometry("primitive-b")],
    textures: new Map([["base-color", baseColorSample], ["normal", normalSample]]),
  });

  assert.equal(result.length, 2);
  assert.deepEqual(result[0].baseColor, [0.2, 0.4, 0.6, 0.75]);
  assert.equal(result[0].metallic, 0.8);
  assert.equal(result[0].roughness, 0.3);
  assert.deepEqual(result[0].baseColorTexture, { ...baseColorSample, texCoord: 1 });
  assert.deepEqual(result[0].normalTexture, { ...normalSample, texCoord: 0, scale: 0.4 });
  assert.equal(result[0].materialRefId, 1);
  assert.equal(result[1].materialRefId, 2);
  assert.deepEqual(result[1].baseColor, [0.9, 0.8, 0.7, 1]);

  const materialSource = createWavefrontGpuMaterialSource(result);
  const acceleration = createWavefrontMeshAcceleration(result, materialSource);
  assert.ok(materialSource.baseColorAtlas.data.length > 0);
  assert.ok(materialSource.normalAtlas.data.length > 0);
  assert.equal(acceleration.triangles[0].materialRefId, 1);
  assert.notDeepEqual(acceleration.triangles[0].baseColorAtlas, [0, 0, 1, 1]);
});

test("keeps absent normals absent so the renderer fallback remains authoritative", () => {
  const [mesh] = createCanonicalWavefrontMeshInputs({
    document: documentWith([{ id: "primitive-a", topology: "triangles", attributes: [] }]),
    geometry: [geometry("primitive-a", { normals: undefined, texcoords: undefined })],
    textures: new Map(),
  });

  assert.equal(mesh.normals, undefined);
  assert.equal(mesh.uvs, undefined);
  assert.equal(normalizeWavefrontMesh(mesh).normals, null);
});

test("fails closed for missing, duplicate, or unsupported primitive geometry", () => {
  const primitives = [{ id: "primitive-a", topology: "triangles", attributes: [] }];
  const document = documentWith(primitives);

  assert.throws(
    () => createCanonicalWavefrontMeshInputs({ document, geometry: [], textures: new Map() }),
    /Missing renderer-ready geometry for primitive primitive-a/,
  );
  assert.throws(
    () => createCanonicalWavefrontMeshInputs({
      document,
      geometry: [geometry("primitive-a"), geometry("primitive-a")],
      textures: new Map(),
    }),
    /Duplicate renderer-ready geometry for primitive primitive-a/,
  );
  assert.throws(
    () => createCanonicalWavefrontMeshInputs({
      document: documentWith([{ id: "lines", topology: "lines", attributes: [] }]),
      geometry: [geometry("lines")],
      textures: new Map(),
    }),
    /Unsupported canonical primitive topology: lines/,
  );
  assert.throws(
    () => createCanonicalWavefrontMeshInputs({
      document: {
        meshes: [
          { id: "mesh-a", primitives },
          { id: "mesh-b", primitives },
        ],
        materials: [],
      },
      geometry: [geometry("primitive-a")],
    }),
    /Duplicate canonical primitive primitive-a/,
  );
});

test("preserves canonical extension factors and extension texture channels", () => {
  const transmissionSample = { width: 1, height: 1, data: [20, 30, 40, 255] };
  const document = documentWith(
    [{ id: "primitive-a", topology: "triangles", attributes: [], materialId: "glass" }],
    [material("glass", {
      transmissionFactor: 0.7,
      clearcoatFactor: 0.5,
      clearcoatRoughnessFactor: 0.2,
      textures: {
        transmission: { textureId: "transmission-map", colorSpace: "linear", intendedUsage: "transmission" },
      },
      extensions: {
        KHR_materials_ior: { ior: 1.45 },
        KHR_materials_transmission: { transmissionFactor: 0.7 },
      },
    })],
  );

  const [mesh] = createCanonicalWavefrontMeshInputs({
    document,
    geometry: [geometry("primitive-a")],
    textures: new Map([["transmission-map", transmissionSample]]),
  });
  const normalized = normalizeWavefrontMesh(mesh);

  assert.equal(normalized.materialExtensions.ior, 1.45);
  assert.equal(normalized.materialExtensions.transmission, 0.7);
  assert.equal(normalized.materialExtensions.clearcoat, 0.5);
  assert.equal(normalized.materialExtensions.clearcoatRoughness, 0.2);
  assert.deepEqual(normalized.materialExtensions.textures.transmission, transmissionSample);
});

test("rejects unresolved material and texture references instead of dropping them", () => {
  const document = documentWith(
    [{ id: "primitive-a", topology: "triangles", attributes: [], materialId: "missing" }],
  );
  assert.throws(
    () => createCanonicalWavefrontMeshInputs({
      document,
      geometry: [geometry("primitive-a")],
      textures: new Map(),
    }),
    /Missing canonical material missing/,
  );

  const texturedDocument = documentWith(
    [{ id: "primitive-a", topology: "triangles", attributes: [], materialId: "material-a" }],
    [material("material-a", {
      textures: { baseColor: { textureId: "missing-texture", colorSpace: "srgb", intendedUsage: "base-color" } },
    })],
  );
  assert.throws(
    () => createCanonicalWavefrontMeshInputs({
      document: texturedDocument,
      geometry: [geometry("primitive-a")],
      textures: new Map(),
    }),
    /Missing decoded texture sample missing-texture/,
  );
});

test("maps blend material kind and rejects unsupported alpha masks", () => {
  const [blended] = createCanonicalWavefrontMeshInputs({
    document: documentWith(
      [{ id: "primitive-a", topology: "triangles", attributes: [], materialId: "blend" }],
      [material("blend", { alphaMode: "blend", baseColorFactor: [1, 1, 1, 0.4] })],
    ),
    geometry: [geometry("primitive-a")],
  });
  assert.equal(blended.materialKind, "transparent");
  assert.equal(blended.opacity, 0.4);

  assert.throws(
    () => createCanonicalWavefrontMeshInputs({
      document: documentWith(
        [{ id: "primitive-a", topology: "triangles", attributes: [], materialId: "masked" }],
        [material("masked", { alphaMode: "mask", alphaCutoff: 0.5 })],
      ),
      geometry: [geometry("primitive-a")],
    }),
    /alphaMode mask is unsupported/,
  );
});

test("preserves unlit workflow and rejects workflows without a Wavefront mapping", () => {
  const [unlit] = createCanonicalWavefrontMeshInputs({
    document: documentWith(
      [{ id: "primitive-a", topology: "triangles", attributes: [], materialId: "unlit" }],
      [material("unlit", { workflow: "unlit" })],
    ),
    geometry: [geometry("primitive-a")],
  });
  assert.equal(normalizeWavefrontMesh(unlit).materialExtensions.unlit, true);

  assert.throws(
    () => createCanonicalWavefrontMeshInputs({
      document: documentWith(
        [{ id: "primitive-a", topology: "triangles", attributes: [], materialId: "custom" }],
        [material("custom", { workflow: "custom" })],
      ),
      geometry: [geometry("primitive-a")],
    }),
    /Unsupported canonical material workflow: custom/,
  );
});

test("rejects invalid or oversized decoded texture samples", () => {
  const document = documentWith(
    [{ id: "primitive-a", topology: "triangles", attributes: [], materialId: "material-a" }],
    [material("material-a", {
      textures: { baseColor: { textureId: "base", colorSpace: "srgb", intendedUsage: "base-color" } },
    })],
  );
  const options = {
    document,
    geometry: [geometry("primitive-a")],
  };

  assert.throws(
    () => createCanonicalWavefrontMeshInputs({ ...options, textures: new Map([["base", { width: 0, height: 1, data: [] }]]) }),
    /invalid dimensions/,
  );
  assert.throws(
    () => createCanonicalWavefrontMeshInputs({ ...options, textures: new Map([["base", { width: 2, height: 1, data: [255, 255, 255, 255] }]]) }),
    /RGBA values/,
  );
  assert.throws(
    () => createCanonicalWavefrontMeshInputs({ ...options, textures: new Map([["base", { width: 4_097, height: 1, data: [] }]]) }),
    /exceeds the 4096-pixel resource limit/,
  );
});
