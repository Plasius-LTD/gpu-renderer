// Scene configuration, not a second lighting evaluator. All radiance/transport
// remains owned by gpu-lighting and gpu-renderer. Presets are local colour studies.
export const ROOM_LIGHTING_DEFAULTS=Object.freeze({style:'daylight',intensity:1,minimumIntensity:.05,maximumIntensity:4});
const styles={
 daylight:{label:'Original daylight',options:{preset:'neutral-studio',sunDirection:[.18,.93,.24],sunColor:[2.4,2.25,2,1]}},
 'cool-evening':{label:'Cool evening — blue-hour colour study',options:{preset:'neutral-studio',sunDirection:[.18,.93,.24],
  sunColor:[2,2.25,2.45,1],horizonColor:[.43,.52,.62,1],zenithColor:[.2,.27,.36,1],ambientColor:[.025,.029,.035,1]}},
};
export function roomLightingRequest({style=ROOM_LIGHTING_DEFAULTS.style,intensity=ROOM_LIGHTING_DEFAULTS.intensity}={}){
 if(typeof style!=='string'||!Object.hasOwn(styles,style))throw Error('Unknown room lighting style');
 if(!Number.isFinite(intensity)||intensity<ROOM_LIGHTING_DEFAULTS.minimumIntensity||intensity>ROOM_LIGHTING_DEFAULTS.maximumIntensity)throw Error('Invalid room lighting intensity');
 return {style,label:styles[style].label,options:{...structuredClone(styles[style].options),intensity}};
}
export function withRoomLighting(source,receipt,selection){
 const {style,label,options}=roomLightingRequest(selection);
 const lightingOptions=source.createWavefrontEnvironmentLightingOptions(options);
 receipt.lighting={style,label,request:structuredClone(options),resolved:lightingOptions.lightingEnvironment};
 return {...source,lightingOptions};
}
