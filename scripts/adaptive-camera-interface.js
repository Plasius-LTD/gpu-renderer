import { reflectGpuInterface } from "@plasius/gpu-shader/node";
import { ADAPTIVE_CAMERA_WGSL } from "../src/wavefront-adaptive-camera-shader.js";

export async function reflectAdaptiveCameraInterface() {
  const entries = [
    [0, 0, "storage", "read_write", null, 96],
    [0, 5, "uniform", "read", "FrameConfig", 320],
    [1, 0, "storage", "read", "AdaptiveCameraIds", 4],
    [1, 1, "storage", "read", "AdaptiveCameraControl", 16],
    [1, 2, "uniform", "read", "AdaptiveCameraTile", 32],
  ].map(([group, binding, addressSpace, access, recordName, minimumBindingSize]) => ({ group, binding, visibility: ["compute"],
    resource: { kind: "buffer", addressSpace, access, recordName, minimumBindingSize },
  }));
  return reflectGpuInterface({
    interfaceId: "plasius.renderer.adaptive-camera", interfaceVersion: "1.0.0",
    modules: [{ moduleId: "adaptive-camera", source: ADAPTIVE_CAMERA_WGSL }],
    pipelines: [{ kind: "compute", pipelineId: "generateCompactedCameraRays",
      layout: { bindGroups: [0, 1].map((group) => ({ group, entries: entries.filter((entry) => entry.group === group) })) },
      compute: { moduleId: "adaptive-camera", entryPoint: "generateCompactedCameraRays", constants: {} },
    }],
    modelFacingRecordNames: ["RayRecord", "FrameConfig", "AdaptiveCameraControl", "AdaptiveCameraTile"],
    modelFacingBindings: [], semantics: [],
  });
}
