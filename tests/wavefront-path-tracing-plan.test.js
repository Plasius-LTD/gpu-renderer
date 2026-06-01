import assert from "node:assert/strict";
import test from "node:test";
import {
  createRayTracingRenderPlan,
  createWavefrontPathTracingPlan,
  rendererWavefrontBufferSchemaVersion,
  rendererWavefrontHitTypes,
  rendererWavefrontPassOrder,
  rendererWavefrontQueuePairStrategy,
} from "../src/index.js";

test("wavefront plan publishes versioned renderer-owned buffer contracts", () => {
  const plan = createWavefrontPathTracingPlan();

  assert.equal(plan.schemaVersion, rendererWavefrontBufferSchemaVersion);
  assert.equal(plan.bufferContracts.ray.recordName, "RayRecord");
  assert.equal(plan.bufferContracts.hit.recordName, "HitRecord");
  assert.equal(plan.bufferContracts.surface.recordName, "SurfaceRecord");
  assert.equal(
    plan.bufferContracts.materialReference.recordName,
    "MaterialReferenceRecord"
  );
  assert.equal(plan.bufferContracts.mediumReference.recordName, "MediumReferenceRecord");
  assert.equal(plan.bufferContracts.accumulation.recordName, "AccumulationRecord");
  assert.deepEqual(
    plan.bufferContracts.hit.fields.map((field) => field.name),
    [
      "rayId",
      "sourcePixelId",
      "hitType",
      "distance",
      "entityId",
      "instanceId",
      "primitiveId",
      "materialId",
      "barycentrics",
      "uv",
      "geometricNormal",
      "shadingNormal",
      "frontFace",
    ]
  );
});

test("wavefront plan uses ping-pong queues and breadth-first bounce ordering", () => {
  const plan = createWavefrontPathTracingPlan({
    maxDepth: 3,
    queueCapacity: 2048,
    explicitLightSampling: true,
    accumulationResetEpoch: 12,
  });

  assert.equal(plan.maxDepth, 3);
  assert.equal(plan.queueCapacity, 2048);
  assert.equal(plan.explicitLightSampling, true);
  assert.equal(plan.accumulationResetEpoch, 12);
  assert.equal(plan.queueLayout.strategy, rendererWavefrontQueuePairStrategy);
  assert.deepEqual(plan.queueLayout.queues, [
    { name: "active", role: "current-bounce" },
    { name: "next", role: "next-bounce" },
  ]);
  assert.deepEqual(plan.bounceSchedule, [
    {
      bounce: 0,
      readQueue: "active",
      writeQueue: "next",
      passOrder: rendererWavefrontPassOrder,
    },
    {
      bounce: 1,
      readQueue: "next",
      writeQueue: "active",
      passOrder: rendererWavefrontPassOrder,
    },
    {
      bounce: 2,
      readQueue: "active",
      writeQueue: "next",
      passOrder: rendererWavefrontPassOrder,
    },
  ]);
});

test("wavefront plan encodes emissive and environment termination policy explicitly", () => {
  const plan = createWavefrontPathTracingPlan();

  assert.deepEqual(rendererWavefrontHitTypes, [
    "surface",
    "emissive",
    "environment",
    "transparent",
    "miss",
  ]);
  assert.deepEqual(plan.terminationPolicy.terminalHitTypes, [
    "emissive",
    "environment",
    "miss",
  ]);
  assert.deepEqual(plan.terminationPolicy.continuationHitTypes, [
    "surface",
    "transparent",
  ]);
  assert.deepEqual(plan.terminationPolicy.emissive, {
    action: "accumulate-and-stop",
    contributesRadiance: true,
  });
  assert.deepEqual(plan.terminationPolicy.environment, {
    action: "accumulate-and-stop",
    contributesRadiance: true,
  });
  assert.deepEqual(plan.terminationPolicy.miss, {
    action: "accumulate-environment-or-dark-stop",
    contributesRadiance: true,
  });
});

test("ray-tracing render plans expose the wavefront contracts for downstream packages", () => {
  const plan = createRayTracingRenderPlan({
    snapshotId: "visual-snapshot-wavefront-11",
    wavefront: {
      maxDepth: 5,
      queueCapacity: 4096,
      explicitLightSampling: false,
      accumulationResetEpoch: 7,
    },
  });

  assert.equal(plan.wavefront.maxDepth, 5);
  assert.equal(plan.wavefront.queueCapacity, 4096);
  assert.equal(plan.wavefront.accumulationResetEpoch, 7);
  assert.equal(plan.wavefront.bufferContracts.accumulation.fields[4].name, "resetEpoch");
});
