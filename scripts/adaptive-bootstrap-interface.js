import { reflectGpuInterface } from "@plasius/gpu-shader/node";
import { ADAPTIVE_BOOTSTRAP_WGSL } from "../src/wavefront-adaptive-bootstrap-shader.js";

export async function reflectAdaptiveBootstrapInterface() {
  const entries = [
    [0, 0, "storage", "read", null, 96], [0, 3, "storage", "read_write", null, 16],
    [0, 5, "uniform", "read", "FrameConfig", 320], [0, 6, "storage", "read_write", "Counters", 112],
    [0, 22, "storage", "read_write", null, 64],
    [1, 0, "storage", "read", "AdaptiveBootstrapIds", 4],
    [1, 1, "storage", "read_write", "AdaptiveBootstrapControl", 16],
    [1, 2, "uniform", "read", "AdaptiveBootstrapTile", 32],
  ].map(([group, binding, addressSpace, access, recordName, minimumBindingSize]) => ({ group, binding, visibility: ["compute"],
    resource: { kind: "buffer", addressSpace, access, recordName, minimumBindingSize },
  }));
  return reflectGpuInterface({
    interfaceId: "plasius.renderer.adaptive-bootstrap", interfaceVersion: "2.0.0",
    modules: [{ moduleId: "adaptive-bootstrap", source: ADAPTIVE_BOOTSTRAP_WGSL }],
    pipelines: ["validate_compacted_sample", "initialize_compacted_sample"].map((entryPoint) => ({
      kind: "compute", pipelineId: entryPoint,
      layout: { bindGroups: [0, 1].map((group) => ({ group, entries: entries.filter((entry) => entry.group === group) })) },
      compute: { moduleId: "adaptive-bootstrap", entryPoint, constants: {} },
    })),
    modelFacingRecordNames: ["RayRecord", "FrameConfig", "Counters", "PathNode", "AdaptiveBootstrapControl", "AdaptiveBootstrapTile"],
    modelFacingBindings: [], semantics: [],
  });
}
