import { resolveCameraRigFrame } from "@plasius/gpu-camera";
import { createAnimatedGltfModel } from "./animated-gltf-model.js";

const DEFAULT_CAMERA = Object.freeze({
  mode: "lagged-follow",
  viewMode: "spectator",
  cubicBezier: [0.22, 0.61, 0.36, 1],
  lagMs: 240,
  lookAheadMs: 320,
  offset: [0, 2.4, 5.5],
  constraints: Object.freeze({
    maxDistance: 10,
    firstPersonHeadOffset: 0.05,
  }),
  headLook: Object.freeze({
    enabled: true,
    returnMs: 240,
  }),
});

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

function normalize3(value, fallback = [0, 0, -1]) {
  if (!Array.isArray(value) || value.length < 3) {
    return [...fallback];
  }
  const vector = [
    Number.isFinite(Number(value[0])) ? Number(value[0]) : fallback[0],
    Number.isFinite(Number(value[1])) ? Number(value[1]) : fallback[1],
    Number.isFinite(Number(value[2])) ? Number(value[2]) : fallback[2],
  ];
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length <= 1e-6) {
    return [...fallback];
  }
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function bezierY([, y1, , y2], t) {
  const u = 1 - t;
  return 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t;
}

function durationFromBeats(beats) {
  return beats.reduce((total, beat) => total + Math.max(0, beat.durationMs ?? 0), 0);
}

function definedCameraOverrides(camera) {
  if (!camera || typeof camera !== "object") {
    return {};
  }
  return Object.fromEntries(Object.entries(camera).filter(([, value]) => value !== undefined));
}

function resolveBeat(beats, loopTimeMs) {
  let cursor = 0;
  for (const beat of beats) {
    const durationMs = Math.max(1, beat.durationMs ?? 1);
    if (loopTimeMs < cursor + durationMs) {
      return { beat, beatTimeMs: loopTimeMs - cursor, durationMs };
    }
    cursor += durationMs;
  }
  const fallback = beats.at(-1);
  return { beat: fallback, beatTimeMs: fallback?.durationMs ?? 0, durationMs: fallback?.durationMs ?? 1 };
}

function resolveRoutePosition(route, timeMs) {
  if (!route.length) {
    return [0, 0, 0];
  }
  if (route.length === 1 || timeMs <= (route[0].arriveMs ?? 0)) {
    return [...route[0].position];
  }

  for (let index = 1; index < route.length; index += 1) {
    const previous = route[index - 1];
    const next = route[index];
    const start = previous.arriveMs ?? 0;
    const end = next.arriveMs ?? start + 1;
    if (timeMs <= end) {
      return lerp3(previous.position, next.position, clamp01((timeMs - start) / Math.max(1, end - start)));
    }
  }

  return [...route.at(-1).position];
}

function resolveRouteForward(route, timeMs) {
  if (route.length < 2) {
    return [0, 0, -1];
  }
  let previous = route[0];
  let next = route[1];
  for (let index = 1; index < route.length; index += 1) {
    next = route[index];
    if (timeMs <= (next.arriveMs ?? 0)) {
      previous = route[index - 1];
      break;
    }
  }
  return normalize3([
    (next.position?.[0] ?? 0) - (previous.position?.[0] ?? 0),
    (next.position?.[1] ?? 0) - (previous.position?.[1] ?? 0),
    (next.position?.[2] ?? 0) - (previous.position?.[2] ?? 0),
  ]);
}

function distance3(a = [0, 0, 0], b = [0, 0, 0]) {
  return Math.hypot(
    (b[0] ?? 0) - (a[0] ?? 0),
    (b[1] ?? 0) - (a[1] ?? 0),
    (b[2] ?? 0) - (a[2] ?? 0),
  );
}

function movementRequirementType(requirement, beat) {
  if (requirement?.type) {
    return requirement.type;
  }
  if (beat?.kind === "locomotion") {
    return beat?.rootMotion === "in-place" ? "stationary" : "travel";
  }
  if (beat?.kind === "action" || beat?.kind === "idle") {
    return "stationary";
  }
  if (/(walk|run|jump|climb|crawl|locomotion)/iu.test(String(beat?.clipId ?? ""))) {
    return String(beat?.clipId ?? "").toLowerCase().includes("jump") ? "jump" : "travel";
  }
  return beat?.pathPointId ? "travel" : "stationary";
}

function movementDistancePerLoop(profile = {}) {
  profile ??= {};
  const rootDistance = Number(profile.rootTranslationDistance ?? profile.rootTranslation?.distance ?? 0);
  if (Number.isFinite(rootDistance) && rootDistance > 0) {
    return rootDistance;
  }
  const strideLength = Number(profile.strideLength ?? profile.strideLengthMeters ?? 0);
  if (Number.isFinite(strideLength) && strideLength > 0) {
    return strideLength;
  }
  return 0;
}

function clipDurationMs(profile = {}, fallbackMs = 1) {
  profile ??= {};
  const duration = Number(profile.durationMs ?? 0);
  return Number.isFinite(duration) && duration > 0 ? duration : Math.max(1, fallbackMs);
}

function profileAllowsDisplacement(profile = {}, movementType) {
  profile ??= {};
  if (movementType === "stationary") {
    return profile.worldDisplacementAllowed !== true;
  }
  return profile.worldDisplacementAllowed === true
    || profile.motionMode === "root-authored"
    || profile.motionMode === "calibrated-in-place"
    || profile.motionMode === "jump";
}

function resolveClipProfiles(clipAssets = []) {
  return new Map(clipAssets.map((clip) => [clip.id, clip.movementProfile ?? clip.profile ?? null]));
}

function buildBeatTimeline(beats, route, clipProfiles) {
  const routePoints = new Map(route.map((point) => [point.id, point]));
  let cursorMs = 0;
  let routeCursor = 0;
  let currentPosition = route[0]?.position ? [...route[0].position] : [0, 0, 0];
  return beats.map((beat) => {
    const requirement = beat.movementRequirement ?? beat.movement ?? null;
    const movementType = movementRequirementType(requirement, beat);
    const movesThroughWorld = movementType === "travel" || movementType === "jump" || movementType === "root-authored";
    const explicitTargetPoint = beat.pathPointId ? routePoints.get(beat.pathPointId) : null;
    const inferredTargetPoint = movesThroughWorld ? route[Math.min(route.length - 1, routeCursor + 1)] : null;
    const targetPoint = explicitTargetPoint ?? inferredTargetPoint ?? null;
    const targetPosition = targetPoint?.position ? [...targetPoint.position] : [...currentPosition];
    const startPosition = [...currentPosition];
    const endPosition = movesThroughWorld ? targetPosition : [...currentPosition];
    const segmentDistance = Number(requirement?.distance ?? distance3(startPosition, endPosition));
    const profile = clipProfiles.get(beat.clipId) ?? null;
    const distancePerLoop = movementDistancePerLoop(profile);
    const loopCount = movesThroughWorld && distancePerLoop > 0
      ? Math.max(1, Math.ceil(segmentDistance / distancePerLoop))
      : 1;
    const derivedDurationMs = movesThroughWorld && distancePerLoop > 0
      ? loopCount * clipDurationMs(profile, beat.durationMs)
      : Math.max(1, beat.durationMs ?? 1);
    const durationMs = Math.max(1, beat.validatedDurationMs ?? requirement?.validatedDurationMs ?? derivedDurationMs);
    const expectedSpeed = Number(profile?.expectedSpeed ?? (durationMs > 0 ? segmentDistance / (durationMs / 1000) : 0));
    const actualSpeed = durationMs > 0 ? segmentDistance / (durationMs / 1000) : 0;
    const warnings = [];

    if (movesThroughWorld && !profileAllowsDisplacement(profile, movementType)) {
      warnings.push(`clip '${beat.clipId}' does not allow ${movementType} displacement`);
    }
    if (movesThroughWorld && distancePerLoop <= 0 && profile?.motionMode !== "root-authored") {
      warnings.push(`clip '${beat.clipId}' has no root or calibrated stride distance`);
    }
    if (movementType === "stationary" && profile?.worldDisplacementAllowed === true) {
      warnings.push(`stationary beat '${beat.id}' uses a displacement-capable clip`);
    }

    const entry = {
      beat,
      startMs: cursorMs,
      endMs: cursorMs + durationMs,
      durationMs,
      startPosition,
      endPosition,
      movementType,
      movementProfile: profile,
      movementDistance: segmentDistance,
      distancePerLoop,
      loopCount,
      expectedSpeed,
      actualSpeed,
      footSlideWarning: Number(profile?.footSlideTolerance ?? 0) < 0 ? "invalid-foot-slide-tolerance" : null,
      warnings,
    };

    cursorMs = entry.endMs;
    currentPosition = [...endPosition];
    if (targetPoint) {
      const nextRouteIndex = route.findIndex((point) => point.id === targetPoint.id);
      if (nextRouteIndex >= 0) {
        routeCursor = nextRouteIndex;
      }
    }
    return entry;
  });
}

function resolveTimelineBeat(timeline, loopTimeMs) {
  if (!timeline.length) {
    return null;
  }
  return timeline.find((entry) => loopTimeMs < entry.endMs) ?? timeline.at(-1);
}

function resolveTimelinePosition(entry, beatTimeMs) {
  if (!entry) {
    return [0, 0, 0];
  }
  if (entry.movementType !== "travel" && entry.movementType !== "jump" && entry.movementType !== "root-authored") {
    return [...entry.startPosition];
  }
  return lerp3(entry.startPosition, entry.endPosition, clamp01(beatTimeMs / Math.max(1, entry.durationMs)));
}

function resolveTimelineForward(entry) {
  if (!entry) {
    return [0, 0, -1];
  }
  return normalize3([
    (entry.endPosition[0] ?? 0) - (entry.startPosition[0] ?? 0),
    (entry.endPosition[1] ?? 0) - (entry.startPosition[1] ?? 0),
    (entry.endPosition[2] ?? 0) - (entry.startPosition[2] ?? 0),
  ]);
}

function resolveCameraViewMode(camera) {
  if (camera?.mode === "lagged-follow") {
    return camera.viewMode ?? "spectator";
  }
  return camera?.viewMode ?? camera?.mode ?? "spectator";
}

function resolveCanvas(canvas) {
  if (typeof canvas === "string") {
    const found = globalThis.document?.querySelector?.(canvas);
    if (!found) {
      throw new Error(`Animated scene canvas '${canvas}' was not found.`);
    }
    return found;
  }
  if (!canvas) {
    throw new Error("Animated scene renderer requires a canvas.");
  }
  return canvas;
}

function project(position, cameraPosition, width, height) {
  const x = position[0] - cameraPosition[0];
  const depth = Math.max(0.2, cameraPosition[2] - (position[2] ?? 0));
  const scale = clamp(34 + 150 / (depth + 1.2), 34, 104);
  const groundY = height * 0.82 - depth * height * 0.045 - (position[1] ?? 0) * scale;
  return {
    x: width * 0.5 + x * scale,
    y: groundY,
    groundY,
    scale,
    depth,
    visible: groundY > -height * 0.2 && groundY < height * 1.18,
  };
}

function propIdentity(prop, index) {
  return prop.id ?? `${prop.kind}-${index}`;
}

function drawGroundShadow(ctx, scale) {
  ctx.fillStyle = "rgba(44, 38, 28, 0.18)";
  ctx.fillRect(-scale * 0.36, -scale * 0.035, scale * 0.72, scale * 0.07);
}

function drawProp(ctx, prop, cameraPosition, width, height) {
  const projected = project(prop.position, cameraPosition, width, height);
  const { x, y, scale } = projected;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(1, scale * 0.04);

  if (prop.kind === "crop-row") {
    ctx.fillStyle = "#8b633f";
    ctx.fillRect(-scale * 1.05, -scale * 0.08, scale * 2.1, scale * 0.16);
    ctx.fillStyle = "#6f4a30";
    ctx.fillRect(-scale * 0.92, -scale * 0.035, scale * 1.84, scale * 0.07);
    ctx.strokeStyle = "#4f6f32";
    ctx.beginPath();
    ctx.moveTo(-scale * 0.8, 0);
    ctx.lineTo(scale * 0.8, 0);
    ctx.stroke();
    ctx.fillStyle = "#6f9f43";
    for (let i = -3; i <= 3; i += 1) {
      ctx.fillRect(i * scale * 0.22, -scale * 0.18, scale * 0.06, scale * 0.2);
    }
  } else if (prop.kind === "fence-segment") {
    ctx.strokeStyle = "#896b4d";
    ctx.beginPath();
    ctx.moveTo(-scale * 0.5, 0);
    ctx.lineTo(scale * 0.5, 0);
    ctx.moveTo(-scale * 0.35, -scale * 0.25);
    ctx.lineTo(-scale * 0.35, scale * 0.1);
    ctx.moveTo(scale * 0.35, -scale * 0.25);
    ctx.lineTo(scale * 0.35, scale * 0.1);
    ctx.stroke();
  } else if (prop.kind === "cart") {
    drawGroundShadow(ctx, scale);
    ctx.fillStyle = "#7b5238";
    ctx.fillRect(-scale * 0.52, -scale * 0.38, scale * 1.04, scale * 0.36);
    ctx.fillStyle = "#a4774c";
    ctx.fillRect(-scale * 0.44, -scale * 0.32, scale * 0.88, scale * 0.08);
    ctx.fillStyle = "#25201c";
    ctx.beginPath();
    ctx.arc(-scale * 0.32, scale * 0.02, scale * 0.1, 0, Math.PI * 2);
    ctx.arc(scale * 0.32, scale * 0.02, scale * 0.1, 0, Math.PI * 2);
    ctx.fill();
  } else if (prop.kind === "small-tree") {
    drawGroundShadow(ctx, scale);
    ctx.fillStyle = "#5b3b24";
    ctx.fillRect(-scale * 0.07, -scale * 0.56, scale * 0.14, scale * 0.56);
    ctx.fillStyle = "#2f6d3b";
    ctx.beginPath();
    ctx.arc(-scale * 0.16, -scale * 0.72, scale * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3f8746";
    ctx.beginPath();
    ctx.arc(scale * 0.13, -scale * 0.76, scale * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4f9a50";
    ctx.beginPath();
    ctx.arc(0, -scale * 0.98, scale * 0.26, 0, Math.PI * 2);
    ctx.fill();
  } else {
    drawGroundShadow(ctx, scale);
    ctx.fillStyle = prop.kind === "crate" ? "#9a6a3d" : "#d0c39f";
    ctx.fillRect(-scale * 0.2, -scale * 0.32, scale * 0.4, scale * 0.32);
    if (prop.kind === "crate") {
      ctx.strokeStyle = "#6e4829";
      ctx.beginPath();
      ctx.moveTo(-scale * 0.2, -scale * 0.16);
      ctx.lineTo(scale * 0.2, -scale * 0.16);
      ctx.moveTo(0, -scale * 0.32);
      ctx.lineTo(0, 0);
      ctx.stroke();
    }
  }

  ctx.restore();
  return projected;
}

function drawCharacter(ctx, characterPosition, cameraPosition, width, height, gaitPhase, headLook) {
  const projected = project(characterPosition, cameraPosition, width, height);
  const { x, y, scale } = projected;
  const stride = Math.sin(gaitPhase * Math.PI * 2);
  const headYaw = (headLook?.yaw ?? 0) * (headLook?.weight ?? 0);
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(2, scale * 0.05);
  ctx.lineCap = "round";

  drawGroundShadow(ctx, scale);

  ctx.strokeStyle = "#4c2f25";
  ctx.beginPath();
  ctx.moveTo(-scale * 0.12, -scale * 0.34);
  ctx.lineTo(-scale * (0.18 + stride * 0.04), -scale * 0.02);
  ctx.moveTo(scale * 0.12, -scale * 0.34);
  ctx.lineTo(scale * (0.18 - stride * 0.04), -scale * 0.02);
  ctx.stroke();

  ctx.fillStyle = "#6f8f62";
  ctx.beginPath();
  ctx.moveTo(-scale * 0.3, -scale * 0.86);
  ctx.lineTo(scale * 0.3, -scale * 0.86);
  ctx.lineTo(scale * 0.42, -scale * 0.24);
  ctx.lineTo(-scale * 0.42, -scale * 0.24);
  ctx.lineTo(-scale * 0.3, -scale * 0.86);
  ctx.fill();

  ctx.fillStyle = "#d8b18c";
  ctx.beginPath();
  ctx.arc(0, -scale * 1.16, scale * 0.18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#5a3a2b";
  ctx.fillRect(-scale * 0.2, -scale * 1.28, scale * 0.4, scale * 0.16);
  ctx.fillRect(-scale * 0.23, -scale * 1.14, scale * 0.1, scale * 0.28);
  ctx.fillRect(scale * 0.13, -scale * 1.14, scale * 0.1, scale * 0.28);
  if (headLook?.status === "active" || headLook?.status === "returning") {
    ctx.strokeStyle = "rgba(255, 246, 210, 0.74)";
    ctx.lineWidth = Math.max(1, scale * 0.025);
    ctx.beginPath();
    ctx.moveTo(0, -scale * 1.16);
    ctx.lineTo(Math.sin(headYaw) * scale * 0.32, -scale * 1.16 - scale * 0.08);
    ctx.stroke();
  }

  ctx.strokeStyle = "#6b4935";
  ctx.beginPath();
  ctx.moveTo(-scale * 0.24, -scale * 0.76);
  ctx.lineTo(-scale * (0.46 + stride * 0.04), -scale * (0.5 + stride * 0.06));
  ctx.moveTo(scale * 0.24, -scale * 0.76);
  ctx.lineTo(scale * (0.46 - stride * 0.04), -scale * (0.5 - stride * 0.06));
  ctx.stroke();

  ctx.fillStyle = "#d6c09a";
  ctx.fillRect(-scale * 0.16, -scale * 0.86, scale * 0.32, scale * 0.18);
  ctx.restore();
  return projected;
}

function pointForModelVertex(vertex, projection, sample) {
  const bounds = sample.bounds;
  const height = Math.max(0.1, bounds.size[1] || sample.bindBounds.size[1] || 1);
  const modelScale = projection.scale * 1.3 / height;
  const centerX = (bounds.min[0] + bounds.max[0]) * 0.5;
  const centerZ = (bounds.min[2] + bounds.max[2]) * 0.5;
  return [
    projection.x + (vertex[0] - centerX) * modelScale,
    projection.groundY - (vertex[1] - bounds.min[1]) * modelScale + (vertex[2] - centerZ) * modelScale * 0.16,
  ];
}

function modelFillForHeight(vertex, sample) {
  const height = Math.max(0.1, sample.bounds.size[1] || 1);
  const t = (vertex[1] - sample.bounds.min[1]) / height;
  if (t > 0.82) {
    return "#6d4a36";
  }
  if (t > 0.58) {
    return "#d7b28f";
  }
  if (t > 0.25) {
    return "#6f8f62";
  }
  return "#5e4636";
}

function drawSkinnedGltfCharacter(ctx, model, snapshot, width, height) {
  const projection = project(snapshot.characterPosition, snapshot.cameraPosition, width, height);
  const sample = model.sample(snapshot.activeClipId, snapshot.clipTimeMs);
  const maxTriangles = 12000;
  const triangleCount = Math.floor(sample.indices.length / 3);
  const stride = Math.max(1, Math.ceil(triangleCount / maxTriangles));
  const triangles = [];
  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += stride) {
    const base = triangleIndex * 3;
    const a = sample.vertices[sample.indices[base]];
    const b = sample.vertices[sample.indices[base + 1]];
    const c = sample.vertices[sample.indices[base + 2]];
    if (!a || !b || !c) {
      continue;
    }
    triangles.push({
      a,
      b,
      c,
      depth: (a[2] + b[2] + c[2]) / 3,
      fill: modelFillForHeight(a, sample),
    });
  }
  triangles.sort((left, right) => left.depth - right.depth);

  ctx.save();
  drawGroundShadow(ctx, projection.scale);
  for (const triangle of triangles) {
    const [ax, ay] = pointForModelVertex(triangle.a, projection, sample);
    const [bx, by] = pointForModelVertex(triangle.b, projection, sample);
    const [cx, cy] = pointForModelVertex(triangle.c, projection, sample);
    ctx.fillStyle = triangle.fill;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(cx, cy);
    ctx.closePath?.();
    ctx.fill();
  }
  ctx.restore();

  return {
    projection,
    sample,
  };
}

function renderScene(canvas, ctx, snapshot, props, characterModel) {
  const width = canvas.width || 1;
  const height = canvas.height || 1;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#d8e8d0";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#9fc47a";
  ctx.fillRect(0, height * 0.52, width, height * 0.48);
  ctx.strokeStyle = "#caa66d";
  ctx.lineWidth = Math.max(2, width * 0.006);
  ctx.beginPath();
  ctx.moveTo(width * 0.35, height);
  ctx.quadraticCurveTo(width * 0.53, height * 0.58, width * 0.62, 0);
  ctx.stroke();

  const projectedProps = props
    .map((prop, index) => ({
      prop,
      id: propIdentity(prop, index),
      projected: project(prop.position, snapshot.cameraPosition, width, height),
    }))
    .sort((a, b) => b.projected.depth - a.projected.depth);

  const propGroundAnchors = [];
  for (const { prop, id } of projectedProps) {
    const projected = drawProp(ctx, prop, snapshot.cameraPosition, width, height);
    propGroundAnchors.push({
      id,
      kind: prop.kind,
      groundY: projected.groundY,
      depth: projected.depth,
      visible: projected.visible,
    });
  }
  let characterProjection;
  let modelRenderable = false;
  let fallbackProxyActive = true;
  let skinnedVertexCount = 0;
  let skinnedTriangleCount = 0;
  let skinnedJointCount = 0;
  let skinnedAnimatedNodeCount = 0;
  let skinnedClipCount = 0;
  let activeClipRenderable = false;

  if (characterModel) {
    const drawn = drawSkinnedGltfCharacter(ctx, characterModel, snapshot, width, height);
    characterProjection = drawn.projection;
    modelRenderable = true;
    fallbackProxyActive = false;
    skinnedVertexCount = characterModel.vertexCount;
    skinnedTriangleCount = characterModel.triangleCount;
    skinnedJointCount = characterModel.jointCount;
    skinnedAnimatedNodeCount = characterModel.animatedNodeCount;
    skinnedClipCount = characterModel.clipCount;
    activeClipRenderable = drawn.sample.activeClipRenderable;
  } else {
    characterProjection = drawCharacter(
      ctx,
      snapshot.characterPosition,
      snapshot.cameraPosition,
      width,
      height,
      snapshot.clipTimeMs / 900,
      snapshot.headLook,
    );
  }

  return {
    characterGroundY: characterProjection.groundY,
    characterVisible: characterProjection.visible,
    modelLoaded: Boolean(characterModel),
    modelRenderable,
    fallbackProxyActive,
    skinnedVertexCount,
    skinnedTriangleCount,
    skinnedJointCount,
    skinnedAnimatedNodeCount,
    skinnedClipCount,
    activeClipRenderable,
    propGroundAnchors,
  };
}

function resolveCharacterModel(options) {
  try {
    return createAnimatedGltfModel(
      options.modelAsset ?? options.animationAdventure?.modelAsset,
      options.clipAssets ?? options.animationAdventure?.clipAssets ?? [],
    );
  } catch {
    return null;
  }
}

export function createAnimatedSceneRenderer(options = {}) {
  const canvas = resolveCanvas(options.canvas);
  const ctx = canvas.getContext?.("2d");
  if (!ctx) {
    throw new Error("Animated scene renderer requires a 2D canvas context.");
  }

  const route = [...(options.route ?? options.animationAdventure?.route ?? [])];
  const beats = [...(options.beats ?? options.animationAdventure?.beats ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const props = [...(options.props ?? options.animationAdventure?.props ?? [])];
  const clipAssets = options.clipAssets ?? options.animationAdventure?.clipAssets ?? [];
  const clipProfiles = resolveClipProfiles(clipAssets);
  const beatTimeline = buildBeatTimeline(beats, route, clipProfiles);
  const characterModel = resolveCharacterModel(options);
  let camera = {
    ...DEFAULT_CAMERA,
    ...definedCameraOverrides(options.camera ?? options.animationAdventure?.camera),
  };
  const loopDurationMs = Math.max(beatTimeline.at(-1)?.endMs ?? durationFromBeats(beats), 1);
  const movementWarnings = beatTimeline.flatMap((entry) => entry.warnings);
  const requestFrame = options.requestAnimationFrame ?? globalThis.requestAnimationFrame?.bind(globalThis);
  const cancelFrame = options.cancelAnimationFrame ?? globalThis.cancelAnimationFrame?.bind(globalThis);
  let frameHandle;
  let running = false;
  let frame = 0;
  let startedAtMs;
  let lastTimestamp;
  let pendingCameraControl = null;
  let activeCameraControl = false;
  let headLookWeight = 0;
  let cameraPosition = route[0]
    ? [
        route[0].position[0] + (camera.offset?.[0] ?? 0),
        route[0].position[1] + (camera.offset?.[1] ?? 0),
        route[0].position[2] + (camera.offset?.[2] ?? 0),
      ]
    : [0, 2.4, 5.5];
  let cameraRigFrame = resolveCameraRigFrame({
    viewMode: "editor",
    anchors: {
      target: route[0]?.position ? [...route[0].position] : [0, 0, 0],
      head: route[0]?.position ? [route[0].position[0], route[0].position[1] + 1.65, route[0].position[2]] : [0, 1.65, 0],
      forward: [0, 0, -1],
    },
    camera: {
      id: "animation-adventure",
      transform: {
        position: [...cameraPosition],
        target: route[0]?.position ? [...route[0].position] : [0, 0, 0],
      },
    },
    constraints: camera.constraints,
  });
  let snapshot = {
    frame,
    running,
    activeClipId: beats[0]?.clipId ?? "",
    activeBeatId: beats[0]?.id ?? "",
    activeMovementMode: beatTimeline[0]?.movementType ?? "stationary",
    blendProgress: 0,
    clipTimeMs: 0,
    characterPosition: route[0]?.position ? [...route[0].position] : [0, 0, 0],
    cameraPosition: [...cameraPosition],
    cameraViewMode: resolveCameraViewMode(camera),
    cameraTransform: cameraRigFrame.transform,
    targetDistance: cameraRigFrame.targetDistance,
    headLook: cameraRigFrame.headLook,
    characterGroundY: 0,
    characterVisible: false,
    modelLoaded: Boolean(characterModel),
    modelRenderable: false,
    fallbackProxyActive: true,
    skinnedVertexCount: characterModel?.vertexCount ?? 0,
    skinnedTriangleCount: characterModel?.triangleCount ?? 0,
    skinnedJointCount: characterModel?.jointCount ?? 0,
    skinnedAnimatedNodeCount: characterModel?.animatedNodeCount ?? 0,
    skinnedClipCount: characterModel?.clipCount ?? 0,
    activeClipRenderable: false,
    propGroundAnchors: [],
    movementValidation: {
      status: movementWarnings.length ? "warning" : "passed",
      warnings: movementWarnings,
      activeBeatId: beats[0]?.id ?? "",
      activeClipId: beats[0]?.clipId ?? "",
      motionMode: beatTimeline[0]?.movementType ?? "stationary",
      rootMotionSource: beatTimeline[0]?.movementProfile?.motionMode ?? "none",
      expectedSpeed: beatTimeline[0]?.expectedSpeed ?? 0,
      actualSpeed: beatTimeline[0]?.actualSpeed ?? 0,
      movementDistance: beatTimeline[0]?.movementDistance ?? 0,
      loopCount: beatTimeline[0]?.loopCount ?? 1,
      footSlideWarning: beatTimeline[0]?.footSlideWarning ?? null,
    },
    frameState: "initialized",
  };

  function renderOnce(timestamp = nowMs()) {
    if (startedAtMs === undefined) {
      startedAtMs = timestamp;
    }
    const elapsedMs = Math.max(0, timestamp - startedAtMs);
    const loopTimeMs = elapsedMs % loopDurationMs;
    const frameTimeMs = lastTimestamp === undefined ? 16.67 : Math.max(0, timestamp - lastTimestamp);
    lastTimestamp = timestamp;
    frame += 1;

    const timelineEntry = resolveTimelineBeat(beatTimeline, loopTimeMs);
    const beat = timelineEntry?.beat ?? resolveBeat(beats, loopTimeMs).beat;
    const beatTimeMs = timelineEntry ? loopTimeMs - timelineEntry.startMs : resolveBeat(beats, loopTimeMs).beatTimeMs;
    const durationMs = timelineEntry?.durationMs ?? resolveBeat(beats, loopTimeMs).durationMs;
    const blend = beat?.blend ?? { inMs: 0, outMs: 0 };
    const blendIn = blend.inMs > 0 ? clamp01(beatTimeMs / blend.inMs) : 1;
    const blendOut = blend.outMs > 0 ? clamp01((durationMs - beatTimeMs) / blend.outMs) : 1;
    const blendProgress = clamp01(Math.min(blendIn, blendOut));
    const characterPosition = resolveTimelinePosition(timelineEntry, beatTimeMs);
    const characterForward = resolveTimelineForward(timelineEntry);
    const headAnchor =
      camera.headBoneAvailable === false
        ? undefined
        : [
            characterPosition[0],
            characterPosition[1] + (camera.headHeight ?? 1.65),
            characterPosition[2],
          ];
    const lookAheadEntry = resolveTimelineBeat(beatTimeline, (loopTimeMs + camera.lookAheadMs) % loopDurationMs);
    const lookAheadPosition = resolveTimelinePosition(
      lookAheadEntry,
      lookAheadEntry ? ((loopTimeMs + camera.lookAheadMs) % loopDurationMs) - lookAheadEntry.startMs : beatTimeMs,
    );
    const desiredCamera = [
      lookAheadPosition[0] + (camera.offset?.[0] ?? 0),
      lookAheadPosition[1] + (camera.offset?.[1] ?? 0),
      lookAheadPosition[2] + (camera.offset?.[2] ?? 0),
    ];
    const smoothing = bezierY(camera.cubicBezier, clamp01(frameTimeMs / Math.max(1, camera.lagMs)));
    cameraPosition = lerp3(cameraPosition, desiredCamera, smoothing);
    const cameraViewMode = resolveCameraViewMode(camera);
    const rigViewMode = cameraViewMode === "spectator" ? "editor" : cameraViewMode;
    cameraRigFrame = resolveCameraRigFrame({
      viewMode: rigViewMode,
      anchors: {
        target: characterPosition,
        ...(headAnchor ? { head: headAnchor } : {}),
        forward: characterForward,
      },
      camera: {
        id: "animation-adventure",
        transform: {
          position: [...cameraPosition],
          target: lookAheadPosition,
        },
      },
      constraints: camera.constraints,
      control: pendingCameraControl,
      activeControl: activeCameraControl,
    });

    if (activeCameraControl && cameraRigFrame.headLook.status === "active") {
      headLookWeight = cameraRigFrame.headLook.weight;
    } else {
      const returnMs = Math.max(1, camera.headLook?.returnMs ?? DEFAULT_CAMERA.headLook.returnMs);
      headLookWeight = lerp(headLookWeight, 0, clamp01(frameTimeMs / returnMs));
    }
    const headLook = {
      ...cameraRigFrame.headLook,
      status:
        cameraRigFrame.headLook.status === "unavailable"
          ? "unavailable"
          : headLookWeight > 0.001 && !activeCameraControl
            ? "returning"
            : cameraRigFrame.headLook.status,
      weight: headLookWeight,
    };
    cameraPosition = [...cameraRigFrame.transform.position];
    pendingCameraControl = null;
    activeCameraControl = false;

    snapshot = {
      frame,
      running,
      activeClipId: beat?.clipId ?? "",
      activeBeatId: beat?.id ?? "",
      activeMovementMode: timelineEntry?.movementType ?? "stationary",
      blendProgress,
      clipTimeMs: beatTimeMs,
      characterPosition,
      cameraPosition: [...cameraPosition],
      cameraViewMode,
      cameraTransform: cameraRigFrame.transform,
      targetDistance: cameraRigFrame.targetDistance,
      headLook,
      characterGroundY: 0,
      characterVisible: false,
      modelLoaded: Boolean(characterModel),
      modelRenderable: false,
      fallbackProxyActive: true,
      skinnedVertexCount: characterModel?.vertexCount ?? 0,
      skinnedTriangleCount: characterModel?.triangleCount ?? 0,
      skinnedJointCount: characterModel?.jointCount ?? 0,
      skinnedAnimatedNodeCount: characterModel?.animatedNodeCount ?? 0,
      skinnedClipCount: characterModel?.clipCount ?? 0,
      activeClipRenderable: false,
      propGroundAnchors: [],
      movementValidation: {
        status: movementWarnings.length ? "warning" : "passed",
        warnings: [...movementWarnings],
        activeBeatId: beat?.id ?? "",
        activeClipId: beat?.clipId ?? "",
        motionMode: timelineEntry?.movementType ?? "stationary",
        rootMotionSource: timelineEntry?.movementProfile?.motionMode ?? "none",
        expectedSpeed: timelineEntry?.expectedSpeed ?? 0,
        actualSpeed: timelineEntry?.actualSpeed ?? 0,
        movementDistance: timelineEntry?.movementDistance ?? 0,
        loopCount: timelineEntry?.loopCount ?? 1,
        footSlideWarning: timelineEntry?.footSlideWarning ?? null,
      },
      frameState: running ? "running" : "rendered-once",
    };

    const visibility = renderScene(canvas, ctx, snapshot, props, characterModel);
    snapshot = {
      ...snapshot,
      ...visibility,
    };
    return snapshot;
  }

  function tick(timestamp) {
    if (!running) {
      return;
    }
    renderOnce(timestamp);
    if (running && requestFrame) {
      frameHandle = requestFrame(tick);
    }
  }

  return {
    start() {
      if (running) {
        return;
      }
      running = true;
      snapshot = { ...snapshot, running: true, frameState: "running" };
      if (requestFrame) {
        frameHandle = requestFrame(tick);
      } else {
        renderOnce();
      }
    },
    resize(width, height, devicePixelRatio = 1) {
      const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      if (canvas.style) {
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      const visibility = renderScene(canvas, ctx, snapshot, props, characterModel);
      snapshot = {
        ...snapshot,
        ...visibility,
      };
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
        headLook: {
          ...snapshot.headLook,
          target: [...snapshot.headLook.target],
        },
        movementValidation: {
          ...snapshot.movementValidation,
          warnings: [...(snapshot.movementValidation?.warnings ?? [])],
        },
        propGroundAnchors: snapshot.propGroundAnchors.map((anchor) => ({ ...anchor })),
      };
    },
    setCamera(nextCamera = {}) {
      camera = { ...camera, ...nextCamera };
      snapshot = {
        ...snapshot,
        cameraViewMode: resolveCameraViewMode(camera),
      };
    },
    setCameraViewMode(viewMode) {
      camera = { ...camera, viewMode };
      snapshot = {
        ...snapshot,
        cameraViewMode: resolveCameraViewMode(camera),
      };
    },
    applyCameraControl(control, options = {}) {
      pendingCameraControl = control;
      activeCameraControl = options.activeControl !== false;
    },
    destroy() {
      running = false;
      if (frameHandle !== undefined && cancelFrame) {
        cancelFrame(frameHandle);
      }
      frameHandle = undefined;
      snapshot = { ...snapshot, running: false, frameState: "destroyed" };
    },
  };
}
