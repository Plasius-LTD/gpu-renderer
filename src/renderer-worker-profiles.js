import {
  defaultRendererWorkerProfile,
  rendererAccelerationStructureUpdateClasses,
  rendererDebugOwner,
  rendererRayTracingStageOrder,
  rendererRepresentationBands,
  rendererWorkerQueueClass,
} from "./renderer-constants.js";
import { assertRendererIdentifier } from "./renderer-validation.js";
import { createWavefrontPathTracingPlan } from "./renderer-wavefront-plan.js";

const rendererRayTracingStageDefinitions = Object.freeze(
  rendererRayTracingStageOrder.map((key, index) =>
    Object.freeze({
      key,
      order: index + 1,
      required: true,
      description:
        {
          primaryVisibility: "Primary visibility and depth preparation.",
          shadowAssist: "Shadow assist passes and regional shadow preparation.",
          opaqueFoundation: "Main opaque foundation for shading and tracing inputs.",
          rtDirectLighting: "Ray-traced direct lighting and premium shadows.",
          rtReflections: "Ray-traced reflections for important surfaces.",
          rtGlobalIllumination: "Selective ray-traced indirect lighting and GI.",
          denoiseTemporal: "Required denoise and temporal accumulation stage.",
          transparents: "Transparents, particles, and volumetrics composition.",
          composition: "Final world composition and color resolve.",
          present: "Presentation to the active surface.",
        }[key],
    })
  )
);

const rendererRepresentationBandPolicies = Object.freeze({
  near: Object.freeze({
    band: "near",
    rasterMode: "full-live",
    rtParticipation: "premium",
    shadowSource: "ray-traced-primary",
    temporalReuse: "balanced",
    updateCadenceDivisor: 1,
  }),
  mid: Object.freeze({
    band: "mid",
    rasterMode: "simplified-live",
    rtParticipation: "selective",
    shadowSource: "regional-raster-and-proxy",
    temporalReuse: "aggressive",
    updateCadenceDivisor: 2,
  }),
  far: Object.freeze({
    band: "far",
    rasterMode: "proxy-or-cached",
    rtParticipation: "proxy",
    shadowSource: "merged-proxy-casters",
    temporalReuse: "high",
    updateCadenceDivisor: 8,
  }),
  horizon: Object.freeze({
    band: "horizon",
    rasterMode: "horizon-shell",
    rtParticipation: "disabled",
    shadowSource: "baked-impression",
    temporalReuse: "cached",
    updateCadenceDivisor: 60,
  }),
});

const rendererAccelerationStructurePolicies = Object.freeze(
  rendererAccelerationStructureUpdateClasses.map((updateClass) =>
    Object.freeze({
      updateClass,
      description:
        {
          static: "Stable static world geometry with infrequent rebuilds.",
          "rigid-dynamic":
            "Rigid transforms that can be refit or relinked without full deformation updates.",
          deforming:
            "Skinned or vertex-deforming content treated as a managed RT cost center.",
          proxy:
            "Low-cost RT proxy or distant representation updates.",
        }[updateClass],
    })
  )
);

function buildRendererWorkerBudgetLevels(jobType, queueClass, levels) {
  return Object.freeze(
    levels.map((level) =>
      Object.freeze({
        id: level.id,
        estimatedCostMs: level.estimatedCostMs,
        config: Object.freeze({
          maxDispatchesPerFrame: level.config.maxDispatchesPerFrame,
          maxJobsPerDispatch: level.config.maxJobsPerDispatch,
          cadenceDivisor: level.config.cadenceDivisor,
          workgroupScale: level.config.workgroupScale,
          maxQueueDepth: level.config.maxQueueDepth,
          metadata: Object.freeze({
            owner: rendererDebugOwner,
            queueClass,
            jobType,
            quality: level.id,
          }),
        }),
      })
    )
  );
}

const rendererWorkerProfileSpecs = {
  realtime: {
    description:
      "Frame-stage DAG for flat rendering with visibility, main encode, post-processing, and submit.",
    suggestedAllocationIds: [
      "renderer.surface.current",
      "renderer.visibility.worklist",
      "renderer.post-process.history",
    ],
    jobs: {
      acquire: {
        priority: 5,
        dependencies: [],
        domain: "resolution",
        importance: "critical",
        levels: [
          {
            id: "fixed",
            estimatedCostMs: 0.2,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 1,
              cadenceDivisor: 1,
              workgroupScale: 1,
              maxQueueDepth: 1,
            },
          },
        ],
        suggestedAllocationIds: ["renderer.surface.current"],
      },
      visibility: {
        priority: 4,
        dependencies: [],
        domain: "geometry",
        importance: "high",
        levels: [
          {
            id: "low",
            estimatedCostMs: 0.4,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 128,
              cadenceDivisor: 2,
              workgroupScale: 0.5,
              maxQueueDepth: 256,
            },
          },
          {
            id: "medium",
            estimatedCostMs: 0.8,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 256,
              cadenceDivisor: 1,
              workgroupScale: 0.75,
              maxQueueDepth: 384,
            },
          },
          {
            id: "high",
            estimatedCostMs: 1.2,
            config: {
              maxDispatchesPerFrame: 2,
              maxJobsPerDispatch: 512,
              cadenceDivisor: 1,
              workgroupScale: 1,
              maxQueueDepth: 512,
            },
          },
        ],
        suggestedAllocationIds: ["renderer.visibility.worklist"],
      },
      mainEncode: {
        priority: 4,
        dependencies: ["acquire", "visibility"],
        domain: "geometry",
        importance: "critical",
        levels: [
          {
            id: "low",
            estimatedCostMs: 1.2,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 128,
              cadenceDivisor: 1,
              workgroupScale: 0.6,
              maxQueueDepth: 192,
            },
          },
          {
            id: "medium",
            estimatedCostMs: 2.1,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 256,
              cadenceDivisor: 1,
              workgroupScale: 0.8,
              maxQueueDepth: 256,
            },
          },
          {
            id: "high",
            estimatedCostMs: 3,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 384,
              cadenceDivisor: 1,
              workgroupScale: 1,
              maxQueueDepth: 384,
            },
          },
        ],
        suggestedAllocationIds: ["renderer.surface.current"],
      },
      postProcess: {
        priority: 3,
        dependencies: ["mainEncode"],
        domain: "post-processing",
        importance: "high",
        levels: [
          {
            id: "low",
            estimatedCostMs: 0.5,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 64,
              cadenceDivisor: 2,
              workgroupScale: 0.5,
              maxQueueDepth: 96,
            },
          },
          {
            id: "medium",
            estimatedCostMs: 0.9,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 128,
              cadenceDivisor: 1,
              workgroupScale: 0.75,
              maxQueueDepth: 128,
            },
          },
          {
            id: "high",
            estimatedCostMs: 1.4,
            config: {
              maxDispatchesPerFrame: 2,
              maxJobsPerDispatch: 192,
              cadenceDivisor: 1,
              workgroupScale: 1,
              maxQueueDepth: 192,
            },
          },
        ],
        suggestedAllocationIds: ["renderer.post-process.history"],
      },
      submit: {
        priority: 2,
        dependencies: ["postProcess"],
        domain: "resolution",
        importance: "critical",
        levels: [
          {
            id: "fixed",
            estimatedCostMs: 0.2,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 1,
              cadenceDivisor: 1,
              workgroupScale: 1,
              maxQueueDepth: 1,
            },
          },
        ],
        suggestedAllocationIds: ["renderer.surface.current"],
      },
    },
  },
  xr: {
    description:
      "Frame-stage DAG for XR rendering with late-latch coordination before main encode and submit.",
    suggestedAllocationIds: [
      "renderer.xr.surface.current",
      "renderer.xr.visibility.worklist",
    ],
    jobs: {
      acquire: {
        priority: 5,
        dependencies: [],
        domain: "xr",
        importance: "critical",
        levels: [
          {
            id: "fixed",
            estimatedCostMs: 0.2,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 1,
              cadenceDivisor: 1,
              workgroupScale: 1,
              maxQueueDepth: 1,
            },
          },
        ],
        suggestedAllocationIds: ["renderer.xr.surface.current"],
      },
      visibility: {
        priority: 4,
        dependencies: [],
        domain: "geometry",
        importance: "high",
        levels: [
          {
            id: "low",
            estimatedCostMs: 0.5,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 96,
              cadenceDivisor: 2,
              workgroupScale: 0.5,
              maxQueueDepth: 192,
            },
          },
          {
            id: "medium",
            estimatedCostMs: 0.9,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 192,
              cadenceDivisor: 1,
              workgroupScale: 0.75,
              maxQueueDepth: 256,
            },
          },
          {
            id: "high",
            estimatedCostMs: 1.3,
            config: {
              maxDispatchesPerFrame: 2,
              maxJobsPerDispatch: 320,
              cadenceDivisor: 1,
              workgroupScale: 1,
              maxQueueDepth: 320,
            },
          },
        ],
        suggestedAllocationIds: ["renderer.xr.visibility.worklist"],
      },
      lateLatch: {
        priority: 5,
        dependencies: ["acquire"],
        domain: "xr",
        importance: "critical",
        levels: [
          {
            id: "fixed",
            estimatedCostMs: 0.15,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 1,
              cadenceDivisor: 1,
              workgroupScale: 1,
              maxQueueDepth: 1,
            },
          },
        ],
        suggestedAllocationIds: ["renderer.xr.surface.current"],
      },
      mainEncode: {
        priority: 4,
        dependencies: ["visibility", "lateLatch"],
        domain: "xr",
        importance: "critical",
        levels: [
          {
            id: "low",
            estimatedCostMs: 1.1,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 96,
              cadenceDivisor: 1,
              workgroupScale: 0.6,
              maxQueueDepth: 128,
            },
          },
          {
            id: "medium",
            estimatedCostMs: 1.8,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 192,
              cadenceDivisor: 1,
              workgroupScale: 0.8,
              maxQueueDepth: 192,
            },
          },
          {
            id: "high",
            estimatedCostMs: 2.6,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 256,
              cadenceDivisor: 1,
              workgroupScale: 1,
              maxQueueDepth: 256,
            },
          },
        ],
        suggestedAllocationIds: ["renderer.xr.surface.current"],
      },
      submit: {
        priority: 2,
        dependencies: ["mainEncode"],
        domain: "xr",
        importance: "critical",
        levels: [
          {
            id: "fixed",
            estimatedCostMs: 0.2,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 1,
              cadenceDivisor: 1,
              workgroupScale: 1,
              maxQueueDepth: 1,
            },
          },
        ],
        suggestedAllocationIds: ["renderer.xr.surface.current"],
      },
    },
  },
};

function buildRendererInputBoundary(profile) {
  return Object.freeze({
    type: "stable-visual-snapshot",
    owner: rendererDebugOwner,
    profile,
    authority: "visual",
    source: "scene-preparation",
    stable: true,
  });
}

function buildRendererRenderStages(profile) {
  return Object.freeze(
    rendererRayTracingStageDefinitions.map((stage) =>
      Object.freeze({
        ...stage,
        profile,
        workerJobKeys:
          profile === "xr" && stage.key === "primaryVisibility"
            ? Object.freeze(["lateLatch", "visibility"])
            : stage.key === "present"
              ? Object.freeze(["submit"])
              : stage.key === "denoiseTemporal" ||
                  stage.key === "transparents" ||
                  stage.key === "composition"
                ? Object.freeze(["postProcess"])
                : stage.key === "primaryVisibility"
                  ? Object.freeze(["visibility"])
                  : stage.key === "shadowAssist" ||
                      stage.key === "opaqueFoundation" ||
                      stage.key === "rtDirectLighting" ||
                      stage.key === "rtReflections" ||
                      stage.key === "rtGlobalIllumination"
                    ? Object.freeze(["mainEncode"])
                    : Object.freeze(["mainEncode"]),
      })
    )
  );
}

function buildRendererRepresentationBands(profile) {
  return Object.freeze(
    rendererRepresentationBands.map((band) =>
      Object.freeze({
        ...rendererRepresentationBandPolicies[band],
        profile,
      })
    )
  );
}

function buildRendererAccelerationStructureUpdates(profile) {
  return Object.freeze(
    rendererAccelerationStructurePolicies.map((policy) =>
      Object.freeze({
        ...policy,
        profile,
      })
    )
  );
}

function buildRendererWorkerProfile(name, spec) {
  return Object.freeze({
    name,
    description: spec.description,
    jobs: Object.freeze(Object.keys(spec.jobs)),
  });
}

function buildRendererWorkerManifestJob(profileName, jobName, spec) {
  const label = `renderer.${profileName}.${jobName}`;
  return Object.freeze({
    key: jobName,
    label,
    worker: Object.freeze({
      jobType: label,
      queueClass: rendererWorkerQueueClass,
      priority: spec.priority,
      dependencies: Object.freeze(
        spec.dependencies.map((dependency) => `renderer.${profileName}.${dependency}`)
      ),
      schedulerMode: "dag",
    }),
    performance: Object.freeze({
      id: label,
      jobType: label,
      queueClass: rendererWorkerQueueClass,
      domain: spec.domain,
      authority: "visual",
      importance: spec.importance,
      levels: buildRendererWorkerBudgetLevels(
        label,
        rendererWorkerQueueClass,
        spec.levels
      ),
    }),
    debug: Object.freeze({
      owner: rendererDebugOwner,
      queueClass: rendererWorkerQueueClass,
      jobType: label,
      tags: Object.freeze(["renderer", profileName, jobName, spec.domain]),
      suggestedAllocationIds: Object.freeze([...spec.suggestedAllocationIds]),
    }),
  });
}

function buildRendererWorkerManifest(name, spec) {
  return Object.freeze({
    schemaVersion: 1,
    owner: rendererDebugOwner,
    profile: name,
    description: spec.description,
    queueClass: rendererWorkerQueueClass,
    schedulerMode: "dag",
    inputBoundary: buildRendererInputBoundary(name),
    renderStages: buildRendererRenderStages(name),
    representationBands: buildRendererRepresentationBands(name),
    accelerationStructureUpdates: buildRendererAccelerationStructureUpdates(name),
    suggestedAllocationIds: Object.freeze([...spec.suggestedAllocationIds]),
    jobs: Object.freeze(
      Object.entries(spec.jobs).map(([jobName, jobSpec]) =>
        buildRendererWorkerManifestJob(name, jobName, jobSpec)
      )
    ),
  });
}

export const rendererWorkerProfiles = Object.freeze(
  Object.fromEntries(
    Object.entries(rendererWorkerProfileSpecs).map(([name, spec]) => [
      name,
      buildRendererWorkerProfile(name, spec),
    ])
  )
);

export const rendererWorkerProfileNames = Object.freeze(
  Object.keys(rendererWorkerProfiles)
);

export const rendererWorkerManifests = Object.freeze(
  Object.fromEntries(
    Object.entries(rendererWorkerProfileSpecs).map(([name, spec]) => [
      name,
      buildRendererWorkerManifest(name, spec),
    ])
  )
);

export function getRendererWorkerProfile(name = defaultRendererWorkerProfile) {
  const profile = rendererWorkerProfiles[name];
  if (!profile) {
    const available = rendererWorkerProfileNames.join(", ");
    throw new Error(`Unknown renderer worker profile "${name}". Available: ${available}.`);
  }
  return profile;
}

export function getRendererWorkerManifest(name = defaultRendererWorkerProfile) {
  const manifest = rendererWorkerManifests[name];
  if (!manifest) {
    const available = rendererWorkerProfileNames.join(", ");
    throw new Error(`Unknown renderer worker profile "${name}". Available: ${available}.`);
  }
  return manifest;
}

export function createRayTracingRenderPlan(options = {}) {
  const profile = options.profile ?? defaultRendererWorkerProfile;
  const snapshotId = assertRendererIdentifier(
    "snapshotId",
    options.snapshotId
  );
  const workerManifest = getRendererWorkerManifest(profile);
  const representations = Array.isArray(options.representations)
    ? Object.freeze(
        options.representations.map((representation, index) => {
          if (!representation || typeof representation !== "object") {
            throw new Error(`representations[${index}] must be an object.`);
          }
          const band = assertRendererIdentifier(
            `representations[${index}].band`,
            representation.band
          );
          if (!rendererRepresentationBands.includes(band)) {
            throw new Error(
              `representations[${index}].band must be one of: ${rendererRepresentationBands.join(", ")}.`
            );
          }
          return Object.freeze({
            ...representation,
            band,
          });
        })
      )
    : workerManifest.representationBands;

  return Object.freeze({
    schemaVersion: 1,
    owner: rendererDebugOwner,
    profile,
    inputBoundary: Object.freeze({
      ...workerManifest.inputBoundary,
      snapshotId,
    }),
    renderStages: workerManifest.renderStages,
    representationBands: representations,
    accelerationStructureUpdates: workerManifest.accelerationStructureUpdates,
    wavefront: createWavefrontPathTracingPlan(options.wavefront),
    workerManifest,
  });
}
