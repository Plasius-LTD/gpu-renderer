const check=(v,m)=>{if(!v)throw new Error(m);};
export const hashBytes=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),n=>n.toString(16).padStart(2,"0")).join("");
export async function loadOriginalEames(receipt,signal){
  const started=performance.now(),response=await fetch("/lighting/demo/eames-environments/eames-source-manifest.json",{signal});
  check(response.ok,"Missing original Eames manifest");const manifest=await response.json();
  check(manifest.siteCommit===receipt.provenance.sources.site,"Eames asset commit mismatch");
  for(const file of manifest.files){
    const source=await fetch(`/eames/${file.name}`,{signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
    check(source.ok,`Missing Eames asset ${file.name}`);const bytes=await source.arrayBuffer();
    check(bytes.byteLength===file.bytes&&await hashBytes(bytes)===file.sha256,`Eames integrity failed: ${file.name}`);
  }
  const [{loadGltfModel},{createProductStudioMeshes},{createWavefrontEnvironmentLightingOptions},{createEamesTraceScene,assertEamesRendererAdmission}]=await Promise.all([
    import("/shared/src/gltf-loader.js"),import("/shared/src/product-studio-runtime.js"),import("/lighting/src/index.js"),import("/lighting/demo/eames-environments/eames-fidelity.js")]);
  const model=await loadGltfModel(new URL("/eames/Eames_Lounge_Chair_Ottoman.gltf",location.href).href);
  const admitted=createEamesTraceScene(model,{createProductStudioMeshes,lightingOptions:createWavefrontEnvironmentLightingOptions({preset:"product-studio"})});
  receipt.scene={...admitted.evidence,manifest,assetVerificationAndSceneSetupMs:performance.now()-started};
  return {...admitted,assertEamesRendererAdmission};
}
