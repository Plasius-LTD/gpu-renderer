import {
  FEEDBACK_GAME_DIAGNOSTICS_CONTRACT_VERSION,
  feedbackGameDiagnosticSurfaceRegistrations,
  parseFeedbackGameDiagnostics,
} from "@plasius/gpu-shared/feedback-diagnostics";

const inputKeys = Object.freeze([
  "featureEnabled",
  "capabilityGranted",
  "consentConfirmed",
  "surfaceId",
  "renderer",
  "backend",
  "viewportWidth",
  "viewportHeight",
  "frameRate",
  "frameTimeMs",
  "featureIds",
  "counters",
  "errorCodes",
]);

export function bucketFeedbackGameViewport(width, height) {
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return "unknown";
  }

  const shorterEdge = Math.min(width, height);
  const longerEdge = Math.max(width, height);
  const size =
    shorterEdge < 600
      ? "small"
      : shorterEdge < 900 || longerEdge < 1_440
        ? "medium"
        : "large";
  const orientation = width > height ? "landscape" : "portrait";
  return `${size}-${orientation}`;
}

export function bucketFeedbackGameFrameRate(frameRate) {
  if (
    typeof frameRate !== "number" ||
    !Number.isFinite(frameRate) ||
    frameRate < 0
  ) {
    return "unknown";
  }
  if (frameRate < 15) {
    return "under-15";
  }
  if (frameRate < 30) {
    return "15-29";
  }
  if (frameRate < 60) {
    return "30-59";
  }
  return "60-plus";
}

export function bucketFeedbackGameFrameTime(frameTimeMs) {
  if (
    typeof frameTimeMs !== "number" ||
    !Number.isFinite(frameTimeMs) ||
    frameTimeMs < 0
  ) {
    return "unknown";
  }
  if (frameTimeMs < 17) {
    return "under-17ms";
  }
  if (frameTimeMs < 34) {
    return "17-33ms";
  }
  if (frameTimeMs < 67) {
    return "34-66ms";
  }
  return "over-66ms";
}

export function createFeedbackGameDiagnosticSnapshot(input) {
  try {
    return createFeedbackGameDiagnosticSnapshotInternal(input);
  } catch {
    throw new TypeError("Invalid privacy-safe renderer diagnostics input.");
  }
}

function createFeedbackGameDiagnosticSnapshotInternal(input) {
  const snapshot = snapshotInputIfEnabled(input);
  if (snapshot === null) {
    return null;
  }

  const registration =
    typeof snapshot.surfaceId === "string" &&
    Object.hasOwn(
      feedbackGameDiagnosticSurfaceRegistrations,
      snapshot.surfaceId
    )
      ? feedbackGameDiagnosticSurfaceRegistrations[snapshot.surfaceId]
      : undefined;

  return parseFeedbackGameDiagnostics({
    type: "feedback-game-diagnostics",
    version: FEEDBACK_GAME_DIAGNOSTICS_CONTRACT_VERSION,
    surfaceId: snapshot.surfaceId,
    consentConfirmed: true,
    provenanceContractId: registration?.provenanceContractId,
    renderer: snapshot.renderer,
    backend: snapshot.backend,
    viewportBucket: bucketFeedbackGameViewport(
      snapshot.viewportWidth,
      snapshot.viewportHeight
    ),
    frameRateBucket: bucketFeedbackGameFrameRate(snapshot.frameRate),
    frameTimeBucket: bucketFeedbackGameFrameTime(snapshot.frameTimeMs),
    featureIds: snapshot.featureIds,
    counters: snapshot.counters,
    errorCodes: snapshot.errorCodes,
  });
}

function snapshotInputIfEnabled(input) {
  assertValid(
    input !== null &&
      typeof input === "object" &&
      !Array.isArray(input) &&
      (Object.getPrototypeOf(input) === Object.prototype ||
        Object.getPrototypeOf(input) === null)
  );

  const gateKeys = [
    "featureEnabled",
    "capabilityGranted",
    "consentConfirmed",
  ];
  const snapshot = Object.create(null);
  for (const key of gateKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    assertValid(
      descriptor !== undefined &&
        descriptor.enumerable === true &&
        Object.hasOwn(descriptor, "value") &&
        typeof descriptor.value === "boolean"
    );
    snapshot[key] = descriptor.value;
  }

  const { featureEnabled, capabilityGranted, consentConfirmed } = snapshot;
  if (
    !featureEnabled ||
    !capabilityGranted ||
    !consentConfirmed
  ) {
    return null;
  }

  const actualKeys = Reflect.ownKeys(input);
  assertValid(
    actualKeys.length === inputKeys.length &&
      inputKeys.every((key) => actualKeys.includes(key)) &&
      actualKeys.every(
        (key) => typeof key === "string" && inputKeys.includes(key)
      )
  );

  for (const key of inputKeys.filter((key) => !gateKeys.includes(key))) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    assertValid(
      descriptor !== undefined &&
        descriptor.enumerable === true &&
        Object.hasOwn(descriptor, "value")
    );
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot);
}

function assertValid(condition) {
  if (!condition) {
    throw new TypeError("Invalid privacy-safe renderer diagnostics input.");
  }
}
