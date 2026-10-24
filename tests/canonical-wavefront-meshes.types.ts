import {
  createCanonicalWavefrontMeshInputs,
  type CanonicalRendererGeometryInput,
  type CreateCanonicalWavefrontMeshInputsOptions,
  type WavefrontMeshInput,
  type WavefrontTextureSampleInput,
} from "../src/index.js";
import type { GpuModelDocument } from "@plasius/gpu-model-core";

declare const document: Pick<GpuModelDocument, "meshes" | "materials">;
declare const geometry: readonly CanonicalRendererGeometryInput[];
declare const textures: ReadonlyMap<string, WavefrontTextureSampleInput>;

const options: CreateCanonicalWavefrontMeshInputsOptions = {
  document,
  geometry,
  textures,
};
const result: readonly WavefrontMeshInput[] = createCanonicalWavefrontMeshInputs(options);

void result;

const alphaMesh: WavefrontMeshInput = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], alphaMode: "opaque" };
const blendMesh: WavefrontMeshInput = { ...alphaMesh, alphaMode: "blend" };
// @ts-expect-error masks need an explicit future rendering contract
const maskedMesh: WavefrontMeshInput = { ...alphaMesh, alphaMode: "mask" };
void blendMesh; void maskedMesh;

import { createWavefrontPathTracingComputeRenderer } from '../src/index.js';
async function progressiveContract() {
  const renderer=await createWavefrontPathTracingComputeRenderer({progressive:true,samplesPerPixel:4});
  renderer.renderOnce({samplesPerPixel:1});
  await renderer.renderFrame({samplesPerPixel:3});
  const samples:number=renderer.getSnapshot().accumulatedSamplesPerPixel;
  const enabled:boolean=renderer.config.progressive;
  renderer.resetAccumulation();renderer.destroy();return {samples,enabled};
}
void progressiveContract;
