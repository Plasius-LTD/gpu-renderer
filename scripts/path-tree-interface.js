import { reflectGpuInterface } from "@plasius/gpu-shader/node";
import { WAVEFRONT_COMPUTE_WGSL } from "../src/wavefront-shaders.js";

export function reflectPathTreeInterface() {
  return reflectGpuInterface({
    interfaceId: "plasius.renderer.path-tree",
    interfaceVersion: "1.0.0",
    modules: [{ moduleId: "transport", source: WAVEFRONT_COMPUTE_WGSL }],
    pipelines: [{
      kind: "compute", pipelineId: "compact",
      layout: { bindGroups: [{ group: 0, entries: [{
        group: 0, binding: 6, visibility: ["compute"],
        resource: { kind: "buffer", addressSpace: "storage", access: "read_write",
          recordName: "Counters", minimumBindingSize: 112 },
      }, {
        group: 0, binding: 5, visibility: ["compute"],
        resource: { kind: "buffer", addressSpace: "uniform", access: "read",
          recordName: "FrameConfig", minimumBindingSize: 320 },
      }] }] },
      compute: { moduleId: "transport", entryPoint: "compactAndSwapQueues", constants: {} },
    }],
    modelFacingRecordNames: ["PathNode"],
    modelFacingBindings: [],
    semantics: [],
  });
}
