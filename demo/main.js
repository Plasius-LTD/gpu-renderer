import {
  createRayTracingRenderPlan,
  createWavefrontPathTracingComputeRenderer,
  supportsWavefrontPathTracingCompute,
} from "../dist/index.js";
import {
  createWavefrontEnvironmentLightingOptions,
} from "../../gpu-lighting/src/index.js";

const root = globalThis.document?.getElementById("app");
if (!root) {
  throw new Error("Renderer demo root element was not found.");
}

const lightingOptions = createWavefrontEnvironmentLightingOptions({
  preset: "moonlit-harbor",
  intensity: 1.08,
});
const renderPlan = createRayTracingRenderPlan({
  snapshotId: "wavefront-demo-mesh-bvh-lighting-owned-environment",
  wavefront: {
    maxDepth: 6,
    queueCapacity: 128 * 128,
  },
});

function createQuadMesh({ id, corners, color, emission, materialKind = "diffuse" }) {
  const [a, b, c, d] = corners;
  const edge1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const edge2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const normal = [
    edge1[1] * edge2[2] - edge1[2] * edge2[1],
    edge1[2] * edge2[0] - edge1[0] * edge2[2],
    edge1[0] * edge2[1] - edge1[1] * edge2[0],
  ];
  const length = Math.hypot(...normal) || 1;
  const unitNormal = normal.map((value) => value / length);

  return {
    id,
    positions: corners.flat(),
    indices: [0, 1, 2, 0, 2, 3],
    normals: [unitNormal, unitNormal, unitNormal, unitNormal].flat(),
    color,
    emission,
    materialKind,
  };
}

function createBoxMesh({ id, min, max, color, materialKind = "diffuse", metallic = 0, roughness = 0.55 }) {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const faces = [
    { normal: [0, 0, 1], corners: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] },
    { normal: [0, 0, -1], corners: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]] },
    { normal: [1, 0, 0], corners: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]] },
    { normal: [-1, 0, 0], corners: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]] },
    { normal: [0, 1, 0], corners: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]] },
    { normal: [0, -1, 0], corners: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] },
  ];
  const positions = [];
  const normals = [];
  const indices = [];

  faces.forEach((face, faceIndex) => {
    const base = faceIndex * 4;
    positions.push(...face.corners.flat());
    normals.push(face.normal, face.normal, face.normal, face.normal);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });

  return {
    id,
    positions,
    indices,
    normals: normals.flat(),
    color,
    materialKind,
    metallic,
    roughness,
  };
}

function createDemoMeshes() {
  return [
    createQuadMesh({
      id: 100,
      corners: [[-3, -0.9, 2], [3, -0.9, 2], [3, -0.9, -3], [-3, -0.9, -3]],
      color: [0.52, 0.6, 0.62, 1],
    }),
    createQuadMesh({
      id: 101,
      corners: [[-3, -0.9, -3], [3, -0.9, -3], [3, 3, -3], [-3, 3, -3]],
      color: [0.5, 0.49, 0.46, 1],
    }),
    createQuadMesh({
      id: 102,
      corners: [[-3, -0.9, -3], [-3, 3, -3], [-3, 3, 2], [-3, -0.9, 2]],
      color: [0.42, 0.52, 0.62, 1],
    }),
    createQuadMesh({
      id: 103,
      corners: [[3, -0.9, -3], [3, -0.9, 2], [3, 3, 2], [3, 3, -3]],
      color: [0.58, 0.46, 0.42, 1],
    }),
    createQuadMesh({
      id: 104,
      corners: [[-0.65, 2.55, -0.9], [0.65, 2.55, -0.9], [0.65, 2.55, -1.9], [-0.65, 2.55, -1.9]],
      color: [1, 0.93, 0.76, 1],
      emission: [9, 8.2, 6.4, 1],
      materialKind: "emissive",
    }),
    createBoxMesh({
      id: 110,
      min: [-1.55, -0.9, -1.65],
      max: [-0.55, 0.2, -0.65],
      color: [0.72, 0.7, 0.64, 1],
      materialKind: "metal",
      metallic: 0.7,
      roughness: 0.18,
    }),
    createBoxMesh({
      id: 111,
      min: [0.35, -0.9, -1.25],
      max: [1.35, 0.55, -0.25],
      color: [0.54, 0.68, 0.78, 0.92],
      materialKind: "dielectric",
      roughness: 0.08,
    }),
    createBoxMesh({
      id: 112,
      min: [-0.25, -0.9, 0.05],
      max: [0.65, -0.05, 0.95],
      color: [0.05, 0.08, 0.13, 1],
      materialKind: "diffuse",
    }),
  ];
}

function renderShell() {
  root.innerHTML = `
    <main class="demo-shell">
      <section class="render-stage" aria-label="Wavefront path tracing render">
        <canvas id="wavefrontCanvas" width="1280" height="720"></canvas>
      </section>
      <aside class="inspector" aria-live="polite">
        <p class="eyebrow">@plasius/gpu-renderer</p>
        <h1>Mesh BVH Wavefront</h1>
        <p class="copy">
          Direct WebGPU wavefront execution with triangle mesh BVH construction
          and emissive mesh path termination.
        </p>
        <dl class="metrics" id="metrics"></dl>
      </aside>
    </main>
  `;

  const style = document.createElement("style");
  style.textContent = `
    :root {
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #080b0f;
      color: #eef4f8;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: #080b0f;
    }

    .demo-shell {
      min-height: 100vh;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 340px;
      gap: 0;
    }

    .render-stage {
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #111820;
      padding: 16px;
      box-sizing: border-box;
    }

    canvas {
      width: min(100%, calc((100vh - 32px) * 16 / 9));
      height: auto;
      max-height: calc(100vh - 32px);
      aspect-ratio: 16 / 9;
      display: block;
    }

    .inspector {
      border-left: 1px solid rgba(255, 255, 255, 0.12);
      padding: 28px;
      background: #11161d;
    }

    .eyebrow {
      margin: 0 0 10px;
      color: #88c7ff;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    h1 {
      margin: 0;
      font-size: 1.7rem;
      line-height: 1.15;
      letter-spacing: 0;
    }

    .copy {
      color: #bdc9d4;
      line-height: 1.55;
    }

    .metrics {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
      margin: 24px 0 0;
    }

    .metrics div {
      display: grid;
      gap: 4px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    dt {
      color: #8f9fac;
      font-size: 0.78rem;
    }

    dd {
      margin: 0;
      color: #f4f8fb;
      font-weight: 700;
    }

    @media (max-width: 920px) {
      .demo-shell {
        grid-template-columns: 1fr;
      }

      .render-stage {
        min-height: 62vh;
      }

      canvas {
        width: 100%;
        max-height: none;
      }

      .inspector {
        border-left: 0;
        border-top: 1px solid rgba(255, 255, 255, 0.12);
      }
    }
  `;
  document.head.appendChild(style);
}

function setMetricValues(values) {
  const metrics = document.getElementById("metrics");
  if (!metrics) {
    return;
  }

  metrics.innerHTML = values
    .map(
      ([label, value]) => `
        <div>
          <dt>${label}</dt>
          <dd>${value}</dd>
        </div>
      `
    )
    .join("");
}

function summarizeMemory(memory) {
  return `${(memory.totalHotBufferBytes / 1024 / 1024).toFixed(2)} MiB hot buffers`;
}

function withTimeout(promise, ms, fallback) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((resolve) => {
      timer = window.setTimeout(() => resolve(fallback), ms);
    }),
  ]).finally(() => {
    if (timer !== null) {
      window.clearTimeout(timer);
    }
  });
}

async function mountDemo() {
  renderShell();
  const canvas = document.getElementById("wavefrontCanvas");

  if (!supportsWavefrontPathTracingCompute()) {
    setMetricValues([
      ["status", window.isSecureContext ? "WebGPU unavailable" : "secure context required"],
      ["render method", "wavefront path tracing"],
      ["environment source", lightingOptions.lightingEnvironment.preset],
    ]);
    return null;
  }

  setMetricValues([
    ["status", "creating renderer"],
    ["render method", "mesh BVH tiled wavefront"],
    ["environment source", lightingOptions.lightingEnvironment.preset],
  ]);
  const renderer = await createWavefrontPathTracingComputeRenderer({
    canvas,
    width: 1280,
    height: 720,
    maxDepth: 6,
    tileSize: 128,
    displayQuality: true,
    denoise: true,
    meshes: createDemoMeshes(),
    ...lightingOptions,
  });
  setMetricValues([
    ["status", "submitting frame"],
    ["render method", "mesh BVH tiled wavefront"],
    ["environment source", lightingOptions.lightingEnvironment.preset],
  ]);
  const stats = renderer.renderOnce();
  setMetricValues([
    ["status", `rendered frame ${stats.frame}`],
    ["render method", "mesh BVH tiled wavefront"],
    ["resolution", `${stats.width}x${stats.height}`],
    ["primary rays", stats.primaryRays.toLocaleString("en-GB")],
    ["triangles", stats.triangleCount.toLocaleString("en-GB")],
    ["BVH nodes", stats.bvhNodeCount.toLocaleString("en-GB")],
    ["max depth", `${stats.maxDepth} bounces`],
    ["tiles", `${stats.tiles} @ ${stats.tileSize}px`],
    ["lighting preset", lightingOptions.lightingEnvironment.preset],
    ["environment mode", `${lightingOptions.environmentLighting.mode}`],
    ["probe luminance", "pending"],
    ["memory", summarizeMemory(stats.memory)],
  ]);
  await withTimeout(
    renderer.device.queue.onSubmittedWorkDone?.() ?? Promise.resolve(),
    1500,
    null
  );
  const probe = await withTimeout(
    renderer.readOutputProbe({ x: 640, y: 360 }).catch(() => null),
    1500,
    null
  );

  setMetricValues([
    ["status", `rendered frame ${stats.frame}`],
    ["render method", "mesh BVH tiled wavefront"],
    ["resolution", `${stats.width}x${stats.height}`],
    ["primary rays", stats.primaryRays.toLocaleString("en-GB")],
    ["triangles", stats.triangleCount.toLocaleString("en-GB")],
    ["BVH nodes", stats.bvhNodeCount.toLocaleString("en-GB")],
    ["max depth", `${stats.maxDepth} bounces`],
    ["tiles", `${stats.tiles} @ ${stats.tileSize}px`],
    ["lighting preset", lightingOptions.lightingEnvironment.preset],
    ["environment mode", `${lightingOptions.environmentLighting.mode}`],
    ["probe luminance", probe ? probe.luminance.toFixed(4) : "timeout"],
    ["memory", summarizeMemory(stats.memory)],
  ]);

  window.render_game_to_text = () =>
    JSON.stringify({
      surface: "gpu-renderer-wavefront-demo",
      geometryMode: "mesh-bvh-display-quality",
      displayQuality: true,
      requiresMeshBvhForDisplayQuality: true,
      requiresTriangleMeshForProductStudio: true,
      renderer: renderer.getSnapshot(),
      lighting: lightingOptions.lightingEnvironment,
      renderPlan: {
        stages: renderPlan.renderStages.map((stage) => stage.key),
        wavefrontPasses: renderPlan.wavefront.bounceSchedule[0]?.passOrder ?? [],
      },
      probe,
    });

  return renderer;
}

let activeRenderer = null;
mountDemo()
  .then((renderer) => {
    activeRenderer = renderer;
  })
  .catch((error) => {
    renderShell();
    setMetricValues([
      ["status", "render failed"],
      ["error", error instanceof Error ? error.message : String(error)],
      ["environment source", lightingOptions.lightingEnvironment.preset],
    ]);
  });

window.addEventListener(
  "pagehide",
  () => {
    activeRenderer?.destroy?.();
  },
  { once: true }
);
