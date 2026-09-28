export const STABLE_REFERENCE=Object.freeze({width:3840,height:2160,maxDepth:6,maximumSpp:32,sampler:"stable-pattern",denoise:false});

export function validateStableReferenceFrame(frame,plan){
 const check=(condition,message)=>{if(!condition)throw new Error("Stable reference: "+message);};
 check(frame.width===STABLE_REFERENCE.width&&frame.height===STABLE_REFERENCE.height,"native dimensions changed");
 check(frame.mode==="radial"&&frame.sampler===STABLE_REFERENCE.sampler,"sampling mode changed");
 check(frame.diagnostics===true&&frame.fused===false&&frame.validationErrors===0,"invalid diagnostic frame");
 check(frame.actualSamples===plan.totalSamples,"completed sample total mismatch");
 for(const band of plan.bands)check(frame.actualHistogram?.[band.spp]===band.pixels,"completed sample histogram mismatch");
 return true;
}
