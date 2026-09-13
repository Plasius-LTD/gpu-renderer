import { reflectGpuInterface, generateGpuInterfaceArtifacts } from "@plasius/gpu-shader/node";
import { ADAPTIVE_PRIMARY_WGSL } from "../src/wavefront-adaptive-primary-shader.js";

export async function reflectAdaptivePrimaryInterface() {
  const records = ["AdaptivePrimaryWords", "AdaptivePrimaryWords", "AdaptivePrimaryControl", "AdaptivePrimaryDispatch", "AdaptivePrimaryConfig"];
  const sizes = [4, 4, 16, 12, 32];
  const entries = records.map((recordName, binding) => ({ group: 0, binding, visibility: ["compute"],
    resource: { kind: "buffer", addressSpace: binding === 4 ? "uniform" : "storage",
      access: binding === 0 || binding === 4 ? "read" : "read_write", recordName, minimumBindingSize: sizes[binding] },
  }));
  return reflectGpuInterface({
    interfaceId: "plasius.renderer.adaptive-primary", interfaceVersion: "1.0.0",
    modules: [{ moduleId: "adaptive-primary", source: ADAPTIVE_PRIMARY_WGSL }],
    pipelines: ["initialize_primary_worklist", "compact_primary_tier", "finalize_primary_dispatch"].map((entryPoint) => ({
      kind: "compute", pipelineId: entryPoint, layout: { bindGroups: [{ group: 0,
        entries: entries.filter(({ binding }) => entryPoint === "initialize_primary_worklist"
          || (entryPoint === "compact_primary_tier" ? binding !== 3 : [1, 2, 3].includes(binding))),
      }] },
      compute: { moduleId: "adaptive-primary", entryPoint, constants: {} },
    })),
    modelFacingRecordNames: [...new Set(records)].slice(1), modelFacingBindings: [], semantics: [],
  });
}

export async function generateAdaptivePrimaryConstants() {
  const manifest = await reflectAdaptivePrimaryInterface();
  return "// Generated from final adaptive primary WGSL by @plasius/gpu-shader; checked by tests.\n"
    + `// Source SHA-256: ${manifest.modules[0].sha256}\n`
    + generateGpuInterfaceArtifacts(manifest).byteConstants.replaceAll(" as const", "");
}
