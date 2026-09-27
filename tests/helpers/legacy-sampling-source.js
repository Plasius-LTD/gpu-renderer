import assert from "node:assert/strict";
import { WAVEFRONT_PROGRESSIVE_SAMPLING_WGSL } from "../../src/wavefront-progressive-sampling.js";
// Keep the old pinned transport hashes, removing ONLY the new opt-in sampler
// code. Physical flag-off HDR identity additionally checks actual execution.
export function legacySamplingSource(source){
  const branch=`  if(transport_experiment_enabled(256u) || transport_experiment_enabled(512u)){
    let words=progressive_sample_words(pixelId,sampleId,bounce,sample_frame_index(frameIndex),dimension,transport_experiment_enabled(512u));
    return vec2<f32>(words>>vec2<u32>(8u))/16777216.0;
  }
`;
  assert.equal(source.split(branch).length,2);
  assert.equal(source.split("\n"+WAVEFRONT_PROGRESSIVE_SAMPLING_WGSL).length,2);
  return source.replace(branch,"").replace("\n"+WAVEFRONT_PROGRESSIVE_SAMPLING_WGSL,"");
}
