import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

import {
  bucketFeedbackGameFrameRate,
  bucketFeedbackGameFrameTime,
  bucketFeedbackGameViewport,
  createFeedbackGameDiagnosticSnapshot,
} from "../src/index.js";
import {
  FEEDBACK_GAME_DIAGNOSTICS_CONTRACT_VERSION,
} from "@plasius/gpu-shared/feedback-diagnostics";

const VALID_INPUT = Object.freeze({
  featureEnabled: true,
  capabilityGranted: true,
  consentConfirmed: true,
  surfaceId: "site.gpu-demo",
  renderer: "webgpu",
  backend: "worker",
  viewportWidth: 1_920,
  viewportHeight: 1_080,
  frameRate: 59.94,
  frameTimeMs: 16.67,
  featureIds: Object.freeze([
    "renderer.initialisation",
    "renderer.frame-loop",
  ]),
  counters: Object.freeze([
    Object.freeze({ code: "frame-drop", count: 3 }),
  ]),
  errorCodes: Object.freeze([
    "renderer.frame-budget-exceeded",
  ]),
});

test("bucket helpers emit only the canonical coarse values", () => {
  assert.equal(bucketFeedbackGameViewport(390, 844), "small-portrait");
  assert.equal(bucketFeedbackGameViewport(844, 390), "small-landscape");
  assert.equal(bucketFeedbackGameViewport(820, 1180), "medium-portrait");
  assert.equal(bucketFeedbackGameViewport(1180, 820), "medium-landscape");
  assert.equal(bucketFeedbackGameViewport(1440, 900), "large-landscape");
  assert.equal(bucketFeedbackGameViewport(900, 1440), "large-portrait");
  assert.equal(bucketFeedbackGameViewport(0, 1080), "unknown");
  assert.equal(bucketFeedbackGameViewport(Number.NaN, 1080), "unknown");

  assert.equal(bucketFeedbackGameFrameRate(0), "under-15");
  assert.equal(bucketFeedbackGameFrameRate(14.999), "under-15");
  assert.equal(bucketFeedbackGameFrameRate(15), "15-29");
  assert.equal(bucketFeedbackGameFrameRate(29.999), "15-29");
  assert.equal(bucketFeedbackGameFrameRate(30), "30-59");
  assert.equal(bucketFeedbackGameFrameRate(59.999), "30-59");
  assert.equal(bucketFeedbackGameFrameRate(60), "60-plus");
  assert.equal(bucketFeedbackGameFrameRate(-1), "unknown");
  assert.equal(bucketFeedbackGameFrameRate("60"), "unknown");

  assert.equal(bucketFeedbackGameFrameTime(0), "under-17ms");
  assert.equal(bucketFeedbackGameFrameTime(16.999), "under-17ms");
  assert.equal(bucketFeedbackGameFrameTime(17), "17-33ms");
  assert.equal(bucketFeedbackGameFrameTime(33.999), "17-33ms");
  assert.equal(bucketFeedbackGameFrameTime(34), "34-66ms");
  assert.equal(bucketFeedbackGameFrameTime(66.999), "34-66ms");
  assert.equal(bucketFeedbackGameFrameTime(67), "over-66ms");
  assert.equal(bucketFeedbackGameFrameTime(Number.POSITIVE_INFINITY), "unknown");
  assert.equal(bucketFeedbackGameFrameTime(null), "unknown");
});

test("snapshot derives trusted provenance and discards exact measurements", () => {
  const snapshot = createFeedbackGameDiagnosticSnapshot(VALID_INPUT);

  assert.deepEqual(snapshot, {
    type: "feedback-game-diagnostics",
    version: FEEDBACK_GAME_DIAGNOSTICS_CONTRACT_VERSION,
    surfaceId: "site.gpu-demo",
    consentConfirmed: true,
    provenanceContractId: "gpu-demo.renderer-diagnostics.v1",
    renderer: "webgpu",
    backend: "worker",
    viewportBucket: "large-landscape",
    frameRateBucket: "30-59",
    frameTimeBucket: "under-17ms",
    featureIds: [
      "renderer.initialisation",
      "renderer.frame-loop",
    ],
    counters: [{ code: "frame-drop", count: 3 }],
    errorCodes: ["renderer.frame-budget-exceeded"],
  });
  assert.equal(Object.isFrozen(snapshot), true);

  const encoded = JSON.stringify(snapshot);
  assert.doesNotMatch(encoded, /1920|1080|59\.94|16\.67/u);
  assert.doesNotMatch(
    encoded,
    /pixel|image|canvas|dom|identity|url|filename|coordinate|adapter|warning|text/iu
  );
});

test("snapshot supports only the registered generator and GPU demo surfaces", () => {
  const generator = createFeedbackGameDiagnosticSnapshot({
    ...VALID_INPUT,
    surfaceId: "site.generator",
    renderer: "canvas2d",
    backend: "browser",
  });

  assert.equal(generator?.surfaceId, "site.generator");
  assert.equal(
    generator?.provenanceContractId,
    "generator.renderer-diagnostics.v1"
  );

  for (const surfaceId of ["game.player-system", "site.admin", "__proto__"]) {
    assert.throws(
      () =>
        createFeedbackGameDiagnosticSnapshot({
          ...VALID_INPUT,
          surfaceId,
        }),
      /Invalid privacy-safe renderer diagnostics input\./u
    );
  }
});

test("disabled, unauthorized or unconsented calls omit diagnostics before reading metrics", () => {
  for (const gate of [
    { featureEnabled: false },
    { capabilityGranted: false },
    { consentConfirmed: false },
  ]) {
    const input = { ...VALID_INPUT, ...gate };
    for (const key of [
      "viewportWidth",
      "viewportHeight",
      "frameRate",
      "frameTimeMs",
      "featureIds",
      "counters",
      "errorCodes",
    ]) {
      Object.defineProperty(input, key, {
        configurable: true,
        enumerable: true,
        get() {
          throw new Error(`unsafe read: ${key}`);
        },
      });
    }

    assert.equal(createFeedbackGameDiagnosticSnapshot(input), null);
  }

  const observedKeys = [];
  const disabledProxy = new Proxy(
    { ...VALID_INPUT, featureEnabled: false },
    {
      getOwnPropertyDescriptor(target, key) {
        observedKeys.push(key);
        if (
          [
            "viewportWidth",
            "viewportHeight",
            "frameRate",
            "frameTimeMs",
            "featureIds",
            "counters",
            "errorCodes",
          ].includes(key)
        ) {
          throw new Error(`unsafe metric descriptor: ${String(key)}`);
        }
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
      ownKeys() {
        throw new Error("disabled diagnostics must not enumerate evidence");
      },
    }
  );

  assert.equal(createFeedbackGameDiagnosticSnapshot(disabledProxy), null);
  assert.deepEqual(observedKeys, [
    "featureEnabled",
    "capabilityGranted",
    "consentConfirmed",
  ]);
});

test("enabled snapshot rejects unknown fields, arbitrary strings and raw warnings", () => {
  const invalidInputs = [
    { ...VALID_INPUT, screenshot: "data:image/png;base64,secret" },
    { ...VALID_INPUT, dom: "<div>player name</div>" },
    { ...VALID_INPUT, adapter: "Exact graphics adapter" },
    { ...VALID_INPUT, renderer: "webgpu-exact-device" },
    { ...VALID_INPUT, backend: "user-worker-id" },
    { ...VALID_INPUT, featureIds: ["renderer.user-name"] },
    { ...VALID_INPUT, counters: [{ code: "raw-warning", count: 1 }] },
    { ...VALID_INPUT, errorCodes: ["user@example.test"] },
  ];

  for (const input of invalidInputs) {
    assert.throws(
      () => createFeedbackGameDiagnosticSnapshot(input),
      /Invalid privacy-safe/u
    );
  }
});

test("enabled snapshot rejects accessors and masks proxy failures", () => {
  const accessorInput = { ...VALID_INPUT };
  Object.defineProperty(accessorInput, "renderer", {
    enumerable: true,
    get() {
      return "synthetic-person@example.test";
    },
  });
  assert.throws(
    () => createFeedbackGameDiagnosticSnapshot(accessorInput),
    (error) =>
      error instanceof TypeError &&
      error.message === "Invalid privacy-safe renderer diagnostics input." &&
      error.cause === undefined
  );

  const proxyInput = new Proxy(
    { ...VALID_INPUT },
    {
      ownKeys() {
        throw new Error("synthetic-person@example.test");
      },
    }
  );
  assert.throws(
    () => createFeedbackGameDiagnosticSnapshot(proxyInput),
    (error) =>
      error instanceof TypeError &&
      error.message === "Invalid privacy-safe renderer diagnostics input." &&
      error.cause === undefined
  );

  const inheritedInput = Object.create({ screenshot: "secret" });
  Object.assign(inheritedInput, VALID_INPUT);
  const symbolInput = { ...VALID_INPUT };
  symbolInput[Symbol("pixel-evidence")] = new Uint8Array([1]);
  const hiddenInput = { ...VALID_INPUT };
  Object.defineProperty(hiddenInput, "hiddenEvidence", {
    enumerable: false,
    value: "secret",
  });

  for (const input of [inheritedInput, symbolInput, hiddenInput]) {
    assert.throws(
      () => createFeedbackGameDiagnosticSnapshot(input),
      (error) =>
        error instanceof TypeError &&
        error.message === "Invalid privacy-safe renderer diagnostics input." &&
        error.cause === undefined
    );
  }
});

test("diagnostics module has no capture, transport, storage or logging primitive", () => {
  const source = readFileSync(
    new URL("../src/feedback-diagnostics.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(
    source,
    /\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|console)\b/u
  );
  assert.doesNotMatch(
    source,
    /\b(?:HTMLCanvasElement|OffscreenCanvas|ImageData|MediaStream|getImageData|toDataURL|toBlob)\b/u
  );

  const otherSource = readdirSync(new URL("../src/", import.meta.url))
    .filter(
      (fileName) =>
        fileName.endsWith(".js") &&
        !["feedback-diagnostics.js", "index.js"].includes(fileName)
    )
    .map((fileName) =>
      readFileSync(new URL(`../src/${fileName}`, import.meta.url), "utf8")
    )
    .join("\n");
  assert.doesNotMatch(otherSource, /createFeedbackGameDiagnosticSnapshot/u);
});
