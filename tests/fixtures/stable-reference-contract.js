export const STABLE_REFERENCE=Object.freeze({width:3840,height:2160,maxDepth:6,maximumSpp:32,sampler:"stable-pattern",denoise:false});
export const DEFAULT_REFERENCE=Object.freeze({...STABLE_REFERENCE,sampler:"fixed-pattern"});

export function referenceSettingsFor(sampler=DEFAULT_REFERENCE.sampler){
 if(sampler==="fixed-pattern")return DEFAULT_REFERENCE;
 if(sampler==="stable-pattern")return STABLE_REFERENCE;
 throw new Error("Unknown reference sampler");
}

export function referenceArtifactStem(sampler){
 return referenceSettingsFor(sampler).sampler==="fixed-pattern"?"4k-fixed-pattern-6-bounces":"4k-stable-6-bounces";
}

export function validateStableReferenceFrame(frame,plan,settings=STABLE_REFERENCE){
 const check=(condition,message)=>{if(!condition)throw new Error("Adaptive reference: "+message);};
 const expected=referenceSettingsFor(settings.sampler);
 check(Object.entries(expected).every(([key,value])=>settings[key]===value),"settings changed");
 check(frame.width===settings.width&&frame.height===settings.height,"native dimensions changed");
 check(frame.mode==="radial"&&frame.sampler===settings.sampler,"sampling mode changed");
 check(frame.diagnostics===true&&frame.fused===false&&frame.validationErrors===0,"invalid diagnostic frame");
 check(frame.actualSamples===plan.totalSamples,"completed sample total mismatch");
 for(const band of plan.bands)check(frame.actualHistogram?.[band.spp]===band.pixels,"completed sample histogram mismatch");
 return true;
}
