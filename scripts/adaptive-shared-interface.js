import { reflectGpuInterface } from "@plasius/gpu-shader/node";
import { SHARED_ADAPTIVE_WGSL } from "../src/wavefront-adaptive-shared-shader.js";
import { SHARED_ADAPTIVE_BINDING_SIZES, SHARED_ADAPTIVE_ENTRIES } from "../src/wavefront-adaptive-shared.js";

export function reflectSharedAdaptiveInterface() {
  const names=["FrameConfig","SharedPhase","SharedWords","SharedWords","SharedControl","SharedDispatch",null,null,"Counters",null,null];
  const entries=SHARED_ADAPTIVE_BINDING_SIZES.map((size,binding)=>({group:0,binding,visibility:["compute"],resource:{kind:"buffer",addressSpace:binding<2?"uniform":"storage",access:binding<2?"read":"read_write",recordName:names[binding],minimumBindingSize:binding===8?112:size}}));
  // Runtime shares a superset layout; reflection describes each entry's used subset.
  const used={initialize_shared_phase:[0,1,2,3,4,5,6,7,9,10],compact_shared_phase:[0,1,2,3,4,6,7,9,10],finalize_shared_phase:[0,4,5],validate_shared_phase:[0,1,2,3,4,6,7,9,10],prepare_shared_sample:[0,1,2,3,4,6,7,8,9,10],commit_shared_sample:[0,1,2,3,4,6,7,8,9,10],resolve_shared_frame:[0,1,2,3,4,6,7,9,10]};
  return reflectGpuInterface({interfaceId:"plasius.renderer.adaptive-shared",interfaceVersion:"1.0.0",modules:[{moduleId:"shared",source:SHARED_ADAPTIVE_WGSL}],
    pipelines:Object.values(SHARED_ADAPTIVE_ENTRIES).map(entryPoint=>({kind:"compute",pipelineId:entryPoint,layout:{bindGroups:[{group:0,entries:entries.filter(e=>used[entryPoint].includes(e.binding))}]},compute:{moduleId:"shared",entryPoint,constants:{}}})),
    modelFacingRecordNames:["SharedPhase","SharedControl","SharedDispatch","FrameConfig","RayRecord","PathNode","Counters"],modelFacingBindings:[],semantics:[]});
}
