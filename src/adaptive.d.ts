import type {
  CreateWavefrontPathTracingComputeRendererOptions,
  WavefrontPathTracingComputeRenderer,
} from "./index.js";
export interface AdaptiveInspectionProgress {
  readonly completedTiles: number;
  readonly totalTiles: number;
  readonly completedSamples: number;
  readonly targetSamples?: number;
  readonly meanSpp: number;
  readonly minimumSpp: number;
  readonly maximumSpp: number;
}
export interface AdaptiveInspectionResult extends AdaptiveInspectionProgress {
  readonly width: number;
  readonly height: number;
  readonly adaptiveBufferBytes: number;
}
export interface AdaptiveInspectionRenderer extends WavefrontPathTracingComputeRenderer {
  renderAdaptiveFrame(options: {
    budgets: Uint8Array | Uint16Array;
    signal?: AbortSignal;
    onProgress?: (progress: AdaptiveInspectionProgress) => void;
  }): Promise<AdaptiveInspectionResult>;
}
/** Experimental: explicit flag decision required; prescribed budgets, not a variance classifier. */
export function createAdaptiveWavefrontRenderer(
  options: CreateWavefrontPathTracingComputeRendererOptions & {
    "renderer.sampling.adaptivePerPixel.enabled": true;
  },
): Promise<AdaptiveInspectionRenderer>;
