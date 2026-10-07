import { reflectGpuInterface } from "@plasius/gpu-shader/node";
import { ADAPTIVE_COMPLETION_WGSL } from "../src/wavefront-adaptive-completion-shader.js";

export function reflectAdaptiveCompletionInterface() {
  const entries = [[0, "uniform", "read", "FrameConfig", 320], [1, "storage", "read_write", null, 64],
    [2, "storage", "read", null, 4], [3, "storage", "read_write", null, 32], [4, "storage", "read", "CompletionControl", 16],
    [5, "storage", "read_write", "Counters", 112], [6, "uniform", "read", "AdaptiveResolveConfig", 48]];
  return reflectGpuInterface({ interfaceId: "plasius.renderer.adaptive-completion", interfaceVersion: "1.0.0",
    modules: [{ moduleId: "completion", source: ADAPTIVE_COMPLETION_WGSL }],
    pipelines: [{ kind: "compute", pipelineId: "produce-complete-camera-sample", layout: { bindGroups: [{ group: 0,
      entries: entries.map(([binding, addressSpace, access, recordName, minimumBindingSize]) => ({ group: 0, binding, visibility: ["compute"],
        resource: { kind: "buffer", addressSpace, access, recordName, minimumBindingSize } })),
    }] }, compute: { moduleId: "completion", entryPoint: "produce_complete_camera_sample", constants: {} } }],
    modelFacingRecordNames: ["PathNode", "AdaptiveCameraSample", "AdaptiveResolveConfig", "FrameConfig", "Counters"], modelFacingBindings: [], semantics: [],
  });
}
