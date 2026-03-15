import assert from "node:assert/strict";
import test from "node:test";
import {
  createRayTracingRenderPlan,
  getRendererWorkerManifest,
  rendererAccelerationStructureUpdateClasses,
  rendererRayTracingStageOrder,
  rendererRepresentationBands,
} from "../src/index.js";

test("ray-tracing-first render plans consume a stable visual snapshot boundary", () => {
  const plan = createRayTracingRenderPlan({
    snapshotId: "visual-snapshot-9001",
  });

  assert.deepEqual(plan.inputBoundary, {
    type: "stable-visual-snapshot",
    owner: "renderer",
    profile: "realtime",
    authority: "visual",
    source: "scene-preparation",
    stable: true,
    snapshotId: "visual-snapshot-9001",
  });
  assert.equal(plan.workerManifest.inputBoundary.stable, true);
});

test("ray-tracing-first render plans publish explicit stage ordering and representation bands", () => {
  const plan = createRayTracingRenderPlan({
    snapshotId: "visual-snapshot-9002",
  });

  assert.deepEqual(
    plan.renderStages.map((stage) => stage.key),
    [...rendererRayTracingStageOrder]
  );
  assert.deepEqual(rendererRepresentationBands, [
    "near",
    "mid",
    "far",
    "horizon",
  ]);
  assert.deepEqual(
    plan.representationBands.map((band) => band.band),
    [...rendererRepresentationBands]
  );
});

test("renderer manifests classify acceleration-structure updates and required denoise stages", () => {
  const manifest = getRendererWorkerManifest();

  assert.deepEqual(rendererAccelerationStructureUpdateClasses, [
    "static",
    "rigid-dynamic",
    "deforming",
    "proxy",
  ]);
  assert.deepEqual(
    manifest.accelerationStructureUpdates.map((entry) => entry.updateClass),
    [...rendererAccelerationStructureUpdateClasses]
  );
  assert.equal(
    manifest.renderStages.find((stage) => stage.key === "denoiseTemporal")
      .required,
    true
  );
});

test("ray-tracing-first render plans retain premium near-field RT while allowing cheaper distant representations", () => {
  const plan = createRayTracingRenderPlan({
    snapshotId: "visual-snapshot-9003",
  });

  const near = plan.representationBands.find((band) => band.band === "near");
  const far = plan.representationBands.find((band) => band.band === "far");
  const horizon = plan.representationBands.find(
    (band) => band.band === "horizon"
  );

  assert.equal(near.rtParticipation, "premium");
  assert.equal(far.rtParticipation, "proxy");
  assert.equal(horizon.rtParticipation, "disabled");
  assert.equal(far.shadowSource, "merged-proxy-casters");
});

test("ray-tracing-first render plans can normalize external representation descriptors", () => {
  const plan = createRayTracingRenderPlan({
    snapshotId: "visual-snapshot-9004",
    profile: "xr",
    representations: [
      {
        band: "near",
        output: "liveGeometry",
        origin: "world-generator",
      },
      {
        band: "far",
        output: "mergedProxy",
        origin: "world-generator",
      },
    ],
  });

  assert.equal(plan.profile, "xr");
  assert.deepEqual(
    plan.representationBands.map((band) => band.band),
    ["near", "far"]
  );
  assert.equal(
    plan.renderStages.find((stage) => stage.key === "primaryVisibility")
      .workerJobKeys.includes("lateLatch"),
    true
  );
});
