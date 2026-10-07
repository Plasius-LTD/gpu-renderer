import {
  createNativeSceneRenderer,
  type NativeSceneFrame,
  type NativeSurfaceMaterial,
} from "../src/index.js";
declare const canvas: HTMLCanvasElement;
const material: NativeSurfaceMaterial = {
  baseColor: {
    width: 1,
    height: 1,
    data: new Uint8ClampedArray([255, 255, 255, 255]),
  },
  normalScale: 0.5,
  clearcoat: 0.7,
  clearcoatRoughness: 0.24,
  clearcoatMap: { width: 1, height: 1, data: new Uint8Array([180, 128, 255, 255]) },
};
const renderer = await createNativeSceneRenderer({
  canvas,
  materials: [material],
});
const frame: NativeSceneFrame = {
  vertices: new Float32Array(36),
  texcoords: new Float32Array(6),
  surfaces: [{ firstVertex: 0, vertexCount: 3, materialIndex: 0 }],
  camera: { eye: [0, 1, 3], target: [0, 0, 0] },
};
renderer.render(frame);
// Existing callers still compile unchanged.
renderer.render({ vertices: frame.vertices, camera: frame.camera });
// @ts-expect-error material uploads use decoded RGBA8 bytes, never float colour arrays.
material.baseColor = { width: 1, height: 1, data: new Float32Array(4) };
// @ts-expect-error every textured range requires a material reference.
frame.surfaces = [{ firstVertex: 0, vertexCount: 3 }];
