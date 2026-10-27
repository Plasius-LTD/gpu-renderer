import {MAX_PATH_TRACING_DEPTH,PATH_VERTEX_RECORD_BYTES} from './wavefront-core.js';
export const OPTICAL_INTERFACE_BUDGET_FLAG='renderer.transport.opticalInterfaceBudget.enabled';
export const MAX_OPTICAL_INTERFACES=64;
export const MAX_PHYSICAL_PATH_EVENTS=MAX_PATH_TRACING_DEPTH+MAX_OPTICAL_INTERFACES;
export const DEFAULT_OPTICAL_BUDGET_ADDITIONAL_BYTES=128*1024**2;
export function pathEventCapacity(config){return config.maximumPathEvents??config.maxDepth;}
export function resolveOpticalInterfaceBudget(options,{enabled,maxDepth,tilePixelCapacity,strict,deferred,roughSplitting}){
 const input=options.opticalInterfaceBudget??{};
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['maximumInterfaces','maximumAdditionalBytes'].includes(k)))throw new TypeError('Invalid opticalInterfaceBudget options');
 const maximumInterfaces=input.maximumInterfaces??MAX_OPTICAL_INTERFACES;
 const maximumAdditionalBytes=input.maximumAdditionalBytes??DEFAULT_OPTICAL_BUDGET_ADDITIONAL_BYTES;
 if(!Number.isInteger(maximumInterfaces)||maximumInterfaces<1||maximumInterfaces>MAX_OPTICAL_INTERFACES||!Number.isSafeInteger(maximumAdditionalBytes)||maximumAdditionalBytes<1)throw new RangeError('Invalid opticalInterfaceBudget limits');
 if(enabled&&(!strict||!deferred||roughSplitting))throw new RangeError('opticalInterfaceBudget requires strict deferred bounded+nested transport without rough splitting');
 const additionalPathBytes=enabled?tilePixelCapacity*maximumInterfaces*PATH_VERTEX_RECORD_BYTES:0;
 if(additionalPathBytes>maximumAdditionalBytes)throw new RangeError('opticalInterfaceBudget additional path allocation exceeds maximumAdditionalBytes');
 return Object.freeze({enabled,maximumInterfaces:enabled?maximumInterfaces:0,maximumAdditionalBytes,additionalPathBytes,maximumPathEvents:maxDepth+(enabled?maximumInterfaces:0)});
}

// Same FrameConfig validation in fixed transport and all complete-count paths.
export const OPTICAL_EVENT_CONFIG_WGSL=`
fn path_event_config_valid() -> bool {
  if ((config.transportExperimentFlags & 131072u) == 0u) { return config.maxDepth >= 1u && config.maxDepth <= ${MAX_PATH_TRACING_DEPTH}u; }
  let ordinary = config.cameraUp.w;
  let optical = config.cameraRight.w;
  return (config.transportExperimentFlags & 49152u) == 49152u &&
    ordinary >= 1.0 && ordinary <= ${MAX_PATH_TRACING_DEPTH}.0 && floor(ordinary) == ordinary &&
    optical >= 1.0 && optical <= ${MAX_OPTICAL_INTERFACES}.0 && floor(optical) == optical &&
    config.maxDepth == u32(ordinary + optical) && config.maxDepth <= ${MAX_PHYSICAL_PATH_EVENTS}u;
}
`;
export const OPTICAL_INTERFACE_BUDGET_WGSL=OPTICAL_EVENT_CONFIG_WGSL+`
fn optical_interface_budget_enabled() -> bool { return transport_experiment_enabled(131072u); }
fn optical_interface_eligible(hit: HitRecord) -> bool {
  return dielectric_event(hit) && medium_valid(hit.mediumRefId) &&
    !rough_dielectric_active(hit) && hit.materialExtension.z == 1.0;
}
fn ordinary_path_events(ray: RayRecord) -> u32 { return ray.flags >> 24u; }
fn path_budget_state_valid(ray: RayRecord) -> bool {
  if (!optical_interface_budget_enabled()) { return true; }
  if (!path_event_config_valid() || ray.bounce >= config.maxDepth) { return false; }
  let ordinary = ordinary_path_events(ray);
  if (ordinary > ray.bounce || ordinary >= u32(config.cameraUp.w)) { return false; }
  return ray.bounce - ordinary <= u32(config.cameraRight.w);
}
fn path_budget_exhausted(ray: RayRecord, hit: HitRecord) -> bool {
  if (ray.bounce + 1u >= config.maxDepth) { return true; }
  if (!optical_interface_budget_enabled()) { return false; }
  let ordinary = ordinary_path_events(ray);
  if (optical_interface_eligible(hit)) { return ray.bounce - ordinary >= u32(config.cameraRight.w); }
  return ordinary + 1u >= u32(config.cameraUp.w);
}
fn continuation_budget_flags(ray: RayRecord, hit: HitRecord, flags: u32) -> u32 {
  if (!optical_interface_budget_enabled()) { return flags; }
  let ordinary = ordinary_path_events(ray) + select(1u, 0u, optical_interface_eligible(hit));
  return (flags & 0x00ffffffu) | (ordinary << 24u);
}
`;
