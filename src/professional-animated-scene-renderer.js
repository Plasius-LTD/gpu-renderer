import { createAnimatedGltfModel } from "./animated-gltf-model.js";
import { createGpuRenderer } from "./renderer-webgpu-runtime.js";

function nowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerp3(a, b, t) {
  return [
    lerp(a[0] ?? 0, b[0] ?? 0, t),
    lerp(a[1] ?? 0, b[1] ?? 0, t),
    lerp(a[2] ?? 0, b[2] ?? 0, t),
  ];
}

function add3(a, b) {
  return [(a[0] ?? 0) + (b[0] ?? 0), (a[1] ?? 0) + (b[1] ?? 0), (a[2] ?? 0) + (b[2] ?? 0)];
}

function sub3(a, b) {
  return [(a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0)];
}

function length3(value) {
  return Math.hypot(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0);
}

function normalize3(value, fallback = [0, 0, -1]) {
  const length = length3(value);
  return length > 1e-6
    ? [(value[0] ?? 0) / length, (value[1] ?? 0) / length, (value[2] ?? 0) / length]
    : [...fallback];
}

function scale3(value, scalar) {
  return [(value[0] ?? 0) * scalar, (value[1] ?? 0) * scalar, (value[2] ?? 0) * scalar];
}

function durationFromBeats(beats) {
  return beats.reduce((total, beat) => total + Math.max(1, beat.durationMs ?? 1), 0);
}

function resolveBeat(beats, loopTimeMs) {
  let cursor = 0;
  for (const beat of beats) {
    const durationMs = Math.max(1, beat.durationMs ?? 1);
    if (loopTimeMs < cursor + durationMs) {
      return { beat, startMs: cursor, beatTimeMs: loopTimeMs - cursor, durationMs };
    }
    cursor += durationMs;
  }
  const fallback = beats.at(-1) ?? null;
  return { beat: fallback, startMs: Math.max(0, cursor - (fallback?.durationMs ?? 1)), beatTimeMs: 0, durationMs: fallback?.durationMs ?? 1 };
}

function movementRequirementKind(requirement, beat) {
  return requirement?.kind ?? requirement?.type ?? (beat?.kind === "locomotion" ? "travel" : "stationary");
}

function clipProfileById(clipAssets = []) {
  return new Map(clipAssets.map((clip) => [clip.id, clip.movementProfile ?? clip.profile ?? null]));
}

function validateProfessionalInputs({ characterModel, beats, clipAssets }) {
  const issues = [];
  if (!characterModel) {
    issues.push("professional animation requires a skinned GLB character model");
  } else {
    if (!characterModel.professionalRenderable) {
      issues.push("professional animation requires UVs, normals, skinning, diffuse texture, normal texture, and resolved texture buffers");
    }
    if (characterModel.textureCount <= 0) {
      issues.push("professional animation requires at least one model texture");
    }
  }

  const profiles = clipProfileById(clipAssets);
  for (const beat of beats) {
    const kind = movementRequirementKind(beat.movementRequirement, beat);
    if (kind !== "travel" && kind !== "jump" && kind !== "root-authored") {
      continue;
    }
    const profile = profiles.get(beat.clipId);
    if (!profile) {
      issues.push(`beat '${beat.id}' uses '${beat.clipId}' without a movement profile`);
      continue;
    }
    if (profile.motionMode !== "root-authored" && profile.motionMode !== "jump") {
      issues.push(`beat '${beat.id}' uses '${beat.clipId}' without authored root motion`);
    }
    if (Number(profile.rootTranslationDistance ?? 0) <= 0) {
      issues.push(`beat '${beat.id}' uses '${beat.clipId}' with no root translation distance`);
    }
  }
  return issues;
}

function buildRouteSegments(route) {
  if (route.length < 2) {
    return [];
  }
  return route.slice(1).map((point, index) => {
    const previous = route[index];
    const vector = sub3(point.position, previous.position);
    return {
      start: previous.position,
      end: point.position,
      direction: normalize3(vector),
      distance: length3(vector),
    };
  });
}

function resolveRootMotionPosition({ route, beats, clipAssets, loopTimeMs }) {
  const profiles = clipProfileById(clipAssets);
  const segments = buildRouteSegments(route);
  let position = route[0]?.position ? [...route[0].position] : [0, 0, 0];
  let segmentIndex = 0;
  let cursorMs = 0;

  for (const beat of beats) {
    const durationMs = Math.max(1, beat.durationMs ?? 1);
    const profile = profiles.get(beat.clipId);
    const kind = movementRequirementKind(beat.movementRequirement, beat);
    const moves = kind === "travel" || kind === "jump" || kind === "root-authored";
    const distance = moves ? Number(profile?.rootTranslationDistance ?? 0) : 0;
    const active = loopTimeMs >= cursorMs && loopTimeMs < cursorMs + durationMs;
    const progress = active ? clamp01((loopTimeMs - cursorMs) / durationMs) : 1;
    if (moves && distance > 0) {
      const segment = segments[Math.min(segmentIndex, Math.max(0, segments.length - 1))];
      if (segment) {
        const travelled = Math.min(distance * progress, segment.distance);
        const nextPosition = add3(position, scale3(segment.direction, travelled));
        if (active) {
          return {
            position: nextPosition,
            forward: segment.direction,
            activeBeat: beat,
            activeProfile: profile,
            activeMovementMode: kind,
            movementDistance: distance,
          };
        }
        position = add3(position, scale3(segment.direction, Math.min(distance, segment.distance)));
        if (length3(sub3(position, segment.end)) < 0.05) {
          segmentIndex += 1;
          position = [...segment.end];
        }
      }
    } else if (active) {
      return {
        position,
        forward: segments[Math.min(segmentIndex, Math.max(0, segments.length - 1))]?.direction ?? [0, 0, -1],
        activeBeat: beat,
        activeProfile: profile,
        activeMovementMode: kind,
        movementDistance: 0,
      };
    }
    cursorMs += durationMs;
  }

  return {
    position,
    forward: segments.at(-1)?.direction ?? [0, 0, -1],
    activeBeat: beats.at(-1) ?? null,
    activeProfile: profiles.get(beats.at(-1)?.clipId) ?? null,
    activeMovementMode: "stationary",
    movementDistance: 0,
  };
}

function createInitialSnapshot({ characterModel, camera, route }) {
  const position = route[0]?.position ? [...route[0].position] : [0, 0, 0];
  const cameraPosition = add3(position, camera.shoulderOffset ?? camera.offset ?? [-0.9, 2.2, 4.8]);
  return {
    frame: 0,
    running: false,
    renderMode: "webgpu-pbr",
    webGpuActive: true,
    texturedSkinnedRenderingActive: true,
    pbrMaterialActive: true,
    shadowPassActive: false,
    fallbackProxyActive: false,
    activeClipId: "",
    activeBeatId: "",
    activeMovementMode: "stationary",
    blendProgress: 0,
    clipTimeMs: 0,
    characterPosition: position,
    cameraPosition,
    cameraTransform: { position: cameraPosition, target: position, up: [0, 1, 0] },
    cameraViewMode: "cinematic-follow",
    modelLoaded: Boolean(characterModel),
    modelRenderable: true,
    textureCount: characterModel.textureCount,
    materialCount: characterModel.materialCount,
    normalTextureActive: characterModel.hasNormalTexture,
    skinnedVertexCount: characterModel.vertexCount,
    skinnedTriangleCount: characterModel.triangleCount,
    skinnedJointCount: characterModel.jointCount,
    skinnedAnimatedNodeCount: characterModel.animatedNodeCount,
    skinnedClipCount: characterModel.clipCount,
    activeClipRenderable: false,
    movementValidation: {
      status: "passed",
      warnings: [],
      rootMotionPolicy: "root-motion-required",
      rootMotionSource: "none",
      movementDistance: 0,
    },
    frameState: "initialized",
  };
}

export async function createProfessionalAnimatedSceneRenderer(options = {}) {
  const adventure = options.animationAdventure ?? {};
  const route = [...(options.route ?? adventure.route ?? [])];
  const beats = [...(options.beats ?? adventure.beats ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const clipAssets = options.clipAssets ?? adventure.clipAssets ?? [];
  const camera = {
    mode: "cinematic-follow",
    offset: [-0.9, 2.2, 4.8],
    shoulderOffset: [-0.9, 2.2, 4.8],
    velocityLookAheadMs: 420,
    yawSmoothingMs: 180,
    pitchSmoothingMs: 240,
    deadZoneRadius: 0.4,
    maxLagDistance: 2.8,
    ...(options.camera ?? adventure.camera ?? {}),
  };
  const characterModel = createAnimatedGltfModel(options.modelAsset ?? adventure.modelAsset, clipAssets);
  const inputIssues = validateProfessionalInputs({ characterModel, beats, clipAssets });
  if (inputIssues.length) {
    throw new Error(`Professional animation renderer cannot start. ${inputIssues.join("; ")}`);
  }

  const baseRenderer = await createGpuRenderer({
    ...options,
    canvas: options.canvas,
    clearColor: options.clearColor ?? "#8fb47a",
  });

  let snapshot = createInitialSnapshot({ characterModel, camera, route });
  let running = false;
  let startedAtMs;
  let frame = 0;
  let cameraPosition = [...snapshot.cameraPosition];
  const loopDurationMs = Math.max(1, durationFromBeats(beats));

  function renderOnce(timestamp = nowMs()) {
    if (startedAtMs === undefined) {
      startedAtMs = timestamp;
    }
    const loopTimeMs = Math.max(0, timestamp - startedAtMs) % loopDurationMs;
    const beatFrame = resolveBeat(beats, loopTimeMs);
    const motion = resolveRootMotionPosition({ route, beats, clipAssets, loopTimeMs });
    const desiredCamera = add3(motion.position, camera.shoulderOffset ?? camera.offset ?? [-0.9, 2.2, 4.8]);
    const smoothing = clamp01(16.67 / Math.max(1, camera.yawSmoothingMs ?? 180));
    cameraPosition = lerp3(cameraPosition, desiredCamera, smoothing);
    frame += 1;
    baseRenderer.renderOnce(timestamp);
    const sample = characterModel.sample(motion.activeBeat?.clipId, beatFrame.beatTimeMs);

    snapshot = {
      ...snapshot,
      frame,
      running,
      activeClipId: motion.activeBeat?.clipId ?? "",
      activeBeatId: motion.activeBeat?.id ?? "",
      activeMovementMode: motion.activeMovementMode,
      blendProgress: 1,
      clipTimeMs: beatFrame.beatTimeMs,
      characterPosition: motion.position,
      cameraPosition: [...cameraPosition],
      cameraTransform: {
        position: [...cameraPosition],
        target: add3(motion.position, scale3(motion.forward, 0.8)),
        up: [0, 1, 0],
      },
      activeClipRenderable: sample.activeClipRenderable,
      movementValidation: {
        status: "passed",
        warnings: [],
        rootMotionPolicy: "root-motion-required",
        rootMotionSource: motion.activeProfile?.motionMode ?? "none",
        rootTranslationDistance: motion.activeProfile?.rootTranslationDistance ?? 0,
        movementDistance: motion.movementDistance,
      },
      frameState: running ? "running" : "rendered-once",
    };
    return snapshot;
  }

  return {
    start() {
      running = true;
      snapshot = { ...snapshot, running: true, frameState: "running" };
      baseRenderer.start();
    },
    resize(width, height, devicePixelRatio = 1) {
      baseRenderer.resize(width, height, devicePixelRatio);
    },
    renderOnce,
    getSnapshot() {
      return {
        ...snapshot,
        characterPosition: [...snapshot.characterPosition],
        cameraPosition: [...snapshot.cameraPosition],
        cameraTransform: {
          position: [...snapshot.cameraTransform.position],
          target: [...snapshot.cameraTransform.target],
          up: [...snapshot.cameraTransform.up],
        },
        movementValidation: {
          ...snapshot.movementValidation,
          warnings: [...snapshot.movementValidation.warnings],
        },
      };
    },
    destroy() {
      running = false;
      snapshot = { ...snapshot, running: false, frameState: "destroyed" };
      baseRenderer.destroy();
    },
  };
}
