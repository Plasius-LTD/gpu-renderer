import {
  rendererDebugOwner,
  rendererWavefrontBufferSchemaVersion,
  rendererWavefrontHitTypes,
  rendererWavefrontPassOrder,
  rendererWavefrontQueuePairStrategy,
} from "./renderer-constants.js";
import { readNonNegativeInteger, readPositiveInteger } from "./renderer-validation.js";

function clampWavefrontAdaptiveSamplesPerPixel(value) {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.min(256, Math.round(value)));
}

export function createWavefrontAdaptiveSamplingLevels(options = {}) {
  const requestedSamplesPerPixel = clampWavefrontAdaptiveSamplesPerPixel(
    options.samplesPerPixel ?? 1
  );
  const minimumSamplesPerPixel = Math.min(
    requestedSamplesPerPixel,
    clampWavefrontAdaptiveSamplesPerPixel(options.minimumSamplesPerPixel ?? 1)
  );
  const frameTimeBudgetMs = Number.isFinite(options.frameTimeBudgetMs)
    ? Math.max(0, Number(options.frameTimeBudgetMs))
    : 0;
  const levels = new Set([minimumSamplesPerPixel, requestedSamplesPerPixel]);
  let currentSamplesPerPixel = minimumSamplesPerPixel;

  while (currentSamplesPerPixel < requestedSamplesPerPixel) {
    levels.add(currentSamplesPerPixel);
    currentSamplesPerPixel *= 2;
  }

  levels.add(Math.min(currentSamplesPerPixel, requestedSamplesPerPixel));

  return Object.freeze({
    requestedSamplesPerPixel,
    minimumSamplesPerPixel,
    frameTimeBudgetMs,
    levels: Object.freeze(
      [...levels]
        .sort((left, right) => left - right)
        .map((samplesPerPixel) =>
          Object.freeze({
            id: `${samplesPerPixel}spp`,
            label: `${samplesPerPixel} spp`,
            estimatedCostMs: samplesPerPixel,
            config: Object.freeze({
              samplesPerPixel,
              frameTimeBudgetMs,
              minimumSamplesPerPixel,
            }),
          })
        )
    ),
  });
}

function createWavefrontField(name, type, description) {
  return Object.freeze({
    name,
    type,
    description,
  });
}

const rendererWavefrontBufferContracts = Object.freeze({
  ray: Object.freeze({
    schemaVersion: rendererWavefrontBufferSchemaVersion,
    recordName: "RayRecord",
    fields: Object.freeze([
      createWavefrontField("rayId", "u32", "Stable ray identifier for correlation and debugging."),
      createWavefrontField("parentRayId", "u32", "Parent ray identifier for continuation lineage."),
      createWavefrontField("sourcePixelId", "u32", "Screen pixel or texel that owns the sample."),
      createWavefrontField("sampleId", "u32", "Per-pixel sample slot for accumulation."),
      createWavefrontField("bounce", "u32", "Breadth-first bounce depth for the queue entry."),
      createWavefrontField("origin", "vec3<f32>", "Ray origin in renderer world space."),
      createWavefrontField("direction", "vec3<f32>", "Normalized ray direction in renderer world space."),
      createWavefrontField("throughput", "vec3<f32>", "Current physical path throughput before the next event."),
      createWavefrontField("mediumRefId", "u32", "Active medium reference identifier for the ray."),
      createWavefrontField("flags", "u32", "Bit flags for front-face state, debug, and quality toggles."),
    ]),
  }),
  hit: Object.freeze({
    schemaVersion: rendererWavefrontBufferSchemaVersion,
    recordName: "HitRecord",
    fields: Object.freeze([
      createWavefrontField("rayId", "u32", "Ray identifier copied from the active queue."),
      createWavefrontField("sourcePixelId", "u32", "Pixel/texel owner for the ray sample."),
      createWavefrontField("hitType", rendererWavefrontHitTypes.join(" | "), "Resolved hit classification for termination or continuation."),
      createWavefrontField("distance", "f32", "Nearest-hit distance or miss sentinel."),
      createWavefrontField("entityId", "u32", "Stable scene entity identifier."),
      createWavefrontField("instanceId", "u32", "Renderer instance identifier."),
      createWavefrontField("primitiveId", "u32", "Primitive or triangle identifier."),
      createWavefrontField("materialId", "u32", "Surface material identifier."),
      createWavefrontField("barycentrics", "vec3<f32>", "Triangle barycentric coordinates for interpolation."),
      createWavefrontField("uv", "vec2<f32>", "Resolved surface UV when available."),
      createWavefrontField("geometricNormal", "vec3<f32>", "True geometric face normal."),
      createWavefrontField("shadingNormal", "vec3<f32>", "Interpolated or repaired shading normal."),
      createWavefrontField("frontFace", "bool", "Front-face classification for shading and medium transitions."),
    ]),
  }),
  surface: Object.freeze({
    schemaVersion: rendererWavefrontBufferSchemaVersion,
    recordName: "SurfaceRecord",
    fields: Object.freeze([
      createWavefrontField("rayId", "u32", "Ray identifier matched to the resolved hit."),
      createWavefrontField("entityId", "u32", "Stable scene entity identifier."),
      createWavefrontField("materialRefId", "u32", "Material-reference indirection for shading lookup tables."),
      createWavefrontField("mediumRefId", "u32", "Resolved medium transition/reference identifier."),
      createWavefrontField("geometricNormal", "vec3<f32>", "Preserved geometric normal for hemisphere checks."),
      createWavefrontField("shadingNormal", "vec3<f32>", "Normal used for BSDF/BTDF evaluation."),
      createWavefrontField("uv", "vec2<f32>", "Resolved texture coordinate."),
      createWavefrontField("tangentFrame", "mat3x3<f32>", "Optional tangent basis for normal-map transforms."),
    ]),
  }),
  materialReference: Object.freeze({
    schemaVersion: rendererWavefrontBufferSchemaVersion,
    recordName: "MaterialReferenceRecord",
    fields: Object.freeze([
      createWavefrontField("materialRefId", "u32", "Stable material lookup identifier."),
      createWavefrontField("materialId", "u32", "Authoritative material id from scene submission."),
      createWavefrontField("shadingModel", "u32", "Renderer-owned shading model enum."),
      createWavefrontField("textureSetId", "u32", "Texture indirection set for the material."),
      createWavefrontField("flags", "u32", "Alpha, emissive, transmission, and debug flags."),
    ]),
  }),
  mediumReference: Object.freeze({
    schemaVersion: rendererWavefrontBufferSchemaVersion,
    recordName: "MediumReferenceRecord",
    fields: Object.freeze([
      createWavefrontField("mediumRefId", "u32", "Stable medium lookup identifier."),
      createWavefrontField("mediumId", "u32", "Authoritative medium or fluid descriptor id."),
      createWavefrontField("phaseModel", "u32", "Medium phase-function selector."),
      createWavefrontField("absorption", "vec3<f32>", "Absorption coefficients for the active medium."),
      createWavefrontField("scattering", "vec3<f32>", "Scattering coefficients for the active medium."),
    ]),
  }),
  accumulation: Object.freeze({
    schemaVersion: rendererWavefrontBufferSchemaVersion,
    recordName: "AccumulationRecord",
    fields: Object.freeze([
      createWavefrontField("sourcePixelId", "u32", "Screen pixel or texel accumulator owner."),
      createWavefrontField("sampleCount", "u32", "Committed sample count for the pixel."),
      createWavefrontField("radiance", "vec3<f32>", "Accumulated radiance before tone-map/output resolve."),
      createWavefrontField("throughput", "vec3<f32>", "Last surviving physical throughput for debug and variance tracking."),
      createWavefrontField("resetEpoch", "u32", "Accumulation reset generation for history invalidation."),
    ]),
  }),
});

function buildWavefrontTerminationPolicy() {
  return Object.freeze({
    terminalHitTypes: Object.freeze(["emissive", "environment", "miss"]),
    continuationHitTypes: Object.freeze(["surface", "transparent"]),
    emissive: Object.freeze({
      action: "accumulate-and-stop",
      contributesRadiance: true,
    }),
    environment: Object.freeze({
      action: "accumulate-and-stop",
      contributesRadiance: true,
    }),
    miss: Object.freeze({
      action: "accumulate-environment-or-dark-stop",
      contributesRadiance: true,
    }),
  });
}

function buildWavefrontBounceSchedule(maxDepth) {
  return Object.freeze(
    Array.from({ length: maxDepth }, (_, index) =>
      Object.freeze({
        bounce: index,
        readQueue: index % 2 === 0 ? "active" : "next",
        writeQueue: index % 2 === 0 ? "next" : "active",
        passOrder: rendererWavefrontPassOrder,
      })
    )
  );
}

export function createWavefrontPathTracingPlan(options = {}) {
  const maxDepth =
    options.maxDepth === undefined
      ? 6
      : readPositiveInteger("maxDepth", options.maxDepth);
  const queueCapacity =
    options.queueCapacity === undefined
      ? 8192
      : readPositiveInteger("queueCapacity", options.queueCapacity);
  const accumulationResetEpoch =
    options.accumulationResetEpoch === undefined
      ? 0
      : readNonNegativeInteger("accumulationResetEpoch", options.accumulationResetEpoch);
  const explicitLightSampling = options.explicitLightSampling === true;

  return Object.freeze({
    schemaVersion: rendererWavefrontBufferSchemaVersion,
    owner: rendererDebugOwner,
    maxDepth,
    queueCapacity,
    explicitLightSampling,
    accumulationResetEpoch,
    queueLayout: Object.freeze({
      strategy: rendererWavefrontQueuePairStrategy,
      compactAfterScatter: true,
      queues: Object.freeze([
        Object.freeze({ name: "active", role: "current-bounce" }),
        Object.freeze({ name: "next", role: "next-bounce" }),
      ]),
    }),
    bufferContracts: rendererWavefrontBufferContracts,
    bounceSchedule: buildWavefrontBounceSchedule(maxDepth),
    terminationPolicy: buildWavefrontTerminationPolicy(),
  });
}
