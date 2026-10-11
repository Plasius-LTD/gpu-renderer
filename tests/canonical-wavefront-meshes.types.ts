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
